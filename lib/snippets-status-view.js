// Indicator for the status bar to show when an editor is in
// snippet mode.
class SnippetsStatusView {
  constructor(snippetsPlus, statusBar) {
    this.snippetsPlus = snippetsPlus;
    this.item = this.buildItem();
    this.tile = statusBar.addRightTile({ item: this.item });

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
    this.item.firstChild.textContent = "snippets on";
  }

  setInactive() {
    this.item.firstChild.textContent = "";
  }

  buildItem() {
    const item = document.createElement("div");
    item.className = "snippets-indicator";
    const content = document.createTextNode("");
    item.appendChild(content);
    return item;
  }
}

module.exports = {
  SnippetsStatusView,
}
