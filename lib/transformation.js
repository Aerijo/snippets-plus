const ModifierState = Object.freeze({
  None: 0,
  Lowercase: 1,
  Uppercase: 2,
});

class Modifier {
  constructor() {
    this.nextState = ModifierState.None;
    this.allState = ModifierState.None;
  }

  accept(modifier) {
    switch (modifier.inlineModifier) {
      case "E":
        this.allState = ModifierState.None;
        this.nextState = ModifierState.None;
        break;
      case "u":
        this.nextState = ModifierState.Uppercase;
        break;
      case "l":
        this.nextState = ModifierState.Lowercase;
        break;
      case "U":
        this.allState = ModifierState.Uppercase;
        break;
      case "L":
        this.allState = ModifierState.Lowercase;
        break;
      default:
        console.error("Unrecognised modifier", modifier);
    }
  }

  /**
   * @param {string} input The segment to apply the modification to
   * @returns {string} The modified input
   */
  modify(input) {
    if (input.length === 0) {
      return input;
    }

    switch (this.allState) {
      case ModifierState.None:
        break;
      case ModifierState.Lowercase:
        input = input.toLowerCase();
        break;
      case ModifierState.Uppercase:
        input = input.toUpperCase();
        break;
      default:
        console.error("Unrecognised all-state", this.allState);
    }

    switch (this.nextState) {
      case ModifierState.None:
        break;
      case ModifierState.Lowercase:
        input = input.replace(/^./, (match) => match.toLowerCase());
        break;
      case ModifierState.Uppercase:
        input = input.replace(/^./, (match) => match.toUpperCase());
        break;
      default:
        console.error("Unrecognised next-state", this.nextState);
    }
    this.nextState = ModifierState.None;

    return input;
  }
}

class Transformation {
  constructor(find, replace) {
    this.find = find;
    this.replace = replace;
  }

  /**
   * @param {string} input The text to be transformed
   * @param {} context The expansion context of the snippet
   * @returns string The result of transforming the input
   */
  transform(input, context) {
    return input.replace(this.find, (...match) => {
      const modifier = new Modifier();
      const result = [];

      function insertText(text) {
        result.push(modifier.modify(text));
      }

      function processReplacements(replacements) {
        for (const segment of replacements) {
          if (typeof segment === "string") {
            insertText(segment);
            continue;
          }

          if (segment.inlineModifier !== undefined) {
            modifier.accept(segment);
            continue;
          }

          if (segment.backreference !== undefined) {
            const group = segment.backreference;

            let capture = undefined;
            if (typeof group === "number" && group <= match.length - 3) {
              capture = match[group];
            } else if (typeof group === "string") {
              capture = match[match.length - 1][group];
            }

            if (capture === undefined) {
              if (segment.elseContent !== undefined) {
                processReplacements(segment.elseContent);
              }
            } else if (segment.ifContent !== undefined) {
              processReplacements(segment.ifContent);
            } else {
              if (segment.modifier !== undefined) {
                for (const modifier of segment.modifier) {
                  capture = context.transformResolver.resolve(
                    modifier,
                    capture,
                    context
                  );
                }
              }

              if (typeof capture === "string") {
                insertText(capture);
              }
            }
            continue;
          }

          console.error("Unhandled replace segment", segment);
        }
      }

      processReplacements(this.replace);
      return result.join("");
    });
  }
}

module.exports = {
  Transformation,
};
