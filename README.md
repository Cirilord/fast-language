# Fast Language

`fast` is a programming language project built for studying lexers, parsers, interpreters, and later a migration to C.

Right now the project is implemented in TypeScript and already supports:

- variable declarations with `var`
- constant declarations with `val`
- reassignment for `var`
- arithmetic expressions with `+`, `-`, `*`, `/`, `%`, unary `-`, unary `!`, and grouped expressions with `(...)`
- string concatenation with `+`
- comparison expressions with `>`, `>=`, `<`, `<=`, `==`, and `!=`
- logical expressions with `&&`, `||`, and `??`
- ternary expressions with `condition ? value : value`
- compound assignment operators with `+=`, `-=`, `*=`, `/=`, and `%=`
- logical assignment operators with `&&=`, `||=`, and `??=`
- function declarations with typed parameters and optional default values
- function types like `(): void` and `(string): void`
- anonymous function expressions like `function(text: string): void { ... }`
- rest parameters with typed arrays like `...items: string[]`
- overloaded functions and methods with signature declarations and a single `unknown` implementation
- generic functions and classes with type parameters like `<T, K = string>`
- `void` functions with `function name(): void { ... }`
- named functions expose implicit `name` and `toString()`, and `print(functionName)` uses the function string representation
- builtin runtime inspection helpers `typeOf(value)`, `isType(value, "string")`, and `isInstance(value, ClassName)`
- `throw` statements with class-based errors that extend `Error`
- `try { ... } except(error: ErrorType) { ... } finally { ... }`
- classes with mandatory access modifiers and `var`/`val` property mutability
- `abstract virtual class` contracts with `implements`
- semantic checks for class member access, inherited overrides, virtual methods, and constructor visibility
- object instantiation with `new ClassName()`
- member access with `.`, including `this`, `super`, and static members
- every class exposes an implicit static `name`, and instances can access it through `this.constructor.name`
- classes expose an implicit `toString()`, instances can override `toString(): string`, and `print(instance)` uses it automatically
- namespace imports with `import File from "./file";`
- named imports with `import { name } from "./file";`
- combined imports with `import File, { name } from "./file";`
- named exports with `export var`, `export val`, `export function`, and `export name;`
- symbolic enums like `enum Status { Pending, Done }`
- typed numeric declarations like `var count: int = 10;`
- typed variable declarations like `var name: string = "Fast";`
- inferred variable declarations like `var name = "Fast";`
- contextual `null` values like `var name: string = null;`
- typed arrays like `string[]`
- tuple types and literals like `(string, int)` and `("Fast", 10)`
- string literals with `"`
- multiline strings with `` ` ``
- line comments with `//`
- array literals with `[value, value]`
- array index access like `items[0]`
- array index assignment like `items[0] = "value"`
- `for ... of` loops with optional index binding
- classic `for` loops with initializer, condition, and increment
- `if`, `else if`, and `else` with boolean conditions
- `switch` statements with block-based `case` clauses, `default`, and explicit `fallthrough`
- `break` and `continue` inside loops
- `while` loops with boolean conditions
- `do ... while` loops with boolean conditions
- generic function-call parsing like `print(a);`
- a builtin `print(...)` in the interpreter
- local VS Code syntax highlighting support in `vscode-extension`

## Example

`main.fast`

