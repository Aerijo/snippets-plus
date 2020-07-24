const ScopedPropertyStore = require('scoped-property-store');

const { getOrCompute } = require("./util");

class SnippetsStore {
  constructor() {
    this.coalescedSnippets = new ScopedPropertyStore();
    this.snippetsBySelector = new Map();
  }

  async add(snippetsGroup) {
    const priority = snippetsGroup.getPriority();
    const groupId = snippetsGroup.getId();
    const snippetsByFile = await snippetsGroup.getSnippets();

    const selectors = new Set();

    for (const snippetsBySelector of snippetsByFile.values()) {
      for (const [selector, snippets] of snippetsBySelector) {
        selectors.add(selector);
        this.addForSelector(selector, groupId, snippetsGroup.getName(), priority, snippets);
      }
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
      if (priority < existing.priority || (priority === existing.priority && name > existing.name)) {
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
        store[snippet.prefix] = snippet;
      }
    }

    const group = {};
    group[selector] = { snippets: store };
    this.coalescedSnippets.addProperties(selector, group);
  }

  getByPrefixForSelector(selector) {
    return this.coalescedSnippets.getPropertyValue(getScopeChain(selector), "snippets");
  }
}

function getScopeChain(object) {
  if (typeof object === "string") {
    return object;
  }

  let scopesArray = object;
  if (object && object.getScopesArray) {
    scopesArray = object.getScopesArray();
  }

  return scopesArray
    .map(scope => scope[0] === '.' ? scope : `.${scope}`)
    .join(' ');
}

module.exports = {
  SnippetsStore,
}
