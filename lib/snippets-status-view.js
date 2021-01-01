const { CompositeDisposable } = require("atom");

// Indicator for the status bar to show when an editor is in
// snippet mode.
class SnippetsStatusView {
  constructor(snippetsPlus, statusBar) {
    this.subscriptions = new CompositeDisposable();
    this.snippetsPlus = snippetsPlus;
    this.item = this.buildItem();
    this.tile = statusBar.addRightTile({ item: this.item });

    this.subscriptions.add(
      atom.workspace.onDidChangeActiveTextEditor((editor) => {
        if (!editor) {
          this.setInactive();
          return;
        }

        const manager = this.snippetsPlus.expansionsByEditor.get(editor);
        if (!manager || !manager.hasActiveExpansions()) {
          this.setInactive();
          return;
        }

        this.setActive(manager.getExpansionState());
      })
    );

    this.subscriptions.add(
      this.snippetsPlus.onDidChangeExpansionState(({ editor, state }) => {
        if (editor !== atom.workspace.getActiveTextEditor()) {
          return;
        }
        if (state) {
          this.setActive(state);
        } else {
          this.setInactive();
        }
      })
    );
  }

  dispose() {
    this.subscriptions.dispose();
    this.tile.destroy();
  }

  setActive({ index, count }) {
    this.item.childNodes[0].classList.add("active");

    // index +1 because it is natural to use 1-based indices in UI.
    // The count includes the terminating tab stop, which we don't
    // want to show (because otherwise we'd never report being on
    // the last stop, as reaching it ends the snippet), so we -1 it.
    this.item.childNodes[1].textContent = `${index + 1} of ${count - 1}`;
  }

  setInactive() {
    this.item.childNodes[0].classList.remove("active");
    this.item.childNodes[1].textContent = "";
  }

  buildItem() {
    const item = document.createElement("span");

    const icon = document.createElement("div");
    icon.className = "snippets-indicator";
    item.appendChild(icon);

    const text = document.createElement("span");
    text.className = "snippets-index";
    item.appendChild(text);

    return item;
  }
}

module.exports = {
  SnippetsStatusView,
};
