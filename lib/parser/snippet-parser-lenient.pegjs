/*

This is the lenient parser because parse issues (such as unclosed tab stops or
invalid regexes) are simply treated as plain text. The strict variation will
simply error when this happens, which is less user friendly but helps write
snippets that are efficient to parse.

*/

{
  // Joins all consecutive strings in a collection without clobbering any
  // non-string members.
  function coalesce (parts) {
    const result = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ri = result.length - 1;
      if (typeof part === 'string' && typeof result[ri] === 'string') {
        result[ri] = result[ri] + part;
      } else {
        result.push(part);
      }
    }
    return result;
  }
}

// Grab anything that isn't \ or $, then try to build a special node out of it, and (at the top level) if that fails then just accept the first character as text and continue
topLevelContent = c:(text / escapedTopLevel / tabStop / choice / variable / .)* { return coalesce(c); }

// Placeholder content. The same as top level, except we need to fail on '}' so that it can end the tab stop (the any matcher would eat it if we used it here)
tabStopContent = c:(tabStopText / escapedTabStop / tabStop / choice / variable / [^}])* { return coalesce(c); }

// The forms of a tab stop. They all start with '$', so we pull that out here.
tabStop = '$' t:(tabStopSimple / tabStopWithoutPlaceholder / tabStopWithPlaceholder / tabStopWithTransform) { return t; }

// The simplest form is just $n for some integer `n`
tabStopSimple = n:integer { return { index: n }; }

// The next simplest form is equivalent to the above, but wrapped in `{}`
tabStopWithoutPlaceholder = '{' n:integer '}' { return { index: n }; }

// When a ':' follows `n`, the content after the ':' is the placeholder and it can be anything
tabStopWithPlaceholder = '{' n:integer ':' content:tabStopContent '}' { return { index: n, content }; }

// When a transform follows `n` (indicated by '${n/...')
tabStopWithTransform = '{' n:integer t:transformation '}' { return { index: n, transformation: t }; }

// Builds a capture regex and substitution tree. If the capture is not a valid regex, then the match fails
transformation = '/' find:regexString '/' replace:replace '/' flags:flags & {
  // Predicate: only succeed if the `find` + `flags` values make a valid regex
  // TODO: find a way to not build the same RegExp twice. May need to wait until
  //       hand written parser.
  try {
    find = new RegExp(find, flags);
    return true;
  } catch(e) {
    return false;
  }
} {
  return { find: new RegExp(find, flags), replace };
}

// Pulls out the portion that would be for the find regex. Validation is done
// higher up, where we also have access to the flags.
regexString = r:([^/\\] / '\\' c:. { return '\\' + c } )* { return r.join(""); }

// The form of a substitution for a transformation. It is a mix of plain text + modifiers + backreferences to the find capture groups
// It cannot access tab stop values.
replace = r:(replaceText / format / replaceModifier / escapedReplace / [^/])* { return coalesce(r); }

// Same as replace, but we disallow plain '}' instead of plain '/' because we are inside a format (ended by '}')
// NOTE: Diallowing escape of '/' is consistent with VS Code. The general rule is "if it's not got a special meaning, it can't be escaped"
// Inside a format there is no special meaning to '/', so we can't escape it.
formatReplace = r:(replaceText / format / replaceModifier / escapedFormatReplace / [^}])* { return coalesce(r); }

// Another special case; the if half of an if-else format is terminated by ':'
ifElseReplace = r:(replaceText / format / replaceModifier / escapedIfElseReplace / [^:])* { return coalesce(r); }


// A reference to a capture group of the find regex of a transformation. Can conditionally
// resolve based on if the match occurred, and have arbitrary modifiers applied to it.
// The common '$' prefix has been pulled out.
format = '$' f:(formatSimple / formatPlain / formatWithModifier / formatWithIf / formatWithIfElse / formatWithElse) { return f; }

// The simplest format form, resembles a simpel tab stop except `n` refers to the capture group index, not a tab stop
formatSimple = n:integer { return { backreference: n }; }

// The same as the simple variant, but `n` is enclosed in {}
formatPlain = '{' n:integer '}' { return { backreference: n }; }

// A modifier is something like "/upcase", "/pascalcase". If recognised, it resolves to the
// application of a JS function to the `n`th captured group.
formatWithModifier = '{' n:integer ':' m:(modifier+) '}' { return { backreference: n, modifier: m }; }

