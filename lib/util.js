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
      .map(scope => scope[0] === '.' ? scope : `.${scope}`)
      .join(' ');
  },
}
