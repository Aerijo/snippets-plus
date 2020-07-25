  const path = require("path");

const SnippetsPlus = require("../lib/main");
const { SnippetParser } = require("../lib/snippet-parser");
const { TextEditor, Range, Point } = require("atom");

// These specs work with expansions directly.
// Put tests for package interaction (loading
// package/user snippets, observing them, etc.)
// somewhere else.

describe("Expansions", () => {
  let editor;

  async function loadSnippet(prefix, body) {
    SnippetsPlus.clearAll();
    await SnippetsPlus.loadTestSnippets({
      "*": {
        "test": {
          prefix,
          body,
        },
      },
    });
  }

  async function expand(body, e=new TextEditor()) {
    const prefix = "prefix";
    await loadSnippet(prefix, body);
    editor = e;
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

  it("inserts and selects the placeholder text", async () => {
    await expand("a${1:1}b${2:2}c${3:3}d${3:3}");
    let cursors = editor.getCursorsOrderedByBufferPosition();
    expect(cursors.length).toBe(1);
    expect(cursors[0].selection.getBufferRange()).toEqual([[0, 1], [0, 2]]);
    expect(gotoNext()).toBe(true);

    cursors = editor.getCursorsOrderedByBufferPosition();
    expect(cursors.length).toBe(1);
    expect(cursors[0].selection.getBufferRange()).toEqual([[0, 3], [0, 4]]);
    expect(gotoNext()).toBe(true);

    cursors = editor.getCursorsOrderedByBufferPosition();
    expect(cursors.length).toBe(2);
    expect(cursors[0].selection.getBufferRange()).toEqual([[0, 5], [0, 6]]);
    expect(cursors[1].selection.getBufferRange()).toEqual([[0, 7], [0, 8]]);
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

  describe("when snippets contain variables", () => {
    it("treats unknown variables as tab stops after the proper ones", async () => {
      await expand("$UNKNOWN foo $1 $UNKNOWN");
      expect(editor.getText()).toBe("UNKNOWN foo  UNKNOWN");
      let cursors = editor.getCursorsOrderedByBufferPosition();
      expect(cursors.length).toBe(1);
      expect(cursors[0].selection.getBufferRange()).toEqual([[0, 12], [0, 12]]);

      expect(gotoNext()).toBe(true);
      cursors = editor.getCursorsOrderedByBufferPosition();
      expect(cursors.length).toBe(1);
      expect(cursors[0].selection.getBufferRange()).toEqual([[0, 0], [0, 7]]);

      expect(gotoNext()).toBe(true);
      cursors = editor.getCursorsOrderedByBufferPosition();
      expect(cursors.length).toBe(1);
      expect(cursors[0].selection.getBufferRange()).toEqual([[0, 13], [0, 20]]);

      expect(gotoNext()).toBe(true);
      cursors = editor.getCursorsOrderedByBufferPosition();
      expect(cursors.length).toBe(1);
      expect(cursors[0].selection.getBufferRange()).toEqual([[0, 20], [0, 20]]);
    });

    it("uses the placeholder of unknown variables if possible", async () => {
      await expand("${UNKNOWN:placeholder}");
      expect(editor.getText()).toBe("placeholder");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_CURRENT_LINE", async () => {
      await loadSnippet("prefix", ">$TM_CURRENT_LINE<");
      editor = new TextEditor();
      editor.setText("foo prefix");
      SnippetsPlus.expandSnippetsUnderCursors(editor, new SnippetParser());

      expect(editor.getText()).toBe("foo >foo <");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_CURRENT_WORD", async () => {
      await loadSnippet("prefix", ">$TM_CURRENT_WORD<");
      editor = new TextEditor();
      editor.setText("foo prefix");
      SnippetsPlus.expandSnippetsUnderCursors(editor, new SnippetParser());

      expect(editor.getText()).toBe("foo >prefix<");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_DIRECTORY", async () => {
      await expand("$TM_DIRECTORY");
      expect(editor.getText()).toBe("TM_DIRECTORY");
      expect(gotoNext()).toBe(true);
      expect(gotoNext()).toBe(false);

      const emptyFile = path.join(__dirname, "fixtures", "empty.js");
      await expand("$TM_DIRECTORY", await atom.workspace.open(emptyFile));
      expect(editor.getText()).toBe(path.join(__dirname, "fixtures"));
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_FILENAME", async () => {
      await expand("$TM_FILENAME");
      expect(editor.getText()).toBe("untitled");
      expect(gotoNext()).toBe(false);

      const emptyFile = path.join(__dirname, "fixtures", "empty.js");
      await expand("$TM_FILENAME", await atom.workspace.open(emptyFile));
      expect(editor.getText()).toBe("empty.js");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_FILENAME_BASE", async () => {
      const emptyFile = path.join(__dirname, "fixtures", "empty.js");
      await expand("$TM_FILENAME_BASE", await atom.workspace.open(emptyFile));
      expect(editor.getText()).toBe("empty");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_FILEPATH", async () => {
      await expand("$TM_FILEPATH");
      expect(editor.getText()).toBe("TM_FILEPATH");
      expect(gotoNext()).toBe(true);
      expect(gotoNext()).toBe(false);

      const emptyFile = path.join(__dirname, "fixtures", "empty.js");
      await expand("$TM_FILEPATH", await atom.workspace.open(emptyFile));
      expect(editor.getText()).toBe(emptyFile);
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_LINE_INDEX", async () => {
      await expand("- $TM_LINE_INDEX\n- $TM_LINE_INDEX");
      expect(editor.getText()).toBe("- 0\n- 0");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_LINE_NUMBER", async () => {
      await expand("- $TM_LINE_NUMBER\n- $TM_LINE_NUMBER");
      expect(editor.getText()).toBe("- 1\n- 1");
      expect(gotoNext()).toBe(false);
    });

    it("supports $TM_SELECTED_TEXT", async () => {
      await loadSnippet("prefix", "$TM_SELECTED_TEXT");

      editor = new TextEditor();
      editor.setText("foo  baz");
      editor.setSelectedBufferRange([[0, 0], [0, 3]]);

      SnippetsPlus.expandSnippetWithPrefix(editor, new Range(new Point(0, 4), new Point(0, 4)), "prefix", new SnippetParser());

      expect(editor.getText()).toBe("foo foo baz");
      expect(gotoNext()).toBe(false);
      const cursors = editor.getCursorsOrderedByBufferPosition();
      expect(cursors.length).toBe(1);
      expect(cursors[0].selection.getBufferRange()).toEqual([[0, 7], [0, 7]]);

      // TODO: When no selected text (selection range is 0 width), fail
    });

    it("supports $CLIPBOARD", async () => {
      atom.clipboard.write("clipboard value");
      await expand("$CLIPBOARD");
      expect(editor.getText()).toBe("clipboard value");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_YEAR", async () => {
      await expand("$CURRENT_YEAR");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_YEAR_SHORT", async () => {
      await expand("$CURRENT_YEAR_SHORT");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_MONTH", async () => {
      await expand("$CURRENT_MONTH");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_MONTH_NAME", async () => {
      await expand("$CURRENT_MONTH_NAME");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_MONTH_NAME_SHORT", async () => {
      await expand("$CURRENT_MONTH_NAME_SHORT");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_DATE", async () => {
      await expand("$CURRENT_DATE");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_DAY_NAME", async () => {
      await expand("$CURRENT_DAY_NAME");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_DAY_NAME_SHORT", async () => {
      await expand("$CURRENT_DAY_NAME_SHORT");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_HOUR", async () => {
      await expand("$CURRENT_HOUR");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_MINUTE", async () => {
      await expand("$CURRENT_MINUTE");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_SECOND", async () => {
      await expand("$CURRENT_SECOND");
      expect(gotoNext()).toBe(false);
    });

    it("supports $CURRENT_SECONDS_UNIX", async () => {
      await expand("$CURRENT_SECONDS_UNIX");
      expect(gotoNext()).toBe(false);
    });

    it("supports $BLOCK_COMMENT_START and $BLOCK_COMMENT_END", async () => {
      await Promise.all([
        atom.packages.activatePackage("language-html"),
        atom.packages.activatePackage("language-javascript"),
      ]);

      const emptyHtml = path.join(__dirname, "fixtures", "empty.html");
      await expand("$BLOCK_COMMENT_START $0 $BLOCK_COMMENT_END", await atom.workspace.open(emptyHtml));
      expect(editor.getText()).toBe("<!--  -->");
      expect(gotoNext()).toBe(false);

      const emptyJs = path.join(__dirname, "fixtures", "empty.js");
      await expand("$BLOCK_COMMENT_START $0 $BLOCK_COMMENT_END", await atom.workspace.open(emptyJs));
      expect(editor.getText()).toBe("/*  */");
      expect(gotoNext()).toBe(false);
    });

    it("supports $LINE_COMMENT", async () => {
      await Promise.all([
        atom.packages.activatePackage("language-html"),
        atom.packages.activatePackage("language-javascript"),
      ]);

      const emptyHtml = path.join(__dirname, "fixtures", "empty.html");
      await expand("$LINE_COMMENT", await atom.workspace.open(emptyHtml));
      expect(editor.getText()).toBe("LINE_COMMENT");
      expect(gotoNext()).toBe(true);
      expect(gotoNext()).toBe(false);

      const emptyJs = path.join(__dirname, "fixtures", "empty.js");
      await expand("$LINE_COMMENT", await atom.workspace.open(emptyJs));
      expect(editor.getText()).toBe("//");
      expect(gotoNext()).toBe(false);
    });
  });

  describe("when typing with an active expansion", async () => {
    function getTabStopsByLocation() {
      const expansion = getActiveExpansion();
      return expansion.tabStopsByLocation;
    }

    it("tracks instances that are in the same position", async () => {
      await expand("a$1$1b");
      const stops = getTabStopsByLocation();

      expect(stops.rootFrame.children.length).toBe(3);
      expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 1], [0, 1]]);
      expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 1], [0, 1]]);
      expect(stops.rootFrame.children[2].instance.getRange()).toEqual([[0, 2], [0, 2]]);

      // TODO: Support treating a cursor as doubled when
      // - Multiple active tab stops end in same Point
      // - Change is an insertion at that Point
      //
      // And then test by inserting text 'c' -> expect 'a${1:c}${1:c}b'
    });

    it("moves tab stop ranges correctly (1)", async () => {
      await expand("foo$2bar$1$3baz$0");
      const stops = getTabStopsByLocation();

      expect(stops.rootFrame.children.length).toBe(4);
      expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 6], [0, 6]]);
      expect(stops.rootFrame.children[2].instance.getRange()).toEqual([[0, 6], [0, 6]]);
      expect(stops.rootFrame.children[3].instance.getRange()).toEqual([[0, 9], [0, 9]]);

      editor.insertText("a");

      expect(stops.rootFrame.children.length).toBe(4);
      expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 6], [0, 7]]);
      expect(stops.rootFrame.children[2].instance.getRange()).toEqual([[0, 7], [0, 7]]);
      expect(stops.rootFrame.children[3].instance.getRange()).toEqual([[0, 10], [0, 10]]);
    });

    describe("when the tab stops are nested", () => {
      it("pushes inner tab stops right when the outer is active", async () => {
        await expand("${1:$2}");
        const stops = getTabStopsByLocation();

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(1);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 0], [0, 0]]);

        editor.insertText("foo");

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(1);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 3]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 3], [0, 3]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      });

      it("pushes inner tab stops left if they are before first placeholder content", async () => {
        await expand("${1:$2a$2}");
        const stops = getTabStopsByLocation();

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(2);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 1]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[0].children[1].instance.getRange()).toEqual([[0, 1], [0, 1]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 1], [0, 1]]);

        editor.insertText("foo");

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(2);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 3]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[0].children[1].instance.getRange()).toEqual([[0, 3], [0, 3]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 3], [0, 3]]);

        expect(gotoNext()).toBe(true);
        debugger
        editor.insertText("bar");

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(2);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 9]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 3]]);
        expect(stops.rootFrame.children[0].children[1].instance.getRange()).toEqual([[0, 6], [0, 9]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 9], [0, 9]]);
      });

      it("grows outer tab stops when the inner is active", async () => {
        await expand("${2:$1}");
        const stops = getTabStopsByLocation();

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(1);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 0]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 0], [0, 0]]);

        editor.setText("foo");

        expect(stops.rootFrame.children.length).toBe(2);
        expect(stops.rootFrame.children[0].children.length).toBe(1);
        expect(stops.rootFrame.children[0].instance.getRange()).toEqual([[0, 0], [0, 3]]);
        expect(stops.rootFrame.children[0].children[0].instance.getRange()).toEqual([[0, 0], [0, 3]]);
        expect(stops.rootFrame.children[1].instance.getRange()).toEqual([[0, 3], [0, 3]]);
      });
    });
  });
});
