const { SnippetParser } = require("../lib/snippet-parser");

describe("Lenient snippet parsing", () => {
  function expectMatch(bodyText, parseTree) {
    expect(new SnippetParser().parse(bodyText)).toEqual(parseTree);
  }

  it("parses simple tab stops", () => {
    expectMatch("foo $1 bar", [
      "foo ",
      {index: 1},
      " bar",
    ]);
  });
});
