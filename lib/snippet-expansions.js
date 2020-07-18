// Tracks the active expansions for an editor
class SnippetExpansions {
  constructor(snippets, editor) {
    this.snippets = snippets;
    this.editor = editor;
  }

  gotoNextTabStop() {
    return false;
  }

  expandSnippetsUnderCursors() {
    return false;
  }
}

// Tracks a single active expansion for the editor
class Expansion {

}

module.exports = {
  SnippetExpansions,
};
