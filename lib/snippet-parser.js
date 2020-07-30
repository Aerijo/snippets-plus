// TODO: Add other parsing methods
class SnippetParser {
  constructor() {
    this.parser = require("./parser/snippet-parser-lenient");
    this.smartLegacyParsing = false;
  }

  /**
   * @param {string} body The snippet body string
   * @returns {SnippetTree} The parse tree for the snippet
   */
  parse(body) {
    const parseTree = this.parser.parse(body);

    if (!this.smartLegacyParsing) {
      return parseTree;
    }

    const last = parseTree[parseTree.length - 1];

    // 1. Require the last item be a simple tab stop
    if (!last.index || last.transformation || last.content) {
      return parseTree;
    }

    // 2. Require the last tab stop to be the greatest, not duplicated, and no $0 stops
    const canTransform = (contents) => {
      for (const item of contents) {
        if (item.content) {
          if (!canTransform(item.content)) {
            return false;
          }
        }

        if (typeof item.index === "number") {
          if (
            item.index === 0 ||
            item.index > last.index ||
            (item.index === last.index && item !== last)
          ) {
            return false;
          }
        }
      }
      return true;
    };

    if (canTransform(parseTree)) {
      last.index = 0;
    }

    return parseTree;
  }
}

module.exports = {
  SnippetParser,
};