```fast
import File1, { importedText, logImportedText } from "./file1";

// Number types are declared on variables.
val items: string[] = ["first", "second", "third"];
val firstItem: string = items[0];
val profile: (string, int, double) = ("Cirilo", 30, 1.80);
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
val statusMessage: string = "Status: " + status;
val itemMessage: string = "First item: " + items[0];

enum LoadState {
  Idle,
  Loading,
  Done
}

function getStatus(): string {
  return status;
}

function logStatus(label: string = "status"): void {
  print(label);
  print(status);
  return;
}

function logAll(prefix: string, ...items: string[]): void {
  print(prefix);
  print(items);
  return;
}

function identity<T>(value: T): T {
  return value;
}

function logGenericText<T, K = string>(importedText: K, output: T): T {
  print(importedText);
  return output;
}

function logIntValue(value: int): void {
  print(value);
  return;
}

function logStringValue(value: string): void {
  print(value);
  return;
}

function run(callback: (): void): void {
  callback();
  return;
}

function runWithText(callback: (string): void, text: string): void {
  callback(text);
  return;
}

function sayHi(): void {
  print("hi");
  return;
}

function logValue(value: string): void;
function logValue(value: int): void;
function logValue(value: unknown): void {
  if (isType(value, "string") && isType(status, "string")) {
    print("function string");
    logStringValue(value);
    return;
  }

  print("function int");
  logIntValue(value);
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
    print(this.constructor.name);
  }
}

class User extends BaseName implements Printable {
  public static val label: string = "User";
  public var displayName: string = "Fast";

  public constructor(displayName: string = "Fast object") {
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

  public override toString(): string {
    return this.displayName;
  }
}

class Box<T, K = string> {
  public var label: K = null;
  public var value: T = null;

  public constructor(value: T, label: K) {
    this.value = value;
    this.label = label;
  }

  public getValue(): T {
    return this.value;
  }
}

class Logger {
  public log(value: string): void;
  public log(value: int): void;
  public log(value: unknown): void {
    if (isType(value, "string")) {
      print("method string");
      logStringValue(value);
      return;
    }

    print("method int");
    logIntValue(value);
    return;
  }
}

class AppError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

val loadState: LoadState = LoadState.Idle;
val callbackRef: (string): void = logStringValue;
val computedStatus: string = getStatus();
val genericStatus: string = identity<string>(status);
val importedStatus: string = logGenericText<string>("Imported generic text", status);
var box: Box<string, string> = new Box<string>(status, "status-box");
var logger: Logger = new Logger();
var user: User = new User();

x += 5;
x -= 2;
x *= 3;
x %= 5;
x /= 2;
shouldPrint &&= 10 == 10;
shouldFallback ||= 10 == 10;
nullableText ??= "Fallback text";
items[0] = "updated first";

for (var item, index of items) {
  print(index);
  print(item);
}

for (var classicIndex: int = 0; classicIndex < 3; classicIndex += 1) {
  print(classicIndex);
}

while (counter < 3) {
  if (counter == 1) {
    counter += 1;
    continue;
  }

  print(counter);
  counter += 1;
}

do {
  print(doCounter);
  doCounter += 1;
} while (doCounter < 2);

for (var loopItem, loopIndex of items) {
  if (loopIndex == 1) {
    continue;
  }

  if (loopIndex == 2) {
    break;
  }

  print(loopItem);
}

if (isType(status, "string")) {
  print("status is string");
} else if (isType(status, "int")) {
  print("status is int");
} else {
  print("status has another type");
}

switch (status) {
  case "enabled" {
    print("switch enabled");
    fallthrough;
  }

  case "disabled" {
    print("switch handled");
  }

  default {
    print("switch fallback");
  }
}

switch (profile) {
  case ("Cirilo", 30, 1.8) {
    print("tuple switch match");
  }

  default {
    print("tuple switch fallback");
  }
}

switch (loadState) {
  case LoadState.Idle {
    print("enum switch idle");
  }

  default {
    print("enum switch fallback");
  }
}

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
print(statusMessage);
print(itemMessage);
print(computedStatus);
print(genericStatus);
print(logGenericText);
print(logGenericText.name);
print(logGenericText.toString());
print(typeOf(logGenericText));
print(typeOf(User));
print(typeOf(user));
print(typeOf(items));
print(typeOf(LoadState));
print(typeOf(loadState));
print(isType(status, "string"));
print(isType(x, "int"));
print(isInstance(user, User));
print(isInstance(user, BaseName));
print(importedStatus);
print(importedText);
print(File1.importedText);
print(firstItem);
print(profile);
print(loadState);
print(box.getValue());
print(BaseName.name);
print(BaseName.toString());
print(user.toString());
print(user);
user.printName();
User.showLabel();
logStatus();
logAll("values", "alpha", "beta", "gamma");
logValue("global overload");
logValue(42);
logger.log("class overload");
logger.log(7);
run(sayHi);
run(function(): void {
  print("inline callback");
  return;
});
runWithText(callbackRef, "callback ref");
runWithText(function(text: string): void {
  print(text);
  return;
}, "callback inline");
logImportedText();
File1.logImportedText();

try {
  throw new AppError("App failed");
} except(error: TypeError) {
  print("type error");
} except(error: AppError) {
  print(error.message);
} except(error: Error) {
  print("generic error");
} finally {
  print("finally");
}
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

## Imports

The language supports three import forms:

```fast
import File1 from "./file1";
import { importedText } from "./file1";
import File1, { importedText } from "./file1";
```

Rules:

- the namespace import always comes first when combined with named imports
- namespace members are accessed with `.`, like `File1.logImportedText()`
- imported bindings remain immutable

## Switch

`switch` compares runtime equality for `string`, `int`, `float`, `double`, `boolean`, `null`, and tuple values.

```fast
switch (status) {
  case "enabled" {
    print("enabled");
    fallthrough;
  }

  case "disabled" {
    print("handled");
  }

  default {
    print("fallback");
  }
}
```

Rules:

- every `case` and `default` clause must use a block
- `fallthrough;` is explicit
- `fallthrough;` must be the final top-level statement in a `case`
- `fallthrough;` cannot appear inside `if`, loops, `try`, or nested blocks
- the final switch clause cannot use `fallthrough;`

## Enums

Enums are symbolic named constants with member access through `.`.

```fast
enum LoadState {
  Idle,
  Loading,
  Done
}

val loadState: LoadState = LoadState.Idle;

