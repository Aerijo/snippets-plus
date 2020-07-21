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