const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const CSON = require("cson-parser");
const { Emitter, File, CompositeDisposable } = require("atom");

const { Snippet } = require("./snippet");
const { SnippetsStore } = require("./snippets-store");
const { ExpansionManager } = require("./expansion-manager");
const { SnippetParser } = require("./snippet-parser");
const { getOrCompute } = require("./util");
const { SnippetsStatusView } = require("./snippets-status-view");

const Priority = Object.freeze({
  User: 2,
  Community: 1,
  Bundled: 0,
});

class SnippetsPlus {
  constructor() {
    this.subscriptions = new CompositeDisposable();

    this.packagesWithSnippetsDisabled = new Set();

    this.expansionsByEditor = new WeakMap();

    // When working with package load / activation / etc.,
    // we use async operations. Theoretically, we might receive
    // a load, schedule async work, and receive the activate / unload
    // before it completes. This property allows events to be queued,
    // so they are handled in the correct order. The performance impact
    // should be negligible, as these operations are infrequent.
    this.packageOperationsQueue = new Map();

    this.loadedPackages = new Map(); // packageName -> PackageSnippets
    this.userSnippets = new Map();
    this.loadedSnippets = new SnippetsStore(this);

    this.statusBarView = undefined;
    this.emitter = new Emitter();
  }

  clearAll() {
    this.loadedSnippets.clearAll();
  }

  activate() {
    this.parser = new SnippetParser();

    this.subscriptions.add(
      atom.workspace.addOpener((uri) => {
        if (uri === "atom://.atom/snippets") {
          return atom.workspace.openTextFile(this.getUserSnippetsPath());
        }
      })
    );

    this.subscriptions.add(
      atom.config.observe("core.packagesWithSnippetsDisabled", (value) => {
        this.onDisabledSnippetPackagesDidChange(value);
      })
    );

    this.observeAll();

    const snippets = this;
    this.subscriptions.add(
      atom.commands.add("atom-text-editor", {
        "snippets:expand": function (event) {
          const editor = this.getModel();
          if (
            !snippets.expandSnippetsUnderCursors(
              editor,
              snippets.getSnippetParser()
            )
          ) {
            event.abortKeyBinding();
          }
        },

        "snippets:next-tab-stop": function (event) {
          const editor = this.getModel();
          if (!snippets.gotoNextTabStop(editor)) {
            event.abortKeyBinding();
          }
        },

        "snippets:previous-tab-stop": function (event) {
          const editor = this.getModel();
          if (!snippets.gotoPreviousTabStop(editor)) {
            event.abortKeyBinding();
          }
        },

        "snippets:available": function (event) {
          event.abortKeyBinding();
        },

        "snippets:cancel": function (event) {
          const editor = this.getModel();
          if (!snippets.cancelExpansions(editor)) {
            event.abortKeyBinding();
          }
        },
      })
    );
  }

  expandSnippetsUnderCursors(editor, parser) {
    const expManager = getOrCompute(
      this.expansionsByEditor,
      editor,
      () => new ExpansionManager(this, editor)
    );
    return expManager.expandSnippetsUnderCursors(parser);
  }

  expandSnippetWithPrefix(editor, insertionRange, prefix, parser) {
    const expManager = getOrCompute(
      this.expansionsByEditor,
      editor,
      () => new ExpansionManager(this, editor)
    );
    return expManager.expandSnippetWithPrefix(insertionRange, prefix, parser);
  }

  expandSnippet(editor, snippet) {
    if (!editor) {
      return false;
    }

    const manager = getOrCompute(
      this.expansionsByEditor,
      editor,
      () => new ExpansionManager(this, editor)
    );

    return manager.expandSnippet(snippet, this.getSnippetParser());
  }

  gotoNextTabStop(editor) {
    const expansions = this.expansionsByEditor.get(editor);
    if (!expansions) {
      return false;
    }
    return expansions.gotoNextTabStop();
  }

  gotoPreviousTabStop(editor) {
    const expansions = this.expansionsByEditor.get(editor);
    if (!expansions) {
      return false;
    }
    return expansions.gotoPreviousTabStop();
  }

  cancelExpansions(editor) {
    const expansions = this.expansionsByEditor.get(editor);
    if (!expansions) {
      return false;
    }
    return expansions.cancelExpansions();
  }

  async observeAll() {
    this.observePackages();
    this.observeUserSnippets(
      path.join(atom.getConfigDirPath(), "snippets.cson")
    );
  }

