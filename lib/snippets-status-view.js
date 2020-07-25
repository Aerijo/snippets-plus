// Indicator for the status bar to show when an editor is in
// snippet mode.
class SnippetsStatusView {
  constructor(snippetsPlus, statusBar) {
    this.snippetsPlus = snippetsPlus;

    atom.workspace.onDidChangeActiveTextEditor(editor => {
      if (!editor) {
        this.setInactive();
        return;
      }

      const manager = this.snippetsPlus.expansionsByEditor.get(editor);
      if (!manager || !manager.hasActiveExpansions()) {
        this.setInactive();
        return;
      }

      this.setActive();
    });

    this.snippetsPlus.onDidChangeExpansionState(({editor, state}) => {
      if (editor !== atom.workspace.getActiveTextEditor()) { return; }
      if (state) {
        this.setActive();
      } else {
        this.setInactive();
      }
    });
  }

  setActive() {
    console.log("snippet mode is on");
  }

  setInactive() {
    console.log("snippet mode is off");
  }
}

module.exports = {
  SnippetsStatusView,
}
