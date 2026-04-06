# Fast Language

`fast` is a programming language project built for studying lexers, parsers, interpreters, and later a migration to C.

Right now the project is implemented in TypeScript and already supports:

- variable declarations with `var`
- constant declarations with `val`
- reassignment for `var`
- number literals
- string literals with `"`
- multiline strings with `` ` ``
- generic function-call parsing like `print(a);`
- a builtin `print(...)` in the interpreter

## Example

`main.fast`

```fast
var a = 30;
val b = "Test";

print(a);
print(b);
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

## Scripts

```bash
yarn dev
yarn build
yarn start
yarn lint
yarn format
```

## Current Language Rules

- `var` creates mutable bindings
- `val` creates immutable bindings
- only `var` can be reassigned
- normal strings must use `"`
- multiline strings must use `` ` ``
- `print` is treated as an identifier in the lexer and as a builtin at runtime
- symbol existence, callability, and `val` reassignment are checked semantically before execution

## Next Steps

Possible next milestones:

- arithmetic expressions
- multiple function arguments
- nested scopes
- user-defined functions
- migration from TypeScript interpreter to C implementation
