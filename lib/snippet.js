const { DefaultVariableResolver } = require("./variable-resolver"); // TODO: Move this to same area as snippet management
const { Point, Range } = require("atom");

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

  getTree(parser) {
    if (!this.tree) {
      this.tree = parser.parse(this.body);
    }
    return this.tree;
  }

  getExpansion(context, parser) {
    const { start, indent } = context;

    let row = start.row;
    let column = start.column;
    const text = [];
    const tabStopGroups = new Map();
    const tabStopTree = new TabStopTree();

    const unknownVariables = [];

    function insertText(text) {
      insertLines(text.split("\n"));
    }

    function insertLines(lines) {
      text.push(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        text.push("\n" + indent + lines[i]);
      }

      if (lines.length > 1) {
        row += lines.length - 1;
        column = lines[lines.length - 1].length;
      } else {
        column += lines[0].length;
      }
    }

    function resolveTabStop(tabStopItem) {
      const index = tabStopItem.index;
      let group = tabStopGroups.get(index);
      if (!group) {
        group = new TabStopGroup(index);
        tabStopGroups.set(index, group);
      }

      const start = new Point(row, column);

      if (tabStopItem.content) {
        const instance = new TabStopInstance(group, new Range(start, start));
        tabStopTree.pushFrame(instance);
        insertContent(tabStopItem.content);
        instance.range.end = new Point(row, column);
        group.addInstance(instance);
        tabStopTree.popFrame();
      } else if (tabStopItem.transformation) {
        // Tab stop with transformation
        console.log("TODO: tab stop transformations");

        const instance = new TabStopInstance(group, new Range(start, start));
        group.addInstance(instance);
        tabStopTree.insert(instance);

      } else {
        if (tabStopItem.choices) {
          for (const choice of tabStopItem.choices) {
            group.choices.add(choice);
          }
        }

        const instance = new TabStopInstance(group, new Range(start, start));
        group.addInstance(instance);
        tabStopTree.insert(instance);
      }
    }

    function resolveTransformation(transformation, input) {
      console.log("TODO: Transformation", transformation, input);
    }

    function resolveVariable(variableItem) {
      const name = variableItem.variable;
      let resolved = new DefaultVariableResolver().resolve(name, context);

      if (typeof resolved === "string") {
        // If the resolver returns a string, that's considered a match
        if (variableItem.transformation) {
          const transformed = resolveTransformation(variableItem.transformation, resolved);
          if (typeof transformed === "string") {
            resolved = transformed;
          }
        }
        insertText(resolved);
      } else if (variableItem.content) {
        // Default content is inserted inline, as if there was never any variable and it was there all along
        insertContent(variableItem.content);
      } else {
        // If we have no resolver or default, convert to tab stop with name as placeholder
        const start = new Point(row, column);
        insertText(name);
        const end = new Point(row, column);
        unknownVariables.push({ name, range: new Range(start, end) });
      }
    }

    function insertContent(items) {
      for (const item of items) {
        if (typeof item === "string") {
          insertText(item);
        } else if (item.index) {
          // Is a tab stop
          resolveTabStop(item);
        } else if (item.variable) {
          // Is variable
          resolveVariable(item);
        }
      }
    }

    insertContent(this.getTree(parser));

    console.log("Groups:", tabStopGroups);
    console.log("Tree:", tabStopTree);
    console.log("Text:", text.join(""));

    return new Expansion(text.join(""), context);
  }

  clear() {
    this.tree = undefined;
  }
}


// Tracks a single active expansion for the editor. Expansions are hierarchical;
// an expansion may have further snippets triggered within it, where control returns
// to the parent expansion when the inner one finishes (reaches $0 tab stop).
class Expansion {
  constructor(text, context) {
    this.text = text;
    this.context = context;

    this.tabStopsByLocation = undefined;
    this.tabStopsByGroup = undefined;
  }

  getText() {
    return this.text;
  }
}

// Tracks the location of a tab stop logically.
// Will control a marker too? IDK how that works,
// but we need to put down a marker for each tab
// stop so we can style them. It looks like tracking
// the marker loaction will have to be done manually
// though, e.g., as we need separate behaviours for markers
// in the same position depending on if they were declared
// as $2$1 or ${2:$1}.
class TabStopGroup {
  constructor() {
    this.choices = new Set();
    this.instances = [];
  }

  addInstance(instance) {
    this.instances.push(instance);
  }
}

class TabStopInstance {
  constructor(group, range) {
    this.group = group;
    this.range = range;
    this.marker = undefined;
    this.transformation = undefined;
  }

  getRange() {
    return this.range;
  }

  setRange(range) {
    // TODO
  }
}

// A tree of TabStopInstance, that allows for adjusting
// the ranges of tab stops when text is added
class TabStopTree {
  constructor() {
    this.rootFrame = {
      instance: undefined,
      children: [],
    };

    this.frameStack = [];
    this.activeFrame = this.rootFrame;
  }

  pushFrame(tabStopInstance) {
    const childFrame = this.insert(tabStopInstance);
    this.frameStack.push(this.activeFrame);
    this.activeFrame = childFrame;
  }

  popFrame() {
    this.activeFrame = this.frameStack.pop();
  }

  insert(tabStopInstance) {
    const frame = {
      instance: tabStopInstance,
      children: [],
    };
    this.activeFrame.children.push(frame);
    return frame;
  }
}


module.exports = {
  Snippet,
  Expansion,
};
