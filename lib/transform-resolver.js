class DefaultTransformResolver {
  constructor() {
    this.transforms = new Map([
      ["upcase", this.upcase],
      ["downcase", this.downcase],
    ]);
  }

  resolve(name, input, context) {
    const resolver = this.transforms.get(name);
    if (typeof resolver === "function") {
      return resolver(input, context, name);
    } else if (typeof resolver === "string") {
      return resolver;
    }
    return undefined;
  }

  upcase(input) {
    return input.toUpperCase();
  }

  downcase(input) {
    return input.toLowerCase();
  }
}

module.exports = {
  DefaultTransformResolver,
}
