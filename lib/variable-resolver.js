class DefaultVariableResolver {
  constructor() {
    this.variables = new Map([
      ["TM_FILENAME", this.filename],
    ]);
  }

  resolve(name, context) {
    const resolver = this.variables.get(name);
    if (typeof resolver === "function") {
      return resolver(context, name);
    }
    return undefined;
  }

  filename({ editor }) {
    return editor.getTiltle();
  }
}

module.exports = {
  DefaultVariableResolver,
}