  async observePackages() {
    const loads = atom.packages
      .getLoadedPackages()
      .map((pack) => this.onDidLoadPackage(pack));
    const activates = atom.packages
      .getActivePackages()
      .map((pack) => this.onDidActivatePackage(pack));

    this.subscriptions.add(
      atom.packages.onDidLoadPackage((pack) => this.onDidLoadPackage(pack)),
      atom.packages.onDidActivatePackage((pack) =>
        this.onDidActivatePackage(pack)
      ),
      atom.packages.onDidDeactivatePackage((pack) =>
        this.onDidDeactivatePackage(pack)
      ),
      atom.packages.onDidUnloadPackage((pack) => this.onDidUnloadPackage(pack))
    );

    return Promise.all([...loads, ...activates]);
  }

  getOperationQueue(packageName) {
    return getOrCompute(this.packageOperationsQueue, packageName, () => {
      return { count: 0, chain: Promise.resolve() };
    });
  }

  queuePackageOperation(pack, operation) {
    const queue = this.getOperationQueue(pack.name);
    queue.count += 1;
    queue.chain = queue.chain
      .then(() => operation(pack))
      .then(() => {
        queue.count -= 1;
        if (queue.count === 0) {
          this.packageOperationsQueue.delete(pack.name);
        }
      });
    return queue.chain;
  }

  onDidLoadPackage(pack) {
    return this.queuePackageOperation(pack, async () => {
      assert(
        !this.loadedPackages.has(pack.name),
        `Double load of package ${pack.name}`
      );
      this.loadedPackages.set(
        pack.name,
        new PackageSnippets(pack, this.packageIsEnabled(pack.name))
      );
    });
  }

  /** Package activation is the trigger to add it's snippets to the pool */
  onDidActivatePackage(pack) {
    return this.queuePackageOperation(pack, async () => {
      assert(
        this.loadedPackages.has(pack.name),
        `Activation of ${pack.name} before load`
      );
      const context = this.loadedPackages.get(pack.name);
      if (context.isActive()) {
        return;
      }
      context.setActive(true);

      if (this.packagesWithSnippetsDisabled.has(pack.name)) {
        return;
      }

      const packageData = this.loadedPackages.get(pack.name);
      this.loadedSnippets.add(packageData);
    });
  }

  /**
   * Package deactivation is the trigger to remove its snippets from the pool.
   * We do not remove the snippets, as they may still be useful for settings-view
   */
  onDidDeactivatePackage(pack) {
    return this.queuePackageOperation(pack, async () => {
      const context = this.loadedPackages.get(pack.name);
      if (!context.isActive()) {
        return;
      }
      context.setActive(false);
      this.loadedSnippets.remove(context);
    });
  }

  /** Package unload is the trigger to remove */
  onDidUnloadPackage(pack) {
    return this.queuePackageOperation(pack, async () => {
      assert(
        this.loadedPackages.has(pack.name),
        `Unload of unloaded package ${pack.name}`
      );
      assert(
        !this.loadedPackages.get(pack.name).isActive(),
        `Unload of active package before deactivating`
      );

      this.loadedPackages.delete(pack.name);
    });
  }

  /**
   * Called when a loaded package has been allowed as a snippets provider.
   * The package may or may not currently be activated. If not we just toggle
   * a switch. If so, then we also need to insert the snippets into the pool.
   */
  onDidEnablePackage(pack) {
    return this.queuePackageOperation(pack, () => {
      console.log(`Enabled ${pack.name}`);
    });
  }

  onDidDisablePackage(pack) {
    return this.queuePackageOperation(pack, () => {
      console.log(`Disabled ${pack.name}`);
    });
  }

  onDisabledSnippetPackagesDidChange(disabledConfig) {
    const disabled = new Set(disabledConfig);

    const newlyDisabled = [...disabledConfig].filter(
      (x) => !this.packagesWithSnippetsDisabled.has(x)
    );
    const newlyEnabled = [...this.packagesWithSnippetsDisabled].filter(
      (x) => !disabled.has(x)
    );

    this.packagesWithSnippetsDisabled = disabled;

    for (const packageName of newlyDisabled) {
      const pack = atom.packages.getLoadedPackage(packageName);
      if (pack) {
        this.onDidDisablePackage(pack);
      }
    }

    for (const packageName of newlyEnabled) {
      const pack = atom.packages.getLoadedPackage(packageName);
      if (pack) {
        this.onDidEnablePackage(pack);
      }
    }
  }

