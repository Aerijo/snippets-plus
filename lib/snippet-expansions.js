const { EventEmitter } = require("events");

const { Point, Range } = require("atom");

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
class SnippetExpansions {
  constructor(snippets, editor) {
    this.snippets = snippets;
    this.editor = editor;
    this.dynamicPrefix = true;
    this.expansions = [];
    this.historyProxy = new EditorHistoryProxy(editor);

    this.historyProxy.onPreUndo(() => {
      console.log("Did pre undo");
      console.log(this.editor.getText())
    });

    this.historyProxy.onPostUndo(() => {
      console.log("Did post undo");
      console.log(this.editor.getText())
    });

    this.historyProxy.onPostRedo(() => {
      console.log("Did post redo");
    });
  }

  gotoNextTabStop() {
    return false;
  }

  expandSnippetsUnderCursors(parser) {
    const cursor = this.editor.getLastCursor();
    const scope = cursor.getScopeDescriptor();
    const candidates = this.snippets.getSnippetsForSelector(scope);
    const cursorPosition = cursor.getBufferPosition();
    const prefix = this.editor.getTextInBufferRange([cursorPosition.translate(new Point(0, -50)), cursorPosition]);
    const snippet = this.getSnippetForPrefix(prefix, candidates);

    if (!snippet) {
      return false;
    }

    const prefixRange = new Range(cursorPosition.translate(new Point(0, -prefix.length)), cursorPosition);

    console.log(snippet);

    const expansion = snippet.getExpansion(this.getContext(cursor, prefix), parser);

    console.log(expansion);

    this.editor.setTextInBufferRange(prefixRange, expansion.getText());

    return true;
  }

  getContext(cursor, prefix) {
    const selection = cursor.selection;
    const start = selection.getBufferRange().start.translate(new Point(0, -prefix.length));
    return {
      editor: this.editor,
      indent: this.editor.lineTextForBufferRow(start.row).match(/^\s*/)[0],
      cursor,
      selection,
      selected: selection.getText(),
      parser: this.snippets.getSnippetParser(),
      start,
    }
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
      this.emitter.emit("post-undo");
      return result;
    }

    this.editor.redo = (...args) => {
      this.emitter.emit("pre-redo");
      const result = this.originalRedo.apply(this.editor, ...args);
      this.emitter.emit("post-redo");
      return result;
    }
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
  SnippetExpansions,
};