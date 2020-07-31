const { GenericResolverManager } = require("./util");

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

class TransformResolverManager extends GenericResolverManager {
  constructor() {
    super();
    this.addResolver(new DefaultTransformResolver(), -1);
  }
}

module.exports = {
  TransformResolverManager,
};