  packageIsEnabled(packageName) {
    return !this.packagesWithSnippetsDisabled.has(packageName);
  }

  async observeUserSnippets(userSnippetsPath) {
    if (this.userSnippets.has(userSnippetsPath)) {
      console.error(`Already observing path ${userSnippetsPath}`);
      return;
    }

    const userSnippets = new UserSnippets(userSnippetsPath);
    const load = this.loadedSnippets.add(userSnippets);

    this.subscriptions.add(
      userSnippets.onDidChange(() => {
        this.loadedSnippets.remove(userSnippets);
        userSnippets.invalidate();
        this.loadedSnippets.add(userSnippets);
      })
    );

    this.subscriptions.add({
      dispose: () => {
        userSnippets.dispose();
      },
    });

    userSnippets.observeChanges();

    this.userSnippets.set(userSnippetsPath, userSnippets);

    return load;
  }

  getSnippetParser() {
    return this.parser;
  }

  getSnippetsForSelector(selector) {
    return this.loadedSnippets.getByPrefixForSelector(selector);
  }

  loadTestSnippets(snippetsDef) {
    const snippets = buildSnippets(snippetsDef);
    const group = new TestSnippets(snippets);
    return this.loadedSnippets.add(group);
  }

  getExpansionsForEditor(editor) {
    const manager = this.expansionsByEditor.get(editor);
    if (!manager) {
      return false;
    }
    return manager.getExpansions();
  }

  consumeStatusBar(statusBar) {
    console.log(statusBar);
    if (!this.statusBarView) {
      this.statusBarView = new SnippetsStatusView(this, statusBar);
    }
  }

  onDidChangeExpansionState(cb) {
    return this.emitter.on("expansions-changed", cb);
  }

  notifyChangeExpansionState(editor, state) {
    this.emitter.emit("expansions-changed", { editor, state });
  }
}

module.exports = new SnippetsPlus();

class SnippetsGroup {
  static id = 0;

  static generateId() {
    return SnippetsGroup.id++;
  }

