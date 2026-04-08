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
- function declarations with typed parameters and optional default values
- rest parameters with typed arrays like `...items: string[]`
- generic functions and classes with type parameters like `<T, K = string>`
- `void` functions with `function name(): void { ... }`
- named functions expose implicit `name` and `toString()`, and `print(functionName)` uses the function string representation
- classes with mandatory access modifiers and `var`/`val` property mutability
- `abstract virtual class` contracts with `implements`
- semantic checks for class member access, inherited overrides, virtual methods, and constructor visibility
- object instantiation with `new ClassName()`
- member access with `.`, including `this`, `super`, and static members
- every class exposes an implicit static `name`, and instances can access it through `this.constructor.name`
- classes expose an implicit `toString()`, instances can override `toString(): string`, and `print(instance)` uses it automatically
- named imports with `import { name } from "./file";`
- named exports with `export var`, `export val`, `export function`, and `export name;`
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
val items: string[] = ["first", "second", "third"];
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

val computedStatus: string = getStatus();
val genericStatus: string = identity<string>(status);
val importedStatus: string = logGenericText<string>("Imported generic text", status);
var box: Box<string, string> = new Box<string>(status, "status-box");
var user: User = new User();

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
print(genericStatus);
print(logGenericText);
print(logGenericText.name);
print(logGenericText.toString());
print(importedStatus);
print(importedText);
print(profile);
print(box.getValue());
print(BaseName.name);
print(BaseName.toString());
print(user.toString());
print(user);
user.printName();
User.showLabel();
logStatus();
logAll("values", "alpha", "beta", "gamma");
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
- tuple types use `(T1, T2, ...)` and tuple literals use `(value1, value2, ...)`
- `for` loops use `for (var element of array) { ... }`
- `for` loops can access index with `for (var element, index of array) { ... }`
- `while` loops use `while (condition) { ... }` and the condition must be boolean
- `do while` loops use `do { ... } while (condition);` and the condition must be boolean
- functions use `function name(parameter: type): type { return value; }`
- parameters can use default values like `label: string = "status"`
- function return values must match the declared return type
- functions that do not return a value use `void`, like `function name(): void { ... }`
- named functions expose implicit `name` and `toString()`, like `logGenericText.name` and `logGenericText.toString()`
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
- `print` is treated as an identifier in the lexer and as a builtin at runtime
- symbol existence, callability, and `val` reassignment are checked semantically before execution

## Next Steps

Possible next milestones:

- multiple function arguments
- nested scopes
- migration from TypeScript interpreter to C implementation
