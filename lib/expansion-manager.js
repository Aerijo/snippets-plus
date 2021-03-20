const { EventEmitter } = require("events");
const { Point, Range } = require("atom");

const { Expansion } = require("./expansion");
const { getScopeChain } = require("./util");

// Tracks the active expansions for an editor
//
// There are a lot of edge cases when dealing with multiple cursors and
// 'external' operations on the text buffer. The general guarantees across
// all rule sets are:
//
// - With a single cursor, expanding will pick the  snippet with the largest
//    possible prefix
// - With several cursors, if all cursors have the same prefix when evaluated
//    independently, then each is expanded into the snippet
//
// Rules 1: (Conservative)
// - A snippet may only be expanded if every cursor has the same prefix
// - If some cursors can have longer prefixes, then no expansion (we don't shorten them to satisfy the condition)
// - If a cursor is added externally, terminate snippet
//
// We don't terminate just from buffer changes, as it may be a teletype document
// or there may be other operations (e.g., a language server adding a dependency).
// This also means we must work in terms of Markers, which the buffer will automatically
// track for us.
//
//
// Rules 2: (VS Code)
// - A snippet is controlled by the earliest/latest added cursor
// - Other cursors delete the prefix on expansion if they have it, else just expand directly
class ExpansionManager {
  constructor(snippets, editor) {
    this.snippets = snippets;
    this.editor = editor;
    this.dynamicPrefix = true;
    this.expansions = new Set();
    this.historyProxy = new EditorHistoryProxy(editor);
    this.markerLayer = this.editor.addMarkerLayer();
    this.transformResolver = snippets.transformResolver;
    this.variableResolver = snippets.variableResolver;
    this.markerDecoration = this.editor.decorateMarkerLayer(
      this.markerLayer,
      this.getMarkerDecorationParams()
    );

    this.historyProxy.onPreUndo(() => {
      console.log("Did pre undo");
      console.log(this.editor.getText());
    });

    this.historyProxy.onPostUndo(() => {
      console.log("Did post undo");
      console.log(this.editor.getText());
    });

    this.historyProxy.onPostRedo(() => {
      console.log("Did post redo");
    });
  }

  dispose() {
    this.historyProxy.disable();
    this.markerLayer.destroy();

    for (const expansion of this.expansions) {
      expansion.dispose();
    }
  }

  getExpansions() {
    return this.expansions;
  }

  hasActiveExpansions() {
    return this.expansions.size > 0;
  }

  cancelExpansions() {
    if (this.expansions.size === 0) {
      return false;
    }

    for (const expansion of this.expansions) {
      expansion.finish();
    }

    return true;
  }

  getMarkerDecorationParams() {
    return {
      type: "highlight",
      class: "snippet-tab-stop",
    };
  }

  gotoNextTabStop() {
    if (this.expansions.size === 0) {
      return false;
    }

    for (const expansion of this.expansions) {
      expansion.gotoNext();
    }

    this.notifyChangeExpansionState();
    return true;
  }

  gotoPreviousTabStop() {
    if (this.expansions.size === 0) {
      return false;
    }

    for (const expansion of this.expansions) {
      expansion.gotoPrevious();
    }

    this.notifyChangeExpansionState();
    return true;
  }

  expandSnippetWithPrefix(insertionRange, prefix, parser) {
    const scope = this.editor.scopeDescriptorForBufferPosition(
      insertionRange.end
    );
    const candidates = this.snippets.getSnippetsForSelector(scope);
    if (!candidates) {
      return false;
    }

    const snippet = this.getSnippetForPrefix(prefix, candidates);
    if (snippet.prefix !== prefix) {
      return false;
    }

    const selectionRange = this.editor
      .getLastCursor()
      .selection.getBufferRange();
    this.editor.setSelectedBufferRange(insertionRange);
    const cursor = this.editor.getLastCursor();
    const context = this.getContext(cursor, "");
    context.selectionRange = selectionRange;
    context.insertionPoint = insertionRange.end;

    const expansion = new Expansion(
      snippet.getTree(parser),
      context,
      insertionRange,
      this.markerLayer
    );

    this.registerExpansion(expansion);

    return true;
  }

  expandSnippetsUnderCursors(parser) {
    const cursor = this.editor.getLastCursor();
    const scope = cursor.getScopeDescriptor();
    const candidates = this.snippets.getSnippetsForSelector(scope);
    if (!candidates) {
      return false;
    }

    const cursorPosition = cursor.getBufferPosition();
    const prefixCandidate = this.editor.getTextInBufferRange([
      cursorPosition.translate(new Point(0, -50)),
      cursorPosition,
    ]);
    const snippet = this.getSnippetForPrefix(prefixCandidate, candidates);
    if (!snippet) {
      return false;
    }

    const prefix = snippet.prefix;
    const prefixRange = new Range(
      cursorPosition.translate(new Point(0, -prefix.length)),
      cursorPosition
    );

    const expansion = new Expansion(
      snippet.getTree(parser),
      this.getContext(cursor, prefix),
      prefixRange,
      this.markerLayer
    );

    this.registerExpansion(expansion);

    return true;
  }

