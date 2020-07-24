const { Point, Range, Emitter, CompositeDisposable } = require("atom");

const { TabStopInstance, TabStopGroup, TabStopTree } = require("./tab-stops");
const { getOrCompute } = require("./util");

class Expansion {
  constructor(parseTree, context, insertionRange, markerLayer) {
    this.subscriptions = new CompositeDisposable();
    this.context = context;
    this.buffer = context.editor.getBuffer();
    this.activeStopIndex = -1;
    this.emitter = new Emitter();
    this.markerLayer = markerLayer;

    const { text, tabStopsByGroup, tabStopsByLocation } = generateExpansionContents(parseTree, context);

    this.buffer.setTextInRange(insertionRange, text);
    this.tabStopsByGroup = tabStopsByGroup;
    this.tabStopsByLocation = tabStopsByLocation;

    this.subscriptions.add(this.buffer.onDidChange(event => {
      this.onDidChange(event.changes);
    }));

    this.addMarkers(this.markerLayer);
    this.gotoNext();
  }

  onDidFinish(cb) {
    return this.emitter.on("finish", cb);
  }

  emitFinish() {
    console.log("finished", this);
    this.subscriptions.dispose();
    for (const group of this.tabStopsByGroup) {
      group.destroy();
    }
    this.emitter.emit("finish");
  }

  onDidChange(changes) {
    console.log(changes);
    const activeInstances = new Set(this.tabStopsByGroup[this.activeStopIndex].instances);
    this.tabStopsByLocation.adjust(changes, activeInstances);
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
    console.log("going to previous");
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

function generateExpansionContents(parseTree, context) {
  const { start, indent } = context;

  let row = start.row;
  let column = start.column;

  const text = [];
  const tabStopGroups = new Map();
  const tabStopTree = new TabStopTree();
  const unknownVariables = [];

  /** @param {string} t Text chunk to insert */
  function insertText(t) {
    const lines = t.split("\n");

    text.push(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      text.push(`\n${indent}${lines[i]}`);
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
    const group = getOrCompute(tabStopGroups, index, () => new TabStopGroup(index));

    const start = new Point(row, column);
    const instance = new TabStopInstance(group, new Range(start, start));

    if (tabStopItem.content) {
      tabStopTree.pushFrame(instance);
      insertContent(tabStopItem.content);
      instance.range.end = new Point(row, column);
      group.addInstance(instance);
      tabStopTree.popFrame();
    } else if (tabStopItem.transformation) {
      // Tab stop with transformation
      console.log("TODO: tab stop transformations");
      group.addInstance(instance);
      tabStopTree.insert(instance);
    } else {
      if (tabStopItem.choices) {
        for (const choice of tabStopItem.choices) {
          group.choices.add(choice);
        }
      }
      group.addInstance(instance);
      tabStopTree.insert(instance);
    }
  }

  function resolveTransformation(transformation, input) {
    console.log("TODO: Transformation", transformation, input);
  }

  function resolveVariable(variableItem) {
    const name = variableItem.variable;

    let resolved = context.variableResolver.resolve(name, context);
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
      insertContent(variableItem.content);
    } else {
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
      } else if (item.index !== undefined) {
        resolveTabStop(item);
      } else if (item.variable !== undefined) {
        resolveVariable(item);
      }
    }
  }

  insertContent(parseTree);

  const tabStopsByGroup = finalizeTabStops(tabStopGroups, tabStopTree, unknownVariables, row, column);

  return {
    text: text.join(""),
    tabStopsByGroup,
    tabStopsByLocation: tabStopTree,
  }
}

function finalizeTabStops(tabStopGroups, tabStopTree, unknownVariables, endRow, endColumn) {
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

module.exports = {
  Expansion,
}
