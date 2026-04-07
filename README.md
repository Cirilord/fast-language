# Fast Language

`fast` is a programming language project built for studying lexers, parsers, interpreters, and later a migration to C.

Right now the project is implemented in TypeScript and already supports:

- variable declarations with `var`
- constant declarations with `val`
- reassignment for `var`
- arithmetic expressions with `+`, `-`, `*`, `/`, unary `-`, and grouped expressions with `(...)`
- typed number literals with required suffixes: `10i`, `20.0f`, `30.0d`
- string literals with `"`
- multiline strings with `` ` ``
- line comments with `//`
- array literals with `[value, value]`
- `for ... of` loops with optional index binding
- generic function-call parsing like `print(a);`
- a builtin `print(...)` in the interpreter
- local VS Code syntax highlighting support in `vscode-extension`

## Example

`main.fast`

```fast
// Number literals must include a type suffix.
val items = ["first", "second", "third"];
val result = (10i + 5i) * 2i;
val directNegative = -10i;
val negative = -(5i + 2i);

for (var item, index of items) {
  print(index);
  print(item);
}

print(result);
print(directNegative);
print(negative);
```

## Project Flow

The execution pipeline is:

1. lexer
2. parser
3. semantic analyzer
4. interpreter

Current file responsibilities:

- `src/lexer.ts`: tokenizes the source code
- `src/token.ts`: token definitions
- `src/parser.ts`: builds the AST
- `src/ast.ts`: AST node types
- `src/semantic.ts`: semantic analysis before execution
- `src/runtime.ts`: runtime values, `Scope`, and interpreter
- `src/utils/char.ts`: reusable character helpers
- `src/index.ts`: entrypoint that reads `main.fast`
- `tsconfig.json`: project TypeScript config extending `@tsconfig/strictest`
- `vscode-extension`: local VS Code extension for `.fast` syntax highlighting

## Scripts

```bash
yarn dev
yarn build
yarn start
yarn lint
yarn format
```

## VS Code Syntax Highlighting

This repo includes a local VS Code extension in `vscode-extension`.

To test it locally:

```bash
code --extensionDevelopmentPath=./vscode-extension
```

Then open a `.fast` file in the extension development window.

## Current Language Rules

- `var` creates mutable bindings
- `val` creates immutable bindings
- only `var` can be reassigned
- arithmetic operators currently expect number operands
- unary `-` can be used with numbers, including grouped expressions like `-(5i + 2i)`
- parentheses can be used to group arithmetic expressions
- number literals must include a type suffix: `i` for integer, `f` for float, or `d` for double
- integer literals cannot include a decimal point; use `20.0f` or `20.0d` for decimal values
- arithmetic promotes mixed numeric types, and division between integers produces a `double`
- normal strings must use `"`
- multiline strings must use `` ` ``
- line comments start with `//` and run until the end of the line
- arrays use `[value, value]`
- `for` loops use `for (var element of array) { ... }`
- `for` loops can access index with `for (var element, index of array) { ... }`
- `print` is treated as an identifier in the lexer and as a builtin at runtime
- symbol existence, callability, and `val` reassignment are checked semantically before execution

## Next Steps

Possible next milestones:

- multiple function arguments
- nested scopes
- user-defined functions
- migration from TypeScript interpreter to C implementation
