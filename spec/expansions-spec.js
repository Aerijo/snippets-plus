const SnippetsPlus = require("../lib/main");
const { SnippetParser } = require("../lib/snippet-parser");
const { TextEditor } = require("atom");

// These specs work with expansions directly.
// Put tests for package interaction (loading
// package/user snippets, observing them, etc.)
// somewhere else.

describe("Expansions", () => {
  let editor;

  async function expand(body) {
    const prefix = "prefix";

    SnippetsPlus.clearAll();
    await SnippetsPlus.loadTestSnippets({
      "*": {
        "test": {
          prefix,
          body,
        },
      },
    });

    editor = new TextEditor();
    editor.setText(prefix);

    SnippetsPlus.expandSnippetsUnderCursors(editor, new SnippetParser());
  }

  function getActiveExpansion() {
    const expansions = SnippetsPlus.getExpansionsForEditor(editor);
    for (const expansion of expansions) {
      return expansion;
    }
    return undefined;
  }

  function gotoNext() {
    return SnippetsPlus.gotoNextTabStop(editor);
  }

  function gotoPrevious() {
    return SnippetsPlus.gotoPreviousTabStop(editor);
  }

  it("expands simple snippet", async () => {
    const text = "Hello world";
    await expand(text);
    expect(editor.getText()).toBe(text);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, text.length]);
    expect(gotoNext()).toBe(false);
  });

  it("does not insert $0 when already present", async () => {
    await expand("foo$0bar");
    expect(editor.getText()).toBe("foobar");
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
    expect(gotoNext()).toBe(false);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
  });

  it("adds an implicit $0 tab stop when not present", async () => {
    await expand("foo$1bar");
    expect(editor.getText()).toBe("foobar");
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
    expect(gotoNext()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
    expect(gotoNext()).toBe(false);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
  });

  it("goes back and forth between sequential tab stops", async () => {
    await expand("foo$1bar$2baz$3qux");
    expect(editor.getText()).toBe("foobarbazqux");
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
    expect(gotoNext()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
    expect(gotoNext()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 9]);
    expect(gotoPrevious()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
  });

  it("ignores attempts to go back on the first tab stop", async () => {
    await expand("foo$1bar");
    expect(editor.getText()).toBe("foobar");
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
    expect(gotoPrevious()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 3]);
    expect(gotoNext()).toBe(true);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
    expect(gotoNext()).toBe(false);
    expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 6]);
  });

  describe("when typing with an active expansion", async () => {
    function getTabStopsByLocation() {
      const expansion = getActiveExpansion();
      return expansion.tabStopsByLocation;
    }

    it("moves tab stop ranges correctly (1)", async () => {
      await expand("foo$2bar$1$3baz$0");
      const stops = getTabStopsByLocation();

      expect(stops.rootFrame.children.length).toBe(4);
      expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 6], [0, 6]]);
      expect(stops.rootFrame.children[2].instance.getRange()).toEqual([[0, 6], [0, 6]]);
      expect(stops.rootFrame.children[3].instance.getRange()).toEqual([[0, 9], [0, 9]]);

      editor.setTextInBufferRange([[0, 6], [0, 6]], "a");

      expect(stops.rootFrame.children.length).toBe(4);
      expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 6], [0, 7]]);
      expect(stops.rootFrame.children[2].instance.getRange()).toEqual([[0, 7], [0, 7]]);
      expect(stops.rootFrame.children[3].instance.getRange()).toEqual([[0, 10], [0, 10]]);
    });
  });
});
