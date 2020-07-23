const { DefaultVariableResolver } = require("./variable-resolver"); // TODO: Move this to same area as snippet management
const { Point, Range, Emitter, CompositeDisposable } = require("atom");

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

  getExpansion(context, parser, markerLayer) {
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

    return new Expansion(text.join(""), context, finalizeTabStopGroups(tabStopGroups, unknownVariables, row, column, tabStopTree), tabStopTree, markerLayer);
  }

  clear() {
    this.tree = undefined;
  }
}

function finalizeTabStopGroups(tabStopGroups, unknownVariables, endRow, endColumn, tabStopTree) {
  const result = [];

  const endTabStopGroup = tabStopGroups.get(0);
  tabStopGroups.delete(0);

  const indices = [...tabStopGroups.keys()].sort();

  for (const index of indices) {
    result.push(tabStopGroups.get(index));
  }

  for (const unknownVariable of unknownVariables) {
    result.push(unknownVariable); // TODO: Process into tab stop here or at make time
  }

  if (endTabStopGroup) {
    result.push(endTabStopGroup);
  } else {
    const endGroup = new TabStopGroup();
    const endPoint = new Point(endRow, endColumn);
    const endInstance = new TabStopInstance(endGroup, new Range(endPoint, endPoint));
    endGroup.addInstance(endInstance);
    result.push(endGroup);
    tabStopTree.insert(endInstance);
  }

  return result;
}

// Tracks a single active expansion for the editor. Expansions are hierarchical;
// an expansion may have further snippets triggered within it, where control returns
// to the parent expansion when the inner one finishes (reaches $0 tab stop).
class Expansion {
  constructor(text, context, tabStopGroups, tabStopTree, markerLayer) {
    this.text = text;
    this.context = context;
    this.buffer = context.editor.getBuffer();

    this.tabStopsByLocation = tabStopTree;
    this.tabStopsByGroup = tabStopGroups;

    this.activeStopIndex = -1;
    this.emitter = new Emitter();
    this.markerLayer = markerLayer;

    this.subscriptions = new CompositeDisposable();
  }

  insert(insertionRange) {
    this.context.editor.setTextInBufferRange(insertionRange, this.text);
    this.subscriptions.add(this.buffer.onDidChange(event => {
      this.onDidChange(event.changes);
    }));

    this.gotoNext();
    this.addMarkers(this.markerLayer);
  }

  onDidFinish(cb) {
    this.emitter.on("finish", cb);
  }

  emitFinish() {
    this.subscriptions.dispose();
    for (const group of this.tabStopsByGroup) {
      group.destroy();
    }
    this.emitter.emit("finish");
  }

  getText() {
    return this.text;
  }

  onDidChange(changes) {
    console.log(changes);
    const activeInstances = new Set(this.tabStopsByGroup[this.activeStopIndex].instances);
    for (let i = changes.length - 1; i >= 0; i--) {
      const { oldRange, newRange } = changes[i];
      this.tabStopsByLocation.adjust(oldRange, newRange, activeInstances);
    }
  }

  gotoNext() {
    this.activeStopIndex += 1;

    this.gotoIndex(this.activeStopIndex);

    if (this.activeStopIndex >= this.tabStopsByGroup.length - 1) {
      this.emitFinish();
    }

    return true;
  }

  gotoPrevious() {

  }

  gotoIndex(index) {
    this.context.selection.setBufferRange(this.tabStopsByGroup[index].instances[0].range);
    this.context.cursor.setBufferPosition(this.tabStopsByGroup[index].instances[0].range.end);
  }

  addMarkers(markerLayer) {
    for (const group of this.tabStopsByGroup) {
      for (const instance of group.instances) {
        instance.addMarker(markerLayer);
      }
    }
  }
}

// Tracks a group of tab stops instances that should be simultaneously
// active. Holds these instances, as well as a list of choice
// text to display if applicable.
//
// Used to activate/deactivate sets of tab stop instances when
// the user goto's next / previous.
class TabStopGroup {
  constructor() {
    this.choices = new Set();
    this.instances = [];
  }

  addInstance(instance) {
    this.instances.push(instance);
  }

  destroy() {
    for (const instance of this.instances) {
      instance.destroy();
    }
  }
}

// Represents a single tab stop range. There may be multiple
// active simultaneously (those in the group). Manages the
// marker and transformations of this instance of the group.
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
    this.range = range;
    if (this.marker) {
      this.marker.bufferMarker.setRange(range);
    }
  }

  addMarker(markerLayer) {
    this.marker = markerLayer.markBufferRange(this.range, { invalidate: "never" });
    console.log(this.marker);
  }

  destroy() {
    if (this.marker) {
      this.marker.destroy();
    }
  }
}

// A tree of TabStopInstance, that allows for adjusting
// the ranges of tab stops when text is added. Useful for
// ensuring the marker positions stay logically correct,
// as even if several are 0-width on the same Point they
// may have different rules for growing based on which tab
// stop is active and whether they are conceptually contained
// or adjacent to one another.
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

  /**
   * @param {Range} oldRange
   * @param {Range} newRange
   * @param {Set<TabStopInstance>} activeInstances
   */
  adjust(oldRange, newRange, activeInstances) {
    console.log(`Adjusting for ${oldRange} -> ${newRange}`);

    for (const child of this.rootFrame.children) {
      const childRange = child.instance.range;
      console.log(child, `${childRange}`);

      if (childRange.end.isLessThan(oldRange.start)) {
        console.log("before, skipping");
        continue;
      }

      if (childRange.start.isLessThan(oldRange.end)) {

      }

      if (childRange.end.isEqual(oldRange.start)) {

      }

      if (childRange.start.isEqual(oldRange.end)) {

      }

      if (childRange.start.isGreaterThan(oldRange.end)) {
        console.log("after, adjusting");
        this.adjustFollowingRanges(child, oldRange, newRange);
      }
    }
  }

  /**
   * Corrects the ranges of any instances that occur after the change.
   * These are straightforward to implement, as there is no special
   * behaviour.
   */
  adjustFollowingRanges(child, oldRange, newRange) {
    const childRange = child.instance.getRange().copy();

    if (oldRange.end.row === childRange.start.row) {
      childRange.start.column += oldRange.start.column - oldRange.end.column;
    }

    if (oldRange.end.row === childRange.end.row) {
      childRange.end.column += oldRange.start.column - oldRange.end.column;
    }

    childRange.start.row += oldRange.start.row - oldRange.end.row;
    childRange.end.row += oldRange.start.row - oldRange.end.row;

    if (newRange.start.row === childRange.start.row) {
      childRange.start.column += newRange.end.column - newRange.start.column;
    }

    if (newRange.start.row === childRange.end.row) {
      childRange.end.column += newRange.end.column - newRange.start.column;
    }

    childRange.start.row += newRange.end.row - newRange.start.row;
    childRange.end.row += newRange.end.row - newRange.start.row;

    console.log(`Adjusted child range from ${child.instance.getRange()} to ${childRange}`);
    child.instance.setRange(childRange);
  }
}


module.exports = {
  Snippet,
  Expansion,
};
