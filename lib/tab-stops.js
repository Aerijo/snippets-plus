const assert = require("assert").strict;
const { Point, Range } = require("atom");

// Represents a single tab stop range (that you would write
// as $1 in a snippet). There may be multiple active simultaneously
// (those in the group). Manages the marker and transformations of
// this instance of the group.
class TabStopInstance {
  constructor(range) {
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
    this.marker = markerLayer.markBufferRange(this.range, {
      invalidate: "never",
      exclusive: true,
    });
  }

  destroy() {
    if (this.marker) {
      this.marker.destroy();
    }
  }

  applyTransformation(editor, context) {
    if (!this.transformation) {
      return;
    }

    const range = this.getRange();
    const input = editor.getTextInBufferRange(range);
    const transformed = this.transformation.transform(input, context);
    editor.setTextInBufferRange(range, transformed);
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

  hasInstanceWithPoint(point) {
    for (const instance of this.instances) {
      if (instance.getRange().containsPoint(point)) {
        return true;
      }
    }

    return false;
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

  adjust(changes, activeInstances) {
    // The oldRange's are for the current TextBuffer, the newRange's are
    // for the final result. We adjust the newRange's so we can iterate
    // the list one change at a time

    const adjustedChanges = changes.map(({ oldRange, newRange }) => {
      return {
        oldRange,
        newRange: new Range(
          oldRange.start,
          new Point(
            oldRange.start.row + newRange.end.row - newRange.start.row,
            newRange.isSingleLine()
              ? oldRange.start.column +
                newRange.end.column -
                newRange.start.column
              : newRange.end.column
          )
        ),
      };
    });

    for (let i = adjustedChanges.length - 1; i >= 0; i--) {
      const { oldRange, newRange } = adjustedChanges[i];
      this.adjustRanges(
        this.rootFrame.children,
        oldRange,
        newRange,
        activeInstances
      );
    }
  }

  adjustRanges(frames, oldRange, newRange, active) {
    assert(oldRange.start.isEqual(newRange.start), "Unexpected change");

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      let range = frame.instance.getRange();

      if (range.end.isLessThan(oldRange.start)) {
        // no need to adjust children, as they must end on or before
        // the parent
        continue;
      }

      const isActive = active.has(frame.instance);

      if (
        (range.start.isLessThan(oldRange.start) ||
          (isActive && range.start.isEqual(oldRange.start))) &&
        (range.end.isGreaterThan(oldRange.end) ||
          (isActive && range.end.isEqual(oldRange.end)))
      ) {
        this.adjustContainedRange(frame, oldRange, newRange, active);
        continue;
      }

      if (range.start.isGreaterThanOrEqual(oldRange.end)) {
        this.adjustTrailingRanges(frame, oldRange, newRange, active);
        continue;
      }

      if (range.end.isEqual(oldRange.start)) {
        this.adjustRanges(frame.children, oldRange, newRange, active);

        for (const child of frame.children) {
          const childRange = child.instance.getRange();
          if (childRange.end.isGreaterThan(range.end)) {
            range.end = childRange.end;
          }

          if (childRange.start.isLessThan(range.start)) {
            range.start = childRange.start;
          }
        }

        frame.instance.setRange(range);
        continue;
      }

      // Unhandled, for now just go with marker behaviour
      if (frame.instance.marker) {
        range = frame.instance.marker.bufferMarker.getRange();

        this.adjustRanges(frame.children, oldRange, newRange, active);

        for (const child of frame.children) {
          const childRange = child.instance.getRange();
          if (childRange.end.isGreaterThan(range.end)) {
            range.end = childRange.end;
          }

          if (childRange.start.isLessThan(range.start)) {
            range.start = childRange.start;
          }
        }

        frame.instance.setRange(range);
      }
    }
  }

  adjustContainedRange(frame, oldRange, newRange, active) {
    // For when the frame's range should grow / shrink with the change
    // and the change starts after the frame starts
    //
    // The start point is stationary, the end point moves according to
    // the diff between the old end and new end

    const range = frame.instance.getRange().copy();

    const rowDiff = newRange.end.row - oldRange.end.row;
    const colDiff = newRange.end.column - oldRange.end.column;

    if (range.end.row === oldRange.end.row) {
      range.end.column += colDiff;
    }

    range.end.row += rowDiff;

    this.adjustRanges(frame.children, oldRange, newRange, active);

    for (const child of frame.children) {
      const childRange = child.instance.getRange();
      if (childRange.end.isGreaterThan(range.end)) {
        range.end = childRange.end;
      }

      if (childRange.start.isLessThan(range.start)) {
        range.start = childRange.start;
      }
    }

    frame.instance.setRange(range);
  }

  adjustTrailingRanges(frame, oldRange, newRange, active) {
    const rowDiff = newRange.end.row - oldRange.end.row;
    const colDiff = newRange.end.column - oldRange.end.column;

    const range = frame.instance.getRange().copy();

    if (range.start.row === oldRange.end.row) {
      range.start.column += colDiff;

      if (range.end.row === oldRange.end.row) {
        range.end.column += colDiff;
      }
    }

    range.start.row += rowDiff;
    range.end.row += rowDiff;

    this.adjustRanges(frame.children, oldRange, newRange, active);

    for (const child of frame.children) {
      const childRange = child.instance.getRange();
      if (childRange.end.isGreaterThan(range.end)) {
        range.end = childRange.end;
      }

      if (childRange.start.isLessThan(range.start)) {
        range.start = childRange.start;
      }
    }

    frame.instance.setRange(range);
  }

  /**
   * Corrects the ranges of any instances that occur after the change.
   * These are straightforward to implement, as there is no special
   * behaviour.
   */
  adjustFollowingRanges(child, oldRange, newRange) {
    assert(oldRange.start.isEqual(newRange.start), "Unexpected change");

    const childRange = child.instance.getRange().copy();

    if (oldRange.end.row === childRange.start.row) {
      childRange.start.column += newRange.end.column - oldRange.end.column;
    }

    if (oldRange.end.row === childRange.end.row) {
      childRange.end.column += newRange.end.column - oldRange.end.column;
    }

    childRange.start.row += newRange.end.row - oldRange.end.row;
    childRange.end.row += newRange.end.row - oldRange.end.row;

    child.instance.setRange(childRange);

    for (const c of child.children) {
      this.adjustFollowingRanges(c, oldRange, newRange);
    }
  }
}

module.exports = {
  TabStopInstance,
  TabStopGroup,
  TabStopTree,
};
