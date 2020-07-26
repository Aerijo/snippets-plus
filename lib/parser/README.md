Atom doesn't have a package system (it just copies the repo state), and I don't want to generate parsers on the fly or have a user PEG.js dependency, so we just include the generated parser.

The grammar is meant to match the following (based on VS Code and LSP snippet grammars):

```
any ::= (text | tabstop | choice | variable)*

text ::= anything that's not something else

tabstop ::= '$' int | '${' int '}' | '${' int transform '}' | '${' int ':' any '}'

choice ::= '${' int '|' text (',' text)* '|}'

variable ::= '$' var | '${' var '}' | '${' var ':' any '}' | '${' var transform '}'

transform ::= '/' regex '/' replace '/' options

replace ::= (format | text)*

format ::= '$' int | '${' int '}' | '${' int ':' modifier '}' | '${' int ':+' if:replace '}' | '${' int ':?' if:replace ':' else:replace '}' | '${' int ':-' else:replace '}' | '${' int ':' else:replace '}'

regex ::= JS regex value

options ::= JS regex options

modifier = '/' var

var ::= [a-zA-Z_][a-zA-Z_0-9]*

int ::= [0-9]+
```

I also intend to support different "dialects"; future additions include the original `snippets` grammar (for backwards compatbility) and a stricter variant that errors if it looks like a special node is being created but ultimately fails (e.g., `${1:no end brace`).

Strict mode also opens possibilities for backwards compatible extensions; e.g., it would currently disallow `${foo@bar}` because the `$` is unescaped and the `@` doesn't match an existing contruct like `${foo:bar}` (`foo` variable with placeholder `bar`). So `@` could be introduced in future to mean "with arguments" to the variable or something (e.g., for formatting dates).

### TODO

- Allow variables inside of transformation replacers. This is safe, as variables are resolved on expansion, so will appear as plain text for tab stop transforms.
- Implement strict parser.
  - How to handle errors?