  expandSnippet(snippet, parser, cursor = undefined) {
    if (!cursor) {
      cursor = this.editor.getLastCursor();
    }

    const selectionRange = cursor.selection.getBufferRange();
    this.editor.setSelectedBufferRange(selectionRange);
    const context = this.getContext(cursor, "");
    context.selectionRange = selectionRange;
    context.insertionPoint = selectionRange.end;
    context.isAnonymousSnippet = snippet.isAnonymousSnippet;

    const expansion = new Expansion(
      snippet.getTree(parser),
      context,
      selectionRange,
      this.markerLayer
    );

    this.registerExpansion(expansion);

    return true;
  }

  expandSnippetFromSet(availableSnippets, parser) {
    const selection = this.editor.getLastSelection();
    const scope = this.editor.scopeDescriptorForBufferPosition(
      selection.getBufferRange().end
    );
    const snippet = availableSnippets.getPropertyValue(
      getScopeChain(scope),
      "snippet"
    );

    if (!snippet) {
      return false;
    }

    const prefix = "";
    const prefixRange = selection.getBufferRange();

    const context = this.getContext(this.editor.getLastCursor(), prefix);

    const expansion = new Expansion(
      snippet.getTree(parser),
      context,
      prefixRange,
      this.markerLayer
    );

    this.registerExpansion(expansion);

    return true;
  }

  getExpansionState() {
    const expansion = this.expansions.values().next().value;
    if (expansion === undefined) {
      return undefined;
    }
    return expansion.getExpansionState();
  }

  registerExpansion(expansion) {
    if (!expansion.finished) {
      this.expansions.add(expansion);
      this.notifyChangeExpansionState();
      expansion.onDidFinish(() => {
        this.expansions.delete(expansion);
        this.notifyChangeExpansionState();
      });
    }
  }

  notifyChangeExpansionState() {
    this.snippets.notifyChangeExpansionState(
      this.editor,
      this.getExpansionState()
    );
  }

  getContext(cursor, prefix) {
    const selection = cursor.selection;
    const start = selection
      .getBufferRange()
      .start.translate(new Point(0, -prefix.length));
    return {
      prefix: prefix,
      editor: this.editor,
      indent: this.editor.lineTextForBufferRow(start.row).match(/^\s*/)[0],
      cursor,
      selectionRange: selection.getBufferRange(),
      parser: this.snippets.getSnippetParser(),
      start,
      variableResolver: this.variableResolver,
      transformResolver: this.transformResolver,
      insertionPoint: cursor.getBufferPosition(),
      time: new Date(),
    };
  }

  /**
   * @param {string} currentPrefix The prefix we are picking a snippet for
   * @param {} candidatesByPrefix The candidate snippets for the cursor scope
   */
  getSnippetForPrefix(currentPrefix, candidatesByPrefix) {
    let best = undefined;
    let bestLength = 0;

    for (const [prefix, snippet] of Object.entries(candidatesByPrefix)) {
      if (prefix.length > bestLength && currentPrefix.endsWith(prefix)) {
        best = snippet;
        bestLength = prefix.length;
      }
    }

    return best;
  }
}

class EditorHistoryProxy {
  constructor(editor) {
    this.emitter = new EventEmitter();
    this.editor = editor;
    this.originalUndo = editor.undo;
    this.originalRedo = editor.redo;
  }

  enable() {
    this.editor.undo = (...args) => {
      this.emitter.emit("pre-undo");
      const result = this.originalUndo.apply(this.editor, ...args);
      this.emitter.emit("post-undo", result);
      return result;
    };

    this.editor.redo = (...args) => {
      this.emitter.emit("pre-redo");
      const result = this.originalRedo.apply(this.editor, ...args);
      this.emitter.emit("post-redo", result);
      return result;
    };
  }

  disable() {
    this.editor.undo = this.originalUndo;
    this.editor.redo = this.originalRedo;
  }

  onPreUndo(cb) {
    this.emitter.on("pre-undo", cb);
  }

  onPreRedo(cb) {
    this.emitter.on("pre-redo", cb);
  }

  onPostUndo(cb) {
    this.emitter.on("post-undo", cb);
  }

  onPostRedo(cb) {
    this.emitter.on("post-redo", cb);
  }
}

module.exports = {
  ExpansionManager,
};
