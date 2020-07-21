// TODO: Add other parsing methods
class SnippetParser {
  constructor() {
    this.parser = require("./parser/snippet-parser-lenient");
  }

  /**
   * @param {string} body The snippet body string
   * @returns {SnippetTree} The parse tree for the snippet
   */
  parse(body) {
    return this.parser.parse(body);
  }
}

module.exports = {
  SnippetParser,
}
