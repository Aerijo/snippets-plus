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
    this.marker = markerLayer.markBufferRange(this.range, { invalidate: "never", exclusive: true });
  }

  destroy() {
    if (this.marker) {
      this.marker.destroy();
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
    // for the final result. For now just treat it as a set of deletions,
    // followed by insertions

    const adjustedChanges = changes.map(({ oldRange, newRange }) => {
      return {
        oldRange,
        newRange: new Range(
          oldRange.start,
          new Point(
            oldRange.start.row + newRange.end.row - newRange.start.row,
            newRange.isSingleLine() ? oldRange.start.column + newRange.end.column - newRange.start.column : newRange.end.column,
          ),
        ),
      }
    });

    for (let i = adjustedChanges.length - 1; i >= 0; i--) {
      const { oldRange, newRange } = adjustedChanges[i];
      this.adjustRanges(this.rootFrame.children, oldRange, newRange, activeInstances);
    }

    //
    // for (let i = 0; i < changes.length; i++) {
    //   const { newRange } = changes[i];
    //   this.insertRange(this.rootFrame.children, newRange, activeInstances);
    // }
    //
    //
    // console.log(`Adjusting for ${oldRange} -> ${newRange}`);
    //
    // for (const child of this.rootFrame.children) {
    //   const childRange = child.instance.range;
    //   console.log(child, `${childRange}`);
    //
    //   if (childRange.end.isLessThan(oldRange.start)) {
    //     console.log("before, skipping");
    //     continue;
    //   } else if (childRange.isEmpty() && oldRange.isEmpty() && oldRange.start.isEqual(childRange.start)) {
    //     if (activeInstances.has(child.instance)) {
    //       // grow with change
    //     } else {
    //       let hasActiveLeft = false;
    //       for (const c of this.rootFrame.children) {
    //         if (c === child) { break; }
    //         if (activeInstances.has(c)) { hasActiveLeft = true; break; }
    //       }
    //       if (hasActiveLeft) {
    //         // get pushed right by change
    //       }
    //     }
    //   }
    //
    //   if (childRange.start.isLessThan(oldRange.start)) {
    //
    //   }
    //
    //   if (childRange.end.isEqual(oldRange.start)) {
    //
    //   }
    //
    //   if (childRange.start.isEqual(oldRange.end)) {
    //
    //   }
    //
    //   if (childRange.start.isGreaterThan(oldRange.end)) {
    //     console.log("after, adjusting");
    //     this.adjustFollowingRanges(child, oldRange, newRange);
    //   }
    // }
  }

  adjustRanges(frames, oldRange, newRange, active) {
    assert(oldRange.start.isEqual(newRange.start), "Unexpected change");
    console.log(active);
    console.log(`Change: ${oldRange} -> ${newRange}`);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const range = frame.instance.getRange();

      console.log(`examining ${range}`);

      if (range.end.isLessThan(oldRange.start)) {
        console.log(`${range.end} < ${oldRange.start}`);
        continue;
      }

      const isActive = active.has(frame.instance);
      console.log(`active: ${isActive}`);

      if (
        (range.start.isLessThan(oldRange.start) || (isActive && range.start.isEqual(oldRange.start))) &&
        (range.end.isGreaterThan(oldRange.end) || (isActive && range.end.isEqual(oldRange.end)))
      ) {
        console.log(`active ${range} contains ${oldRange}`);
        this.adjustContainedRange(frame, oldRange, newRange);
      } else if (range.start.isGreaterThanOrEqual(oldRange.end)) {
        console.log(`${range.start} > ${oldRange.end}`);
        this.adjustTrailingRanges(frame, oldRange, newRange);
      }
    }
  }

  adjustContainedRange(frame, oldRange, newRange) {
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

    console.log(`${frame.instance.getRange()} -> ${range}`);
    frame.instance.setRange(range);

    // TODO: Children
  }

  adjustTrailingRanges(frame, oldRange, newRange) {
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

    console.log(`${frame.instance.getRange()} -> ${range}`);
    frame.instance.setRange(range);

    for (const child of frame.children) {
      this.adjustTrailingRanges(child, oldRange, newRange);
    }
  }

  //
  // deleteRange(frames, range, active) {
  //   for (let i = frames.length; i >= 0; i--) {
  //     const frame = frames[i];
  //     const instanceRange = frame.instance.getRange();
  //
  //     // Handle non-overlap
  //     if (instanceRange.end.isLessThan(range)) {
  //       return; // all instances to the left will also be unaffected
  //     }
  //
  //     if (instanceRange.start.isGreaterThan(range)) {
  //       const newRange = instanceRange.copy();
  //       if (range.end.row === instanceRange.start.row) {
  //         newRange.start.column += range.start.column - range.end.column;
  //       }
  //
  //       if (range.end.row === instanceRange.end.row) {
  //         newRange.end.column += range.start.column - range.end.column;
  //       }
  //
  //       newRange.start.row -= range.end.row - range.start.row;
  //       newRange.end.row -= range.end.row - range.start.row;
  //
  //       frame.instance.setRange(newRange);
  //     }
  //
  //     // Handle overlap
  //   }
  // }
  //
  // insertRange(frames, range, active) {
  //
  // }

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

    console.log(`Adjusted child range from ${child.instance.getRange()} to ${childRange}`);
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
}
