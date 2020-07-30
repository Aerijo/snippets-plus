const { Point, Range, Emitter, CompositeDisposable } = require("atom");

const { TabStopInstance, TabStopGroup, TabStopTree } = require("./tab-stops");
const { Transformation } = require("./transformation");
const { getOrCompute } = require("./util");

class Expansion {
  constructor(parseTree, context, insertionRange, markerLayer) {
    this.subscriptions = new CompositeDisposable();
    this.context = context;
    this.editor = context.editor;
    this.buffer = context.editor.getBuffer();
    this.activeStopIndex = -1;
    this.emitter = new Emitter();
    this.markerLayer = markerLayer;
    this.finished = false;

    // autocomplete-plus performs the changes as a single transaction,
    // so we don't get the did change notification until after the fact.
    this.isFirstBufferChange = true;

    const {
      text,
      tabStopsByGroup,
      tabStopsByLocation,
    } = generateExpansionContents(parseTree, context);

    this.tabStopsByGroup = tabStopsByGroup;
    this.tabStopsByLocation = tabStopsByLocation;

    this.subscriptions.add(
      this.buffer.onDidChange((event) => {
        if (this.isFirstBufferChange) {
          this.isFirstBufferChange = false;
          this.addMarkers(this.markerLayer);
          this.gotoNext();
        } else {
          this.onDidChange(event.changes);
        }
      })
    );

    this.buffer.setTextInRange(insertionRange, text);
  }

  dispose() {
    this.emitFinish();
  }

  onDidFinish(cb) {
    return this.emitter.on("finish", cb);
  }

  emitFinish() {
    this.subscriptions.dispose();
    for (const group of this.tabStopsByGroup) {
      group.destroy();
    }
    this.emitter.emit("finish");
    this.finished = true;
  }

  onDidChange(changes) {
    const activeInstances = new Set(
      this.tabStopsByGroup[this.activeStopIndex].instances
    );
    this.tabStopsByLocation.adjust(changes, activeInstances);
  }

  gotoNext() {
    this.gotoIndex(this.activeStopIndex + 1);

    if (this.activeStopIndex >= this.tabStopsByGroup.length - 1) {
      this.emitFinish();
    }

    return true;
  }

  gotoPrevious() {
    if (this.activeStopIndex === 0) {
      return true;
    }

    this.gotoIndex(this.activeStopIndex - 1);
    return true;
  }

  gotoIndex(index) {
    if (this.activeStopIndex >= 0) {
      const activeInstances = this.tabStopsByGroup[this.activeStopIndex]
        .instances;
      for (const instance of activeInstances) {
        instance.applyTransformation(this.editor, this.context);
      }
    }

    const instances = this.tabStopsByGroup[index].instances;
    const ranges = instances.map((instance) => instance.getRange());
    this.editor.setSelectedBufferRanges(ranges);

    this.activeStopIndex = index;
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
    const group = getOrCompute(
      tabStopGroups,
      index,
      () => new TabStopGroup(index)
    );

    if (tabStopItem.choices) {
      for (const choice of tabStopItem.choices) {
        group.choices.add(choice);
      }
    }

    const start = new Point(row, column);
    const instance = new TabStopInstance(new Range(start, start));
    group.addInstance(instance);

    if (tabStopItem.transformation) {
      const { find, replace } = tabStopItem.transformation;
      instance.transformation = new Transformation(find, replace);
    }

    if (tabStopItem.content) {
      tabStopTree.pushFrame(instance);
      insertContent(tabStopItem.content);
      instance.range.end = new Point(row, column);
      tabStopTree.popFrame();
    } else {
      tabStopTree.insert(instance);
    }
  }

  function resolveVariableTransformation({ find, replace }, input) {
    const transformation = new Transformation(find, replace);
    return transformation.transform(input, context);
  }

  function resolveVariable(variableItem) {
    const name = variableItem.variable;

    let resolved = context.variableResolver.resolve(name, context);
    if (typeof resolved === "string") {
      if (variableItem.transformation) {
        const transformed = resolveVariableTransformation(
          variableItem.transformation,
          resolved
        );
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
      const instance = new TabStopInstance(new Range(start, end));
      tabStopTree.insert(instance);
      unknownVariables.push(instance);
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

  const tabStopsByGroup = finalizeTabStops(
    tabStopGroups,
    tabStopTree,
    unknownVariables,
    row,
    column
  );

  return {
    text: text.join(""),
    tabStopsByGroup,
    tabStopsByLocation: tabStopTree,
  };
}

function finalizeTabStops(
  tabStopGroups,
  tabStopTree,
  unknownVariables,
  endRow,
  endColumn
) {
  const result = [];

  const endTabStopGroup = tabStopGroups.get(0);
  tabStopGroups.delete(0);

  const indices = [...tabStopGroups.keys()].sort();

  for (const index of indices) {
    result.push(tabStopGroups.get(index));
  }

  for (const unknownVariable of unknownVariables) {
    const group = new TabStopGroup();
    group.addInstance(unknownVariable);
    result.push(group);
  }

  if (endTabStopGroup) {
    result.push(endTabStopGroup);
  } else {
    const endGroup = new TabStopGroup();
    const endPoint = new Point(endRow, endColumn);
    const endInstance = new TabStopInstance(new Range(endPoint, endPoint));
    endGroup.addInstance(endInstance);
    result.push(endGroup);
    tabStopTree.insert(endInstance);
  }

  return result;
}

module.exports = {
  Expansion,
};
