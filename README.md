[![Build Status](https://travis-ci.com/Aerijo/snippets-plus.svg?token=PvseBojepBevztdKaS9H&branch=master)](https://travis-ci.com/Aerijo/snippets-plus)

# Snippets-plus

This is a reimagining of the original `snippets` package. It introduces new features such as variables and advanced formatting.

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
E.g.,

- `$1$2$3`: typing `foo` in `$2` makes `$1${2:foo}$3`
- `${1:$2}`: typing `foo` in `$1` makes `${1:foo$2}`
- `${1:$2a$3b$4}`: typing `foo` in `$1` makes `${1:$2foo$3$4}` (a and b deleted, tab stops before text pushed left, tab stops after text or if no text pushed right).

- Text change handling is mostly independent of cursors
  - Removing cursors may end snippets mode, but the location algorithms should work based on raw buffer changes, without needing to link them to cursors

### TODO
- Need a way to detect if undo / redo includes a snippet expansion and which one(s)
  - Mark a checkpoint somehow?
  - Already can detect when undo / redo occurs
- Allow snippets to contain other snippets directly, such that they resolve as if the snippet body was inserted in place
- Handle cursor coalescing when multiple instances are on the same point (e.g., `$1$1`, `$1$2$1`)

### Testing

Run `npm test` to run the test suite.
