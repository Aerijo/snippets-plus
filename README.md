[![Build Status](https://travis-ci.com/Aerijo/snippets-plus.svg?branch=master)](https://travis-ci.com/Aerijo/snippets-plus)

# Snippets-plus

This is a reimagining of the original `snippets` package. It introduces new features such as variables and advanced formatting.

## Features

Snippets as in the `snippets` package, plus:

- Status bar indicator for when in snippets mode
- Command to leave snippets mode
- Variables and named transformations
- Conditional transformation replacements
- Map snippets to keyboard shortcuts
- Altered `$0` (end tab stop) semantics

See [the wiki](https://github.com/Aerijo/snippets-plus/wiki) for more in depth information.

## Snippets

### Syntax

Check [the wiki page](https://github.com/Aerijo/snippets-plus/wiki/Syntax) for snippet syntax.

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

- The `name` is a unique identifier for the snippet.
- The `prefix` is a string that must be directly behind the cursor for this snippet to be expanded. It must be a single line, and no longer than 50 characters.
- The body is what the snippet expands into, parsed as per the above _Syntax_ section.

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

This package also provides a new snippet attribute `key`, which lets you associate a snippet with a keybinding. Doing this effectively skips using the prefix. Use `prefix: null` to prevent the snippet from having a prefix.

The key binding uses the same scope as the snippet to determine when it can be triggered, so you can have multiple snippets on the same key and the most specific match will be expanded.

<!-- TODO: Add support for a "session" level snippet, which is defined in a prompt and (optionally?) destroyed when the editor is closed -->

### Using

To expand a snippet, type it's prefix and run the `Snippets: Expand` command. This command is assigned the shortcut <kbd>tab</kbd> by default.

The selection of snippet to expand is follows:

- Get set of snippets that can be expanded based on the cursor scope
- Snippets with more specific selectors override ones that have the same prefix and are more general
- User snippets override package snippets, and community package snippets override core package snippets
- The snippet with the longest prefix that is completely matched by the text behind the cursor wins.

So if we had candidate prefixes `log` and `conlog`, then for the following text before the cursor:

- `conlogq`: no snippet matches
- `conlog`: picks the `conlog` snippet
- `onlog`: picks the `log` snippet
- `og`: no snippet matches

To goto the next tab stop, run `Snippets: Next Tab Stop` (again, <kbd>tab</kbd> by default) and to goto the previous run `Snippets: Previous Tab Stop` (<kbd>shift-tab</kbd> by default). The keybindings can be disabled and replaced with your own.

Technical details on how expanded snippets behave can be found on [the wiki](https://github.com/Aerijo/snippets-plus/wiki/Syntax).

### Legacy parsing mode

I found I have many snippets that are defined like as follows

```
\\\\textbf{$1}$2
```

Under the `snippets` package I never noticed a problem, but with this one you see it is still in snippets mode when you reach the `$2` stop. This can cause unexpected behaviour when you next press <kbd>tab</kbd>, and if you have the tab stops markers visible it will look weird too.

By default, this package will try to correct snippets like these. If this option is enabled, then if

- the last part of the snippet (by location) is a simple tab stop,
- the tab stop is the only one of its index, and
- it is also the last (by index),

then it will be converted to a `$0` stop. So the above becomes

```
\\\\textbf{$1}$0
```

Which behaves much better. Disable this mode if you want full control over your snippets.

## Developing

### Testing

Easiest is to open the project in Atom and run `Window: Run Package Specs`.

Alteratively run `atom test .` in the command line to run the test suite. Replace `atom` with `atom-beta` and `atom-nightly` as appropriate.
