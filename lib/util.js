const { Disposable } = require("atom");

class IdGenerator {
  constructor() {
    this.id = 0;
  }

  generateId() {
    return this.id++;
  }
}

class GenericResolverManager {
  constructor() {
    this.resolversByPriority = [];
  }

  addResolver(resolver, priority = 0) {
    let i = 0;
    for (; i < this.resolversByPriority.length; i++) {
      if (priority >= this.resolversByPriority[i].priority) {
        break;
      }
    }
    this.resolversByPriority.splice(i, 0, { resolver, priority });

    return new Disposable(() => {
      this.removeResolver(resolver);
    });
  }

  removeResolver(resolver) {
    for (let i = 0; i < this.resolversByPriority.length; i++) {
      if (this.resolversByPriority[i].resolver === resolver) {
        this.resolversByPriority.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  resolve(...args) {
    for (const { resolver } of this.resolversByPriority) {
      let resolved = undefined;
      if (typeof resolver === "function") {
        resolved = resolver(...args);
      } else {
        resolved = resolver.resolve(...args);
      }
      if (typeof resolved === "string") {
        return resolved;
      }
    }
    return undefined;
  }
}

module.exports = {
  getOrCompute(map, key, computer) {
    let result = map.get(key);
    if (result === undefined) {
      result = computer();
      map.set(key, result);
    }
    return result;
  },

  getScopeChain(object) {
    if (typeof object === "string") {
      return object;
    }

    let scopesArray = object;
    if (object && object.getScopesArray) {
      scopesArray = object.getScopesArray();
    }

    return scopesArray
      .map((scope) => (scope[0] === "." ? scope : `.${scope}`))
      .join(" ");
  },
  IdGenerator,
  GenericResolverManager,
};
