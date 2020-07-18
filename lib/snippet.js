/**
 * Represents a single snippet. Can be used to generate expansion instances
 * given a context (e.g. editor & cursor). These expansion instances are
 * temporary objects to track active snippets, being created on snippet
 * expansion and deleted when the snippet usage is resolved.
 */
class Snippet {
  constructor(params) {
    /** Text in editor to trigger snippet */
    this.prefix = params.prefix;

    /** Raw snippet body text */
    this.body = params.body;

    /** Content to be displayed in autocomplete window */
    this.description = params.description;

    /** Link to add to autocomplete window */
    this.descriptionMoreUrl = params.descriptionMoreUrl;

    /** Content to be displayed to the right of the prefix name in autocomplete window */
    this.rightLabel = params.rightLabel;

    /** Content to be displayed to the right of the prefix name in autocomplete window */
    this.rightLabelHTML = params.rightLabelHTML;

    /** Content to be displayed to the left of the prefix name in autocomplete window */
    this.leftLabel = params.leftLabel;

    /** Content to be displayed to the left of the prefix name in autocomplete window */
    this.leftLabelHtml = params.leftLabelHtml;

    /** Parsed snippet body (lazily generated) */
    this.tree = undefined;
  }

  getExpansion(context) {

  }

  clear() {
    this.tree = undefined;
  }
}

module.exports = {
  Snippet,
};