if (loadState == LoadState.Idle) {
  print("idle");
}
```

Rules:

- enum members are accessed like `LoadState.Idle`
- enum members compare with `==` and `!=`
- enum values can be used in `switch`
- `print(LoadState.Idle)` renders as `LoadState.Idle`

## Overloads

Overloads are supported for both top-level functions and class methods.

```fast
function log(value: string): void;
function log(value: int): void;
function log(value: unknown): void {
  print(isType(value, "string") ? "string" : "int");
  print(value);
  return;
}
```

Rules:

- overload signatures are declarations without a body
- exactly one implementation with a body must come after the signatures
- overloads are available for global functions and class methods
- all signatures in the same overload group must keep the same return type
- method overloads must also keep the same access modifier and `static` modifier
- the implementation must keep the same parameter count as the signatures
- any parameter position that varies across signatures must use `unknown` in the implementation
- `unknown` is reserved for overload implementations and cannot be used in normal bindings, properties, returns, or regular parameters
- overload groups currently do not support default parameters or rest parameters

Inside `if` branches, the semantic analyzer narrows identifier types for:

- `isType(value, "...")`
- `isInstance(value, ClassName)`

That narrowing also works through compound conditions and negation:

- `&&` accumulates guards from both sides
- `||` keeps only guards that are shared by both sides
- `!` swaps the positive and negative branch guards of the nested condition

That makes overload implementations with `unknown` practical:

```fast
function log(value: string): void;
function log(value: int): void;
function log(value: unknown): void {
  if (!(isType(value, "string") && isType(status, "string"))) {
    return;
  }

  if (isType(value, "string") && isType(status, "string")) {
    logStringValue(value);
    return;
  }
}
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
- `+` also supports string concatenation when at least one operand is a string
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
- accepted variable types include `boolean`, `double`, `float`, `int`, `string`, declared class names, typed arrays like `string[]`, and tuple types like `(string,int)`
- `null` declarations require an explicit declared type, like `var name: string = null;`
- named imports use `import { name } from "./file";` and resolve local `.fast` files
- named exports can be inline, like `export var name = "Fast";`
- named exports can reference existing bindings, like `export name;`
- imported bindings are immutable in the importing module
- normal strings must use `"`
- multiline strings must use `` ` ``
- line comments start with `//` and run until the end of the line
- arrays use `[value, value]`
- array types use `T[]`, like `string[]`
- array index access uses `array[index]`, and the index must be an `int`
- array index assignment uses `array[index] = value`, and the value must be compatible with the array element type
- tuple types use `(T1, T2, ...)` and tuple literals use `(value1, value2, ...)`
- `for` loops use `for (var element of array) { ... }`
- `for` loops can access index with `for (var element, index of array) { ... }`
- classic `for` loops use `for (initializer; condition; increment) { ... }`
- `break` and `continue` can only be used inside `for`, `while`, and `do while`
- `while` loops use `while (condition) { ... }` and the condition must be boolean
- `do while` loops use `do { ... } while (condition);` and the condition must be boolean
- functions use `function name(parameter: type): type { return value; }`
- parameters can use default values like `label: string = "status"`
- function return values must match the declared return type
- functions that do not return a value use `void`, like `function name(): void { ... }`
- named functions expose implicit `name` and `toString()`, like `logGenericText.name` and `logGenericText.toString()`
- `typeOf(value)` returns runtime categories like `"string"`, `"int"`, `"function"`, `"class"`, `"enum"`, `"object"`, `"array"`, and `"tuple"`
- `isType(value, "string")` compares the runtime category returned by `typeOf`
- `isInstance(value, ClassName)` checks whether an object instance belongs to a class or one of its base classes
- `throw value;` requires a value whose class extends `Error`
- `try` statements require at least one `except(error: ErrorType)` block, and may optionally end with `finally`
- duplicate `except` types are rejected, and broader earlier `except` clauses make narrower later ones unreachable
- classes use `class Name { ... }`
- abstract virtual contracts use `abstract virtual class Name { ... }`
- classes can extend one base class with `extends` and implement abstract virtual contracts with `implements`
- class members require `public`, `protected`, or `private`
- `public`, `protected`, and `private` are checked semantically on member access and constructor calls
- class properties require `var` or `val`, like `public var name: string = "Fast";`
- `static` comes after the access modifier and before `var`/`val`, like `public static val label: string = "User";`
- constructors use `public constructor(parameter: type = value) { ... }`
- methods use return annotations and can accept parameters, like `public name(prefix: string): string { ... }`
- abstract virtual class methods use signatures without bodies, like `public print(): void;`
- implemented contract methods use `override`, like `public override print(): void { ... }`
- overrides of inherited methods must use `override` and match the inherited signature
- concrete classes must implement inherited virtual methods
- subclass constructors must start with `super()` when extending a base class
- objects are created with `new Name()` and members are accessed with `.`
- `this` is available in constructors and methods, and `super()`/`super.method()` are available in subclasses
- builtin error classes include `Error`, `TypeError`, and `ReferenceError`
- `print` is treated as an identifier in the lexer and as a builtin at runtime
- symbol existence, callability, and `val` reassignment are checked semantically before execution

## Next Steps

Possible next milestones:

- multiple function arguments
- nested scopes
- migration from TypeScript interpreter to C implementation