// If the `n`th capture group is non-empty, then resolve to the `ifContent` value, else an empty string
// Note that ifContent is a replace itself; it's formats still refer to the original transformation find though,
// as transformations cannot be nested.
formatWithIf = '{' n:integer ':+' ifContent:formatReplace '}' { return { backreference: n, ifContent }; }

// Same as the if case, but resolve to `elseContent` if empty instead of the empty string
formatWithIfElse = '{' n:integer ':?' ifContent:ifElseReplace ':' elseContent:formatReplace '}' { return { backreference: n, ifContent, elseContent }; }

// Same as the if case, but reversed behaviour with empty vs non-empty `n`th match
// NOTE: The ':' form can cause ambiguities when the contents starts with '/', '+', etc.
//       However, instead of allowing them to be escaped, just tell issue raisers to use the
//       less ambiguous ':-' form (which also has nice symmetry with the ':+' form).
formatWithElse = '{' n:integer ':' '-'? elseContent:formatReplace '}' { return { backreference: n, elseContent }; }

// Used in `format`s to transform a string using a JS function
modifier = '/' modifier:name { return modifier; }

// Regex flags. Validation is performed when the regex itself is also known.
flags = f:[a-z]* { return f.join(""); }

// A tab stop that offers a choice between several fixed values. These values are plain text only.
// This feature is not implemented, but the syntax is parsed to reserve it for future use.
// It will currently just default to a regular tab stop with the first value as it's placeholder.
// Empty choices are still parsed, as we may wish to assign meaning to it in future.
choice = '${' n:integer '|' c:(a:choiceText b:(',' c:choiceText { return c; } )* { return [a, ...b] })? '|}' { return { index: n, choices: c || [] }; }

// Syntactically looks like a named tab stop. Variables are resolved in JS and may be
// further processed with a transformation. Unrecognised variables are transformed into
// tab stops with the variable name as a placeholder.
variable = '$' v:(variableSimple / variablePlain / variableWithPlaceholder / variableWithTransform) { return v; }

variableSimple = v:name { return { variable: v }; }

variablePlain = '{' v:name '}' { return { variable: v }; }

variableWithPlaceholder = '{' v:name ':' content:tabStopContent '}' { return { variable: v, content }; }

variableWithTransform = '{' v:name t:transformation '}' { return { variable: v, transformation: t }; }

// Top level text. Anything that cannot be the start of something special. False negatives are handled later by the `any` rule
text = t:([^$\\}])+ { return t.join("") }

// Non-special text inside a tab stop placeholder. Should be no different to regular top level text.
tabStopText = text

// Non-special text inside a choice. $, {, }, etc. are all regular text in this context.
choiceText = b:(t:[^,|\\]+ { return t.join(""); } / '\\' c:[,|\\] { return c; } / '\\' c:. { return '\\' + c; } )+ { return b.join(""); }

// Non-special text inside a replace (substitution part of transformation). Same as normal text, but `/` and ':' is special (the end of the regex-like pattern and if half terminator for if-else format)
replaceText = t:[^$\\}/:]+ { return t.join(""); }

// Match an escaped character. The set of characters that can be escaped is based on context, generally restricted to the minimum set that enables expressing any text content
escapedTopLevel = '\\' c:[$\\}] { return c; }

// Characters that can be escaped in a tab stop placeholder are the same as top level
escapedTabStop = escapedTopLevel

// Only `,` and `|` can be escaped in a choice, as everything else is plain text
escapedChoice = '\\' c:[$\\,|] { return c; }

// Same as top level, but `/` can also be escaped
escapedReplace = '\\' c:[$\\/] { return c; }

// Format terminated by '}' instead of '/'
escapedFormatReplace = '\\' c:[$\\}] { return c; }

// If half of if-else format terminated by ':' instead of '}'
escapedIfElseReplace = '\\' c:[$\\:] { return c; }

// We handle 'modifiers' separately to escapes. These indicate a change in state when building the replacement (e.g., capitalisation)
replaceModifier = '\\' m:[ElLuU] { return { inlineModifier: m }; }

// Match nonnegative integers like those used for tab stop ordering
integer = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

// Match variable names like TM_SELECTED_TEXT
name = a:[a-zA-Z_] b:[a-zA-Z_0-9]* { return a + b.join(""); }
