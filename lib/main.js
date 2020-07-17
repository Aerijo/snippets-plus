const fs = require("fs");
const path = require("path");
const { CompositeDisposable } = require("atom");
const CSON = require("cson-parser");
const glob = require("glob");

class SnippetsPlus {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.snippetsByPackage = new Map();

    this.loadPackageSnippets = this.loadPackageSnippets.bind(this);
    this.csonResolver = this.csonResolver.bind(this);
    this.jsonResolver = this.jsonResolver.bind(this);
  }

  log(msg) {
    if (true) { // TODO: Set up way to disable logging
      console.log(msg);
    }
  }

  error(msg) {
    if (true) {
      console.error(msg);
    }
  }

  activate() {
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.workspace.addOpener(uri => {
      if (uri === "atom://.atom/snippets") {
        return atom.workspace.openTextFile(this.getUserSnippetsPath());
      }
    }));

    this.observeAll();
  }

  observeAll() {
    this.observePackageSnippets().then(() => {
      console.log(this.snippetsByPackage);
    });
    this.observeUserSnippets();
  }

  observePackageSnippets() {
    const disabledPackageNames = this.getDisabledPackages();

    return new Promise(async resolve => {
      if (!atom.packages.hasLoadedInitialPackages()) {
        await new Promise(resolve => {
          const onDidLoadPacks = atom.packages.onDidLoadInitialPackages(() => {
            onDidLoadPacks.dispose();
            resolve();
          });
        });
      }

      const packs = atom.packages.getLoadedPackages().filter(p => !disabledPackageNames.has(p.name));
      const snippets = await Promise.all(packs.map(this.loadPackageSnippets));

      for (let i = 0; i < snippets.length; i++) {
        if (snippets[i].size === 0) {
          continue;
        }
        this.snippetsByPackage.set(packs[i], snippets[i]);
      }

      resolve();
    });
  }

  /**
   * Takes a Package, returns a promise that resolves to
   * a map of filePath -> snippets by scope selector
   */
  async loadPackageSnippets(pack) {
    const snippets = new Map();
    const packagePath = atom.packages.resolvePackagePath(pack.name);
    if (!packagePath) {
      return snippets;
    }
    const snippetsPath = path.join(packagePath, "snippets");

    const csonFiles = [];
    const jsonFiles = [];

    await searchDirectory(snippetsPath, filename => {
      const ext = path.extname(filename).toLowerCase();
      if (ext === ".cson") {
        csonFiles.push(filename);
      } else if (ext === ".json") {
        jsonFiles.push(filename);
      }
    });

    const csonData = await Promise.all(csonFiles.map(this.csonResolver));
    const jsonData = await Promise.all(jsonFiles.map(this.jsonResolver));

    for (let i = 0; i < csonFiles.length; i++) {
      if (csonData[i]) {
        snippets.set(csonFiles[i], csonData[i]);
      }
    }

    for (let i = 0; i < jsonFiles.length; i++) {
      if (jsonFiles[i]) {
        snippets.set(jsonFiles[i], jsonData[i]);
      }
    }

    return snippets;
  }

  // getPackageSnippetFiles(pack) {
  //
  // }

  jsonResolver(filename) {
    return new Promise(resolve => {
      fs.readFile(filename, (err, contents) => {
        let result = undefined;
        if (!err) {
          try {
            result = JSON.parse(contents);
          } catch (e) { }
        }
        resolve(result);
      });
    });
  }

  csonResolver(filename) {
    return new Promise(resolve => {
      fs.readFile(filename, (err, contents) => {
        let result = undefined;
        if (!err) {
          try {
            result = CSON.parse(contents);
          } catch (e) { }
        }
        resolve(result);
      });
    });
  }

  getDisabledPackages() {
    return new Set(atom.config.get('core.packagesWithSnippetsDisabled'));
  }

  observeUserSnippets() {

  }
}

module.exports = new SnippetsPlus();

/**
 * Recursively searches a directory, calling the
 * callback on every file Dirent it sees. Directories
 * starting with '.' are skipped.
 *
 * @param  {[type]}   start    The directory to start searching in
 * @param  {Function} callback Called with the dirent object of a file, for every file in the directory
 * @return {[Promise<void>]}   Resolves when the search has finished and all callbacks have been made. Does not reject.
 */
function searchDirectory(start, callback) {
  return new Promise(resolve => {
    let activeCalls = 0;

    const search = (dirent) => {
      if (path.basename(dirent.name)[0] === ".") {
        return;
      }

      activeCalls += 1;
      fs.readdir(dirent, {withFileTypes: true}, (err, children) => {
        if (!err) {
          for (const child of children) {
            let childPath;
            let stat;
            // ASAR dirents will still be plain strings until Electron 8 https://github.com/electron/electron/pull/24062
            if (typeof child === "string") {
              childPath = path.join(dirent, child);
              try {
                stat = fs.statSync(childPath);
              } catch(e) { console.error(e); continue; }
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
    }

    search(start);
  });
}
