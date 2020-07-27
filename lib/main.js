const { SnippetsPlus } = require("./snippets-plus");

class SnippetsPlusPackage {
  constructor() {
    this.snippetsPlus = undefined;
  }

  activate() {
    this.snippetsPlus = new SnippetsPlus();
    this.snippetsPlus.activate();
  }

  deactivate() {
    if (this.snippetsPlus) {
      this.snippetsPlus.deactivate();
      this.snippetsPlus = undefined;
    }
  }

  consumeStatusBar(statusBar) {
    this.snippetsPlus.consumeStatusBar(statusBar);
  }

  provideSnippets() {
    const sp = this.snippetsPlus;
    return {
      bundledSnippetsLoaded: () => true,
      insertSnippet: sp.insertForeign.bind(sp),
      snippetsForScopes: sp.getSnippetsForSelector.bind(sp),
      getSnippets: sp.foreignGetSnippets.bind(sp),
      getUnparsedSnippets: sp.foreignGetSnippets.bind(sp),
      getUserSnippetsPath: sp.getUserSnippetsPath.bind(sp),
    };
  }
}

module.exports = new SnippetsPlusPackage();