  constructor({ name, enabled, active, priority }) {
    this.id = SnippetsGroup.generateId();
    this.name = name;
    this.enabled = enabled;
    this.active = active;
    this.priority = priority;
    this.snippets = undefined;
    this.keybindingSubscriptions = new CompositeDisposable();
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  /**
   * Returns a promise that resolves to the snippets for this group, grouped
   * by filename -> selector -> snippets.
   *
   * The first call needs to generate the list, hence the async return value.
   */
  async getSnippets() {
    if (!this.snippets) {
      this.snippets = await this.generateSnippets(this.name);
    }
    return this.snippets;
  }

  async generateSnippets() {
    throw new Error("Derived class must implement way to generate snippets");
  }

  invalidate() {
    this.snippets = undefined;
    this.keybindingSubscriptions.dispose();
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  isActive() {
    return this.active;
  }

  setActive(active) {
    this.active = active;
  }

  getPriority() {
    return this.priority;
  }
}

class PackageSnippets extends SnippetsGroup {
  constructor(pack, enabled) {
    super({
      name: pack.name,
      enabled,
      active: false,
      priority: atom.packages.isBundledPackage(pack.name)
        ? Priority.Bundled
        : Priority.Community,
    });
  }

  async generateSnippets() {
    return generateSnippets(this.name);
  }
}

class UserSnippets extends PackageSnippets {
  constructor(userSnippetsPath) {
    super({
      name: `(User) ${userSnippetsPath}`,
      active: true,
      enabled: true,
      priority: Priority.User,
    });

    this.snippetsPath = userSnippetsPath;
    this.subscriptions = new CompositeDisposable();
    this.emitter = new Emitter();
  }

  async generateSnippets() {
    return new Map([
      [
        this.snippetsPath,
        buildSnippets(await readAndGetObjectData(this.snippetsPath)),
      ],
    ]);
  }

  observeChanges() {
    const file = new File(this.snippetsPath);
    try {
      this.subscriptions.add(
        file.onDidChange(() => this.emitter.emit("change", this))
      );
      this.subscriptions.add(
        file.onDidDelete(() => this.emitter.emit("change", this))
      );
      this.subscriptions.add(
        file.onDidRename(() => this.emitter.emit("change", this))
      );
    } catch (e) {
      console.error(e);
    }
  }

  onDidChange(cb) {
    return this.emitter.on("change", cb);
  }

  dispose() {
    this.subscriptions.dispose();
  }
}

class TestSnippets extends SnippetsGroup {
  constructor(snippets) {
    super({
      name: "Test Snippets",
      active: true,
      enabled: true,
      priority: Priority.User,
    });

    this.testSnippets = snippets;
  }

  async generateSnippets() {
    return new Map([["testSnippets", this.testSnippets]]);
  }
}

async function generateSnippets(packageName) {
  const snippets = new Map();

  const packagePath = atom.packages.resolvePackagePath(packageName);
  if (!packagePath) {
    return snippets;
  }

  const snippetsPath = path.join(packagePath, "snippets");

  const files = [];

  await searchDirectory(snippetsPath, (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".cson" || ext === ".json") {
      files.push(filename);
    }
  });

  files.sort();

  const fileData = await Promise.all(
    files.map((name) => readAndGetObjectData(name))
  );

  for (let i = 0; i < files.length; i++) {
    if (fileData[i]) {
      snippets.set(files[i], buildSnippets(fileData[i]));
    }
  }

  return snippets;
}

function buildSnippets(snippetsDefinition) {
  const snippetsByScope = new Map();

  if (typeof snippetsDefinition !== "object") {
    return snippetsByScope;
  }

  for (const [scope, names] of Object.entries(snippetsDefinition)) {
    if (typeof names !== "object") {
      continue;
    }

    const snippets = new Map();

    for (let [name, attributes] of Object.entries(names)) {
      if (typeof attributes === "string") {
        attributes = { prefix: name, body: attributes };
      }

      if (typeof attributes !== "object") {
        continue;
      }

      if (attributes.prefix === undefined) {
        attributes.prefix = name;
      }

      if (
        typeof attributes.prefix !== "string" ||
        typeof attributes.body !== "string"
      ) {
        continue;
      }

      snippets.set(name, new Snippet(attributes));
    }

    if (snippets.size > 0) {
      snippetsByScope.set(scope, snippets);
    }
  }

  return snippetsByScope;
}

/**
 * Recursively searches a directory, calling the
 * callback on every file Dirent it sees. Directories
 * starting with '.' are skipped.
 *
 * @param  {string}   start The directory to start searching in
 * @param  {(filename: string) => undefined} callback Called with the dirent object of a file, for every file in the directory
 * @return {Promise<undefined>}   Resolves when the search has finished and all callbacks have been made. Does not reject.
 */
function searchDirectory(start, callback) {
  return new Promise((resolve) => {
    let activeCalls = 0;

    const search = (dirent) => {
      if (path.basename(dirent)[0] === ".") {
        return;
      }

      activeCalls += 1;
      fs.readdir(dirent, { withFileTypes: true }, (err, children) => {
        if (!err) {
          for (const child of children) {
            let childPath;
            let stat;
            // ASAR dirents will still be plain strings until Electron 8 https://github.com/electron/electron/pull/24062
            // Also the reason we can't use glob
            if (typeof child === "string") {
              childPath = path.join(dirent, child);
              try {
                stat = fs.statSync(childPath);
              } catch (e) {
                console.error(e);
                continue;
              }
            } else {
              childPath = path.join(dirent, child.name);
              stat = child;
            }

            if (stat) {
              if (stat.isDirectory()) {
                search(childPath);
              } else if (stat.isFile()) {
                callback(childPath);
              }
            }
          }
        }

        activeCalls -= 1;
        if (activeCalls === 0) {
          resolve();
        }
      });
    };

    search(start);
  });
}

/**
 * @param {string} filename The path to the file to be reads as JSON or CSON
 */
async function readAndGetObjectData(filename) {
  try {
    return parseObject(await getFileContents(filename), path.extname(filename));
  } catch (_) {
    return undefined;
  }
}

/**
 * Promisifies fs.readFile, resolving to the contents
 * or rejecting with an error.
 *
 * @param {string} filename The path of the file to read from
 */
function getFileContents(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, { encoding: "utf8" }, (err, contents) => {
      if (err) {
        reject(err);
      } else {
        resolve(contents);
      }
    });
  });
}

/**
 * @param {string} contents The raw data as a string
 * @param {string} ext The type of data ('.cson' or '.json')
 */
function parseObject(contents, ext) {
  try {
    switch (ext.toLowerCase()) {
      case ".cson":
        return CSON.parse(contents);
      case ".json":
        return JSON.parse(contents);
      default:
        console.error(`Unrecognised snippet extension: ${format}`);
        return undefined;
    }
  } catch (_) {
    return undefined;
  }
}
