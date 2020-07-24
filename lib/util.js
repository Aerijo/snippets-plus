module.exports = {
  getOrCompute(map, key, computer) {
    let result = map.get(key);
    if (result === undefined) {
      result = computer();
      map.set(key, result);
    }
    return result;
  }
}
