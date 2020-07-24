class DefaultVariableResolver {
  constructor() {
    this.variables = new Map([
      ["CLIPBOARD", this.clipboard],
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
