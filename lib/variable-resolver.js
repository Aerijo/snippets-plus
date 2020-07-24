class DefaultVariableResolver {
  constructor() {
    this.variables = new Map([
      ["CLIPBOARD", this.clipboard],
      ["TM_CURRENT_LINE", this.currentLine],
      ["TM_FILENAME", this.filename],
      ["TM_SELECTED_TEXT", this.selected],
    ]);
  }

  resolve(name, context) {
    const resolver = this.variables.get(name);
    if (typeof resolver === "function") {
      return resolver(context, name);
    }
    return undefined;
  }

  clipboard() {
    return atom.clipboard.read();
  }

  currentLine({ editor, prefix, insertionPoint }) {
    const lineText = editor.lineTextForBufferRow(insertionPoint.row);
    return lineText.slice(0, insertionPoint.column - prefix.length) + lineText.slice(insertionPoint.column);
  }

  filename({ editor }) {
    return editor.getTitle();
  }

  selected({ editor, selectionRange }) {
    return editor.getTextInBufferRange(selectionRange);
  }
}

module.exports = {
  DefaultVariableResolver,
}
