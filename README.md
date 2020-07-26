[![Build Status](https://travis-ci.com/Aerijo/snippets-plus.svg?token=PvseBojepBevztdKaS9H&branch=master)](https://travis-ci.com/Aerijo/snippets-plus)

# Snippets-plus

This is a reimagining of the original `snippets` package. It introduces new features such as variables and advanced formatting.

## Features
Snippets as in the `snippets` package, plus:
- Status bar indicator for when in snippets mode
- Command to leave snippets mode
- Variables and named transformations
- Conditional transformation replacements

## Snippets

### Syntax

Snippet syntax starts off simple. Anything except `$` and `\` are plain text and will be inserted directly. The cursor will automatically be placed at the end of the inserted text.

  - NOTE: If you want to use `$` or `\` literally, a good rule of thumb is to escape them as `\$` and `\\`. This will prevent future syntax extensions from breaking your snippets. When you write a snippet in a `.cson` or `.json` file, you will need to write `\` as `\\`, so to get a literal `$` you would end up writing `\\$`. <!-- TODO: Add strict mode, and note it is enforced in strict mode -->

Next comes tab stops. These mark positions to place the cursor, and can be cycled through back and forth on command. The simple way to do these is `$n`, where `n` is some non-negative integer value. E.g.,
```
\\begin{$1}$2
  $0
\\end{$1}
```
will insert the text (without the `$n` values), and place the cursor where the `$1` tab stops are (it will add as many cursors as needed). You can then start typing, and what you type will be written in both the `begin` and `end` sections. When you goto the next tab stop (shortcut is <kbd>tab</kbd> by default) it will destroy those cursors and add one where the `$2` stop is. If you goto the previous tab stop (shortcut is <kbd>shift-tab</kbd> by default) it will destroy the cursor on `$2` and add back the cursors on `$1`, with them selecting any text you wrote there previously. Once you move past the highest tab stop number, it will end the snippet mode. By default it places a cursor after the snippet text, but you can control where the cursor ends up using the special `$0` tab stop. These work like regular tab stops, except once you reach them you cannot go back to older tab stops because the snippet has ended.

### Defining snippets

Snippets can be provided by packages. Any `.cson` or `.json` file in a top level `snippets` directory will be searched. Users can also provide snippets directly through the `~/.atom/snippets.cson` file.

The structure is as follows:
```coffee
source1:
  name1:
    prefix: "foo"
    body: "Hello world"
  name2:
    prefix: "bar"
    body: "second snippet"

source2:
  name1:
    prefix: "foo"
    body: "a snippet for a different scope"
```
The top level keys are _scope selectors_. These control what parts of a file the snippet can be expanded in. For example,
  - `.source.js` allows the snippet to be expanded in all JavaScript files
  - `.source.js,.source.ts` allows the snippet to be used in JS and TS files
  - `.source.js .string` only allows the snippet to expand in JS strings
  - `.string` allows the snippet in any string of any language

Your file may have any number of these selectors. Note that because of how CSON and JSON work, all sibling keys must be unique. If you want to add multiple snippets to the same scope, make sure to do it under the same key. E.g.,
```coffee
# No good, two keys on the same object have the same value
".source.js":
  name1:
    prefix: 'snippet1'
    body: 'my first snippet'

".source.js":
  name2:
    prefix: 'snippet2'
    body: 'my next snippet'

###############
# Fixed
".source.js":
  name1:
    prefix: 'snippet1'
    body: 'my first snippet'

  name2:
    prefix: 'snippet2'
    body: 'my next snippet'
```
You can also add `autocomplete-plus` attributes like `description` and `rightLabel`. They are not used by this package, but can make the autocomplete popup more descriptive.

Until now this is all the same as for the original snippets package. But this package supports a shorthand structure for when you don't care about naming snippets. If you don't declare a `prefix` key, then the snippet name will be used instead. And if the snippet declaration is a string, then it will be used as the body. So the following are all equivalent
```coffee
".source.js":
  log:
    prefix: "log",
    body: "console.log($1)$0"

################

".source.js":
  log:
    body: "console.log($1)$0"

################

".source.js":
  log: "console.log($1)$0"
```

As with the original package, user snippets are watched and automatically updated when the file changes.

<!-- TODO: Add support for a "session" level snippet, which is defined in a prompt and (optionally?) destroyed when the editor is closed -->

## Notes:

### Design

- Main package:
  - Tracks available snippets
- Per editor:
  - Picks and tracks active snippets
  - Tracks undo / redo when

### General

- Snippet expansions in different editors are independent

### Tab stop semantics:

- `$0` means the snippet is finished, so triggers destruction of the expansion instance and cannot goto previous anymore
- It is valid to have multiple tab stops with no (apparently) meaningful difference, like `$1$2$3`. This is easier to support, and allows independent transformations of the different stops.
- For a similar reason, ending the body with `$n` will still have `$0` auto inserted.
- If `$0` is not present, it is auto inserted at the end.
- For nested tab stops, the child is active until it is destroyed. The parent then checks the cursor position(s), and if it is not in the active tab stop, it is destroyed too. It is up to the active rule set to decide if some cursors moving out of place are cause for total destruction.
- Alteratively, child snippets are just inserted into the current snippet (adjusting tab stops appropriately).
  - How is `$0` tab stop adjusted? Is it a target, or removed?
    - Only really makes sense to convert it treat it as a regular tab stop in a child snippet
- Choices are a suggestion (for the autocomplete popup), there is no lock on what can be inserted.
  - When resolving multiple tab stops for an index, choices are unioned and appear on the 'primary' cursor (though autocomplete would need to handle this).
  - As they are just suggestions, it still works when mixing with plain stops.
- Q: How to handle typing in outer tab stops with inner tab stops? Are they just removed? What if an inner has the same index as the outer?
  - VS Code: Push overriden tab stops to the right, except any leading tab stops (to the left). But it also reorders them, so seems like an oversight.
- Q: Is it possible for a feedback loop to cause text to keep being added with doubled tab stops (`$1$1` doubles any input, but grows apart so should not have infinite feedback if another person also has a similar snippet).
  E.g.,

- `$1$2$3`: typing `foo` in `$2` makes `$1${2:foo}$3`
- `${1:$2}`: typing `foo` in `$1` makes `${1:foo$2}`
- `${1:$2a$3b$4}`: typing `foo` in `$1` makes `${1:$2foo$3$4}` (a and b deleted, tab stops before text pushed left, tab stops after text or if no text pushed right).

- Text change handling is mostly independent of cursors

  - Removing cursors may end snippets mode, but the location algorithms should work based on raw buffer changes, without needing to link them to cursors

- Q: Should left-of-placeholder be a property of tab stop instances, to enforce they always be on the left of added content (for empty tab stops). How does this work with non-empty left placholders? Typing to the left of non-empty is well defined (push it right), but if you empty it then it suddenly gets pushed left?

### TODO

- Need a way to detect if undo / redo includes a snippet expansion and which one(s)
  - Mark a checkpoint somehow?
  - Already can detect when undo / redo occurs
- Allow snippets to contain other snippets directly, such that they resolve as if the snippet body was inserted in place
- Handle cursor coalescing when multiple instances are on the same point (e.g., `$1$1`, `$1$2$1`)

### Testing

Run `npm test` to run the test suite.
