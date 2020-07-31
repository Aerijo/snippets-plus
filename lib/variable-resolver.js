const path = require("path");
const ScopedPropertyStore = require("scoped-property-store");

const { GenericResolverManager, getScopeChain } = require("./util");

class DefaultVariableResolver {
  static scopeToCommentsMap = new ScopedPropertyStore();

  constructor() {
    this.variables = new Map([
      ["TM_CURRENT_LINE", this.currentLine],
      ["TM_CURRENT_WORD", this.currentWord],
      ["TM_DIRECTORY", this.directory],
      ["TM_FILENAME", this.filename],
      ["TM_FILENAME_BASE", this.filenameBase],
      ["TM_FILEPATH", this.filepath],
      ["TM_LINE_INDEX", this.lineIndex],
      ["TM_LINE_NUMBER", this.lineNumber],
      ["TM_SELECTED_TEXT", this.selected],

      ["CLIPBOARD", this.clipboard],
      ["CURRENT_YEAR", this.currentYear],
      ["CURRENT_YEAR_SHORT", this.currentYearShort],
      ["CURRENT_MONTH", this.currentMonth],
      ["CURRENT_MONTH_NAME", this.currentMonthName],
      ["CURRENT_MONTH_NAME_SHORT", this.currentMonthNameShort],
      ["CURRENT_DATE", this.currentDate],
      ["CURRENT_DAY_NAME", this.currentDayName],
      ["CURRENT_DAY_NAME_SHORT", this.currentDayNameShort],
      ["CURRENT_HOUR", this.currentHour],
      ["CURRENT_MINUTE", this.currentMinute],
      ["CURRENT_SECOND", this.currentSecond],
      ["CURRENT_SECONDS_UNIX", this.currentSecondsUnix],
      ["BLOCK_COMMENT_START", this.blockCommentStart],
      ["BLOCK_COMMENT_END", this.blockCommentEnd],
      ["LINE_COMMENT", this.lineComment],
    ]);
  }

  resolve(name, context) {
    const resolver = this.variables.get(name);
    if (typeof resolver === "function") {
      return resolver(context, name);
    }
    return undefined;
  }

  currentLine({ editor, prefix, insertionPoint }) {
    const lineText = editor.lineTextForBufferRow(insertionPoint.row);
    return (
      lineText.slice(0, insertionPoint.column - prefix.length) +
      lineText.slice(insertionPoint.column)
    );
  }

  currentWord({ editor, cursor }) {
    return editor.getTextInBufferRange(cursor.getCurrentWordBufferRange());
  }

  directory({ editor }) {
    const filePath = editor.getPath();
    if (typeof filePath !== "string") {
      return undefined;
    }
    return path.dirname(filePath);
  }

  filename({ editor }) {
    return editor.getTitle();
  }

  filenameBase({ editor }) {
    const name = editor.getTitle();
    if (typeof name !== "string") {
      return undefined;
    }
    const ext = path.extname(name);
    return name.slice(0, -ext.length);
  }

  filepath({ editor }) {
    return editor.getPath();
  }

  lineIndex({ insertionPoint }) {
    return `${insertionPoint.row}`;
  }

  lineNumber({ insertionPoint }) {
    return `${insertionPoint.row + 1}`;
  }

  selected({ editor, selectionRange }) {
    return editor.getTextInBufferRange(selectionRange);
  }

  clipboard() {
    return atom.clipboard.read();
  }

  currentYear({ time }) {
    return time.toLocaleString("en-us", { year: "numeric" });
  }

  currentYearShort({ time }) {
    return time.toLocaleString("en-us", { year: "2-digit" });
  }

  currentMonth({ time }) {
    return time.toLocaleString("en-us", { month: "2-digit" });
  }

  currentMonthName({ time }) {
    return time.toLocaleString("en-us", { month: "long" });
  }

  currentMonthNameShort({ time }) {
    return time.toLocaleString("en-us", { month: "short" });
  }

  currentDate({ time }) {
    return time.toLocaleString("en-us", { day: "2-digit" });
  }

  currentDayName({ time }) {
    return time.toLocaleString("en-us", { weekday: "long" });
  }

  currentDayNameShort({ time }) {
    return time.toLocaleString("en-us", { weekday: "short" });
  }

  currentHour({ time }) {
    return time.toLocaleString("en-us", { hour12: false, hour: "2-digit" });
  }

  currentMinute({ time }) {
    return time.toLocaleString("en-us", { minute: "2-digit" });
  }

  currentSecond({ time }) {
    return time.toLocaleString("en-us", { second: "2-digit" });
  }

  currentSecondsUnix({ time }) {
    return `${Math.floor(time.getTime() / 1000)}`;
  }

  blockCommentStart({ editor, insertionPoint }) {
    const scopes = getScopeChain(
      editor.scopeDescriptorForBufferPosition(insertionPoint)
    );
    const comments = DefaultVariableResolver.scopeToCommentsMap.getPropertyValue(
      scopes
    );
    return comments && comments.start;
  }

  blockCommentEnd({ editor, insertionPoint }) {
    const scopes = getScopeChain(
      editor.scopeDescriptorForBufferPosition(insertionPoint)
    );
    const comments = DefaultVariableResolver.scopeToCommentsMap.getPropertyValue(
      scopes
    );
    return comments && comments.end;
  }

  lineComment({ editor, insertionPoint }) {
    const scopes = getScopeChain(
      editor.scopeDescriptorForBufferPosition(insertionPoint)
    );
    const comments = DefaultVariableResolver.scopeToCommentsMap.getPropertyValue(
      scopes
    );
    return comments && comments.line;
  }
}

DefaultVariableResolver.scopeToCommentsMap.addProperties("default comments", {
  ".text.html,.source.html": {
    start: "<!--",
    end: "-->",
  },
  ".source.js,.source.ts,.source.java,.source.c,.source.cpp": {
    start: "/*",
    end: "*/",
    line: "//",
  },
  ".source.ruby": {
    start: "=begin",
    end: "=end",
    line: "#",
  },
  ".source.python": {
    line: "#",
  },
  ".source.coffee": {
    start: "###",
    end: "###",
    line: "#",
  },
  ".text.tex": {
    line: "%",
  },
});

class VariableResolverManager extends GenericResolverManager {
  constructor() {
    super();
    this.addResolver(new DefaultVariableResolver(), -1);
  }
}

module.exports = {
  VariableResolverManager,
};
