# Fast Language

`fast` is a programming language project built for studying lexers, parsers, interpreters, and later a migration to C.

Right now the project is implemented in TypeScript and already supports:

- variable declarations with `var`
- constant declarations with `val`
- reassignment for `var`
- arithmetic expressions with `+`, `-`, `*`, `/`, `%`, unary `-`, and grouped expressions with `(...)`
- comparison expressions with `>`, `>=`, `<`, `<=`, `==`, and `!=`
- logical expressions with `&&`, `||`, and `??`
- ternary expressions with `condition ? value : value`
- compound assignment operators with `+=`, `-=`, `*=`, `/=`, and `%=`
- logical assignment operators with `&&=`, `||=`, and `??=`
- function declarations with `function name(): type { return value; }`
- `void` functions with `function name(): void { ... }`
- classes with mandatory access modifiers and `var`/`val` property mutability
- `abstract virtual class` contracts with `implements`
- object instantiation with `new ClassName()`
- member access with `.`, including `this`, `super`, and static members
- named imports with `import { name } from "./file";`
- named exports with `export var`, `export val`, `export function`, and `export name;`
- typed numeric declarations like `var count: int = 10;`
- typed variable declarations like `var name: string = "Fast";`
- inferred variable declarations like `var name = "Fast";`
- contextual `null` values like `var name: string = null;`
- string literals with `"`
- multiline strings with `` ` ``
- line comments with `//`
- array literals with `[value, value]`
- `for ... of` loops with optional index binding
- `while` loops with boolean conditions
- `do ... while` loops with boolean conditions
- generic function-call parsing like `print(a);`
- a builtin `print(...)` in the interpreter
- local VS Code syntax highlighting support in `vscode-extension`

## Example

`main.fast`

```fast
import { importedText, logImportedText } from "./file1";

// Number types are declared on variables.
val items: array = ["first", "second", "third"];
val result: int = (10 + 5) * 2;
val directNegative: int = -10;
val negative: int = -(5 + 2);
val rest: int = 10 % 3;
val isBigger: boolean = 10 > 5;
val isEqual: boolean = 10 == 10;
val price: float = 20.0;
val precise: double = 30.0;
var nullableText: string = null;
var x: int = 10;
var counter: int = 0;
var doCounter: int = 0;
var shouldPrint: boolean = 10 > 5;
var shouldFallback: boolean = 5 > 10;
val canPrint: boolean = shouldPrint && shouldFallback;
val canFallback: boolean = shouldPrint || shouldFallback;
val fallbackText: string = nullableText ?? "Default text";
val status: string = canFallback ? "enabled" : "disabled";

function getStatus(): string {
  return status;
}

function logStatus(): void {
  print(status);
  return;
}

abstract virtual class Printable {
  public printName(): void;
}

class BaseName {
  protected val name: string = "base";

  public constructor() {}

  protected sayBase(): void {
    print(this.name);
  }
}

class User extends BaseName implements Printable {
  public static val label: string = "User";
  public var displayName: string = "Fast";

  public constructor(displayName: string) {
    super();
    this.displayName = displayName;
  }

  public static showLabel(): void {
    print(User.label);
  }

  public override printName(): void {
    print(this.displayName);
    super.sayBase();
  }
}

val computedStatus: string = getStatus();
var user: User = new User("Fast object");

x += 5;
x -= 2;
x *= 3;
x %= 5;
x /= 2;
shouldPrint &&= 10 == 10;
shouldFallback ||= 10 == 10;
nullableText ??= "Fallback text";

for (var item, index of items) {
  print(index);
  print(item);
}

while (counter < 3) {
  print(counter);
  counter += 1;
}

do {
  print(doCounter);
  doCounter += 1;
} while (doCounter < 2);

print(result);
print(directNegative);
print(negative);
print(rest);
print(isBigger);
print(isEqual);
print(price);
print(precise);
print(nullableText);
print(x);
print(shouldPrint);
print(shouldFallback);
print(canPrint);
print(canFallback);
print(fallbackText);
print(status);
print(computedStatus);
print(importedText);
user.printName();
User.showLabel();
logStatus();
logImportedText();
```

`file1.fast`

```fast
var importedText = "Imported text";

function logImportedText(): void {
  print(importedText);
  return;
}

export importedText;
export logImportedText;
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
- `src/module.ts`: loads, analyzes, caches, and executes imported `.fast` modules
- `src/utils/char.ts`: reusable character helpers
- `src/index.ts`: entrypoint that executes `main.fast` through the module loader
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

`yarn dev` watches TypeScript sources and `.fast` files, including imported modules.

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
- compound assignment operators `+=`, `-=`, `*=`, `/=`, and `%=` also expect number operands
- logical operators `&&` and `||` expect boolean operands and short-circuit
- nullish coalescing `??` returns the right value only when the left value is `null`
- ternary expressions use `condition ? value : value`, require a boolean condition, and require compatible branch types
- logical assignment operators `&&=` and `||=` expect boolean operands
- nullish assignment `??=` assigns only when the current value is `null`
- comparison operators `>`, `>=`, `<`, and `<=` expect number operands and return booleans
- equality operators `==` and `!=` return booleans
- unary `-` can be used with numbers, including grouped expressions like `-(5 + 2)`
- parentheses can be used to group arithmetic expressions
- integer literals do not use decimal points, like `10`
- decimal literals use decimal points, like `20.0`
- numeric variable types are `int`, `float`, and `double`
- variable declarations can include a type annotation, like `var name: string = "Fast";`
- variable declarations can infer type from non-null initializers, like `var name = "Fast";`
- accepted variable types include `array`, `boolean`, `double`, `float`, `int`, `string`, and declared class names
- `null` declarations require an explicit declared type, like `var name: string = null;`
- named imports use `import { name } from "./file";` and resolve local `.fast` files
- named exports can be inline, like `export var name = "Fast";`
- named exports can reference existing bindings, like `export name;`
- imported bindings are immutable in the importing module
- normal strings must use `"`
- multiline strings must use `` ` ``
- line comments start with `//` and run until the end of the line
- arrays use `[value, value]`
- `for` loops use `for (var element of array) { ... }`
- `for` loops can access index with `for (var element, index of array) { ... }`
- `while` loops use `while (condition) { ... }` and the condition must be boolean
- `do while` loops use `do { ... } while (condition);` and the condition must be boolean
- functions use `function name(parameter: type): type { return value; }`
- function return values must match the declared return type
- functions that do not return a value use `void`, like `function name(): void { ... }`
- classes use `class Name { ... }`
- abstract virtual contracts use `abstract virtual class Name { ... }`
- classes can extend one base class with `extends` and implement abstract virtual contracts with `implements`
- class members require `public`, `protected`, or `private`
- class properties require `var` or `val`, like `public var name: string = "Fast";`
- `static` comes after the access modifier and before `var`/`val`, like `public static val label: string = "User";`
- constructors use `public constructor(parameter: type) { ... }`
- methods use return annotations and can accept parameters, like `public name(prefix: string): string { ... }`
- abstract virtual class methods use signatures without bodies, like `public print(): void;`
- implemented contract methods use `override`, like `public override print(): void { ... }`
- objects are created with `new Name()` and members are accessed with `.`
- `this` is available in constructors and methods, and `super()`/`super.method()` are available in subclasses
- `print` is treated as an identifier in the lexer and as a builtin at runtime
- symbol existence, callability, and `val` reassignment are checked semantically before execution

## Next Steps

Possible next milestones:

- multiple function arguments
- nested scopes
- migration from TypeScript interpreter to C implementation
