const { CompositeDisposable } = require("atom");
const { SnippetsPlus } = require("./snippets-plus");

class SnippetsPlusPackage {
  constructor() {
    this.snippetsPlus = undefined;
  }

  activate(state = {}) {
    const { atomHome } = atom.getLoadSettings();
    if (state.atomHome !== atomHome) {
      state = { atomHome, packages: {} };
    }

    this.snippetsPlus = new SnippetsPlus(state);
    return this.snippetsPlus.activate();
  }

  deactivate() {
    if (this.snippetsPlus) {
      this.snippetsPlus.deactivate();
      this.snippetsPlus = undefined;
    }
  }

  serialize() {
    return this.snippetsPlus.serialize();
  }

  consumeStatusBar(statusBar) {
    this.snippetsPlus.consumeStatusBar(statusBar);
  }

  consumeSnippetsResolver({ transformResolver, variableResolver } = {}) {
    const disposables = new CompositeDisposable();
    if (transformResolver) {
      disposables.add(this.consumeSnippetsTransformResolver(transformResolver));
    }

    if (variableResolver) {
      disposables.add(this.consumeSnippetsVariableResolver(variableResolver));
    }
    return disposables;
  }

  consumeSnippetsVariableResolver({ resolver, priority } = {}) {
    if (resolver) {
      return this.snippetsPlus.variableResolver.addResolver(resolver, priority);
    }
  }

  consumeSnippetsTransformResolver({ resolver, priority } = {}) {
    if (resolver) {
      return this.snippetsPlus.transformResolver.addResolver(
        resolver,
        priority
      );
    }
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
