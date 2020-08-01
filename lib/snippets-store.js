const ScopedPropertyStore = require("scoped-property-store");

const { getOrCompute, getScopeChain, IdGenerator } = require("./util");

class SnippetsStore {
  static KeyBindingIds = new IdGenerator();

  constructor(snippetsPlus) {
    this.coalescedSnippets = new ScopedPropertyStore();
    this.snippetsBySelector = new Map();

    this.commandsByGroup = new Map();
    this.snippetsPlus = snippetsPlus;
  }

  clearAll() {
    this.coalescedSnippets = new ScopedPropertyStore();
    this.snippetsBySelector = new Map();
  }

  async add(snippetsGroup) {
    const priority = snippetsGroup.getPriority();
    const groupId = snippetsGroup.getId();
    const snippetsByFile = await snippetsGroup.getSnippets();

    const selectors = new Set();
    const snippetsByKeyBinding = new Map();

    for (const snippetsBySelector of snippetsByFile.values()) {
      for (const [selector, snippets] of snippetsBySelector) {
        selectors.add(selector);
        this.addForSelector(
          selector,
          groupId,
          snippetsGroup.getName(),
          priority,
          snippets
        );

        for (const [, snippet] of snippets) {
          if (typeof snippet.key === "string") {
            const snippetsBySelector = getOrCompute(
              snippetsByKeyBinding,
              snippet.key,
              () => new ScopedPropertyStore()
            );
            const g = {};
            g[selector] = { snippet };
            snippetsBySelector.addProperties("some-description", g);
          }
        }
      }
    }

    if (snippetsByKeyBinding.size > 0) {
      const sp = this.snippetsPlus;
      const keymaps = {};

      for (const [key, snippetsBySelector] of snippetsByKeyBinding) {
        const command = `snippets-plus:expand-snippet-${SnippetsStore.KeyBindingIds.generateId()}`;
        keymaps[key] = command;

        snippetsGroup.keybindingSubscriptions.add(
          atom.commands.add("atom-text-editor", command, {
            didDispatch: function (event) {
              if (
                !sp.expandSnippetFromSet(
                  atom.workspace.getActiveTextEditor(),
                  snippetsBySelector
                )
              ) {
                event.abortKeyBinding();
              }
            },
            hiddenInCommandPalette: true,
          })
        );
      }

      const source = `snippets-plus://group-${snippetsGroup.getId()}`;

      atom.keymaps.add(source, {
        "atom-text-editor": keymaps,
      });

      snippetsGroup.keybindingSubscriptions.add({
        dispose: () => {
          atom.keymaps.removeBindingsFromSource(source);
        },
      });
    }

    for (const selector of selectors) {
      this.regenerateSnippetsForSelector(selector);
    }
  }

  remove(snippetsGroup) {
    const id = snippetsGroup.getId();

    for (const [selector, snippetPools] of this.snippetsBySelector) {
      let i = 0;
      for (; i < snippetPools.length; i++) {
        if (snippetPools[i].id === id) {
          break;
        }
      }

      if (i < snippetPools.length) {
        snippetPools.splice(i, 1);
        this.regenerateSnippetsForSelector(selector);
      }
    }
  }

  addForSelector(selector, id, name, priority, snippets) {
    const pool = getOrCompute(this.snippetsBySelector, selector, () => []);
    let i = 0;
    for (; i < pool.length; i++) {
      const existing = pool[i];
      if (
        priority < existing.priority ||
        (priority === existing.priority && name > existing.name)
      ) {
        break;
      }
    }

    pool.splice(i, 0, {
      id,
      priority,
      snippets,
    });
  }

  regenerateSnippetsForSelector(selector) {
    this.coalescedSnippets.removePropertiesForSource(selector);

    const store = {}; // NOTE: Must be an object, as ScopedPropertyStore can't handle Maps
    const entries = this.snippetsBySelector.get(selector);

    for (const { snippets } of entries) {
      for (const snippet of snippets.values()) {
        if (typeof snippet.prefix === "string") {
          store[snippet.prefix] = snippet;
        }
      }
    }

    const group = {};
    group[selector] = { snippets: store };
    this.coalescedSnippets.addProperties(selector, group);
  }

  getByPrefixForSelector(selector) {
    return (
      this.coalescedSnippets.getPropertyValue(
        getScopeChain(selector),
        "snippets"
      ) || {}
    );
  }
}

module.exports = {
  SnippetsStore,
};
