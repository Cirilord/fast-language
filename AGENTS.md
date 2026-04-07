# AGENTS

## Purpose

This file tracks working conventions for the `fast` language project so future changes stay consistent.

## Project State

- The project is currently a TypeScript implementation of the `fast` language.
- The language already has a lexer, parser, semantic analyzer, and interpreter.
- Local VS Code syntax highlighting lives in `vscode-extension`.
- Runtime name resolution is currently handled through `Scope` in `src/runtime.ts`.
- The active sample program lives in `main.fast`.

## Language Conventions

- `var` is mutable.
- `val` is immutable.
- only `var` can be reassigned.
- Arithmetic operators currently expect number operands.
- Parentheses can group arithmetic expressions.
- Unary `-` can be used with numbers and grouped numeric expressions.
- Number literals must include a type suffix: `i` for integer, `f` for float, or `d` for double.
- Integer literals cannot include a decimal point; use `f` or `d` for decimal values.
- Arithmetic promotes mixed numeric types, and division between integers produces a `double`.
- `print` is not a lexer keyword; it is tokenized as `IDENTIFIER`.
- Normal strings use `"`.
- Multiline strings use `` ` ``.
- Line comments start with `//` and run until the end of the line.
- Arrays use `[value, value]`.
- `for` loops use `for (var element of array) { ... }`.
- `for` loops can access index with `for (var element, index of array) { ... }`.

## Code Conventions

- Keep TypeScript lint-clean with `yarn lint`.
- Keep formatting clean with `yarn format`.
- `yarn lint` and `yarn format` should only check and report issues, not auto-fix them.
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
