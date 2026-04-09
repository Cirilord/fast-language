# AGENTS

## Purpose

This file tracks working conventions for the `fast` language project so future changes stay consistent.

## Project State

- The project is currently a TypeScript implementation of the `fast` language.
- The language already has a lexer, parser, semantic analyzer, and interpreter.
- Local VS Code syntax highlighting lives in `vscode-extension`.
- Runtime name resolution is currently handled through `Scope` in `src/runtime.ts`.
- Module loading is centralized in `src/module.ts`.
- The active sample program lives in `main.fast`.

## Language Conventions

- `var` is mutable.
- `val` is immutable.
- only `var` can be reassigned.
- Arithmetic operators currently expect number operands, including `%` for modulo.
- `+` also supports string concatenation when at least one operand is a string.
- Comparison operators `>`, `>=`, `<`, `<=`, `==`, and `!=` return booleans.
- Logical operators `&&` and `||` expect boolean operands and short-circuit.
- Nullish coalescing `??` returns the right value only when the left value is `null`.
- Ternary expressions use `condition ? value : value`, require a boolean condition, and require compatible branch types.
- Compound assignment operators `+=`, `-=`, `*=`, `/=`, and `%=` also expect number operands.
- Logical assignment operators `&&=` and `||=` expect boolean operands.
- Nullish assignment `??=` assigns only when the current value is `null`.
- Parentheses can group arithmetic expressions.
- Unary `-` can be used with numbers and grouped numeric expressions, and unary `!` can be used with boolean expressions.
- Number literals no longer use suffixes; numeric variable types are `int`, `float`, and `double`.
- Integer literals do not use decimal points, like `10`; decimal literals use decimal points, like `20.0`.
- Variable declarations can include a type annotation, like `var name: string = "Fast";`.
- Variable declarations can infer type from non-null initializers, like `var name = "Fast";`.
- Accepted variable types include `boolean`, `double`, `float`, `int`, `string`, declared class names, typed arrays like `string[]`, and tuple types like `(string,int)`.
- `null` declarations require an explicit declared type, like `var name: string = null;`.
- `print` is not a lexer keyword; it is tokenized as `IDENTIFIER`.
- Normal strings use `"`.
- Multiline strings use `` ` ``.
- Line comments start with `//` and run until the end of the line.
- Arrays use `[value, value]`, and array types use `T[]`, like `string[]`.
- Array index access uses `array[index]`, and the index must be an `int`.
- Tuple types use `(T1, T2, ...)`, and tuple literals use `(value1, value2, ...)`.
- `for` loops use `for (var element of array) { ... }`.
- `for` loops can access index with `for (var element, index of array) { ... }`.
- `if` statements use `if (condition) { ... }`, `else if (condition) { ... }`, and `else { ... }`, and each condition must be boolean.
- `switch` statements use `switch (value) { case value { ... } default { ... } }`, compare runtime equality for strings, numbers, booleans, `null`, and tuples, and require blocks for every clause.
- `fallthrough;` is explicit inside `switch`, only valid as the final top-level statement of a `case`, and cannot be nested inside `if`, loops, or `try`.
- `break` and `continue` are only valid inside `for`, `while`, and `do while`.
- `while` loops use `while (condition) { ... }`, and the condition must be boolean.
- `do while` loops use `do { ... } while (condition);`, and the condition must be boolean.
- Functions use `function name(parameter: type): type { return value; }`.
- Parameters can use default values, like `label: string = "status"`.
- Rest parameters use typed arrays and come last, like `...items: string[]`.
- Functions and class methods support overloads through repeated signatures without bodies followed by one implementation body.
- Overload implementations must come after their signatures, keep the same parameter count, and use `unknown` for any parameter position whose type varies across signatures.
- `unknown` is reserved for overload implementations and is rejected in normal bindings, properties, return types, and regular parameters.
- Overload groups currently do not support default parameters or rest parameters.
- Functions and classes can declare generics with defaults, like `<T, K = string>`.
- Function return values must match the declared return type.
- Functions that do not return a value use `void`, like `function name(): void { ... }`.
- Named functions expose implicit `name` and `toString()`, like `logGenericText.name` and `logGenericText.toString()`.
- Builtin runtime inspection helpers are `typeOf(value)`, `isType(value, "string")`, and `isInstance(value, ClassName)`.
- `typeOf` returns runtime categories like `string`, `int`, `function`, `class`, `object`, `array`, and `tuple`.
- `isType` compares the runtime category returned by `typeOf`, and `isInstance` checks class membership through inheritance.
- `if` branches narrow identifier types when the condition uses `isType(value, "...")` or `isInstance(value, ClassName)`.
- Narrowing also propagates through `&&`, and `||` preserves only guards shared by both sides, including nested conditions under `!`.
- Narrowing also propagates through `&&`, and `||` preserves only guards shared by both sides.
- `throw value;` requires a value whose class extends `Error`.
- `try { ... } except(error: ErrorType) { ... } finally { ... }` is supported.
- `try` requires at least one `except`, `finally` is optional, duplicate `except` types are rejected, and broader earlier `except` clauses make narrower later ones unreachable.
- Classes use `class Name { ... }`.
- Generic classes use `class Name<T, K = string> { ... }`.
- Every class has an implicit static `name: string`, accessible like `BaseName.name` or `this.constructor.name`.
- Every class has an implicit `toString(): string`; instances can override it, and `print(instance)` uses it automatically.
- Abstract virtual contracts use `abstract virtual class Name { ... }`.
- Classes can extend one base class with `extends` and implement abstract virtual contracts with `implements`.
- Class members must include an explicit access modifier: `public`, `protected`, or `private`.
- `public`, `protected`, and `private` are checked semantically on member access and constructor calls.
- Class properties require `var` or `val` to define mutability, like `public var name: string = "Fast";`.
- `static` comes after the access modifier and before `var`/`val`, like `public static val label: string = "User";`.
- Constructors use `public constructor(parameter: type = value) { ... }`.
- Methods require return annotations and can accept parameters, like `public name(prefix: string): string { ... }`.
- Abstract virtual class methods use signatures without bodies, like `public print(): void;`.
- Implemented contract methods use `override`, like `public override print(): void { ... }`.
- Overrides of inherited methods must use `override` and match the inherited signature.
- Concrete classes must implement inherited virtual methods.
- Subclass constructors must start with `super()` when extending a base class.
- Objects are created with `new Name()` and members are accessed with `.`.
- `this` is available in constructors and methods, and `super()`/`super.method()` are available in subclasses.
- Builtin error classes include `Error`, `TypeError`, and `ReferenceError`.
- Named imports use `import { name } from "./file";` and resolve local `.fast` files.
- Named exports can be inline, like `export var name = "Fast";`.
- Named exports can reference existing bindings, like `export name;`.
- Imported bindings are immutable in the importing module.

## Code Conventions

- Keep TypeScript lint-clean with `yarn lint`.
- Keep formatting clean with `yarn format`.
- `yarn lint` and `yarn format` should only check and report issues, not auto-fix them.
- `yarn dev` watches TypeScript sources and `.fast` files, including imported modules.
- Prefer explicit typing and follow the ESLint rules configured in `eslint.config.mjs`.
- Keep the TypeScript configuration aligned with `@tsconfig/strictest` in `tsconfig.json`.
- Character classification helpers should live in `src/utils/char.ts`.
- VS Code grammar updates should live in `vscode-extension/syntaxes/fast.tmLanguage.json`.
- Semantic checks should stay centralized in `src/semantic.ts`.
- Runtime scope behavior should stay centralized in `src/runtime.ts`.

## Documentation Rule

Whenever the project behavior, structure, commands, or language syntax changes:

- update `README.md`
- update `AGENTS.md` if the change affects conventions, architecture, or workflow

These two files should be treated as part of the implementation, not as optional documentation.
