import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  ConditionalExpression,
  DoWhileStatement,
  ExportDeclaration,
  Expression,
  ForStatement,
  FunctionDeclaration,
  FunctionReturnType,
  Identifier,
  ImportDeclaration,
  NumberLiteral,
  NumberLiteralType,
  Program,
  ReturnStatement,
  Statement,
  StringLiteral,
  TypeName,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { createReferenceError, createTypeError } from './errors';

type Binding = {
  mutable: boolean;
  typeAnnotation?: TypeName;
  value: RuntimeValue;
};

export type BooleanValue = {
  type: 'boolean';
  value: boolean;
};

export type ArrayValue = {
  elements: RuntimeValue[];
  type: 'array';
};

export type NativeFunctionValue = {
  call: (args: RuntimeValue[]) => RuntimeValue;
  name: string;
  type: 'native-function';
};

export type NullValue = {
  type: 'null';
  value: null;
};

export type NumberValue = {
  numberType: NumberLiteralType;
  type: 'number';
  value: number;
};

export type StringValue = {
  type: 'string';
  value: string;
};

export type UserFunctionValue = {
  body: Statement[];
  closure: Scope;
  name: string;
  returnType: FunctionReturnType;
  type: 'function';
};

export type RuntimeValue =
  | ArrayValue
  | BooleanValue
  | NativeFunctionValue
  | NullValue
  | NumberValue
  | StringValue
  | UserFunctionValue;

export type RuntimeModuleExports = ReadonlyMap<string, RuntimeValue>;

export type RuntimeImportResolver = (source: string) => RuntimeModuleExports;

class ReturnSignal {
  public constructor(public readonly value: RuntimeValue) {}
}

function promoteNumberType(
  operator: BinaryOperator,
  leftType: NumberLiteralType,
  rightType: NumberLiteralType
): NumberLiteralType {
  if (leftType === 'double' || rightType === 'double') {
    return 'double';
  }

  if (leftType === 'float' || rightType === 'float') {
    return 'float';
  }

  if (operator === '/') {
    return 'double';
  }

  return 'int';
}

function areRuntimeValuesEqual(left: RuntimeValue, right: RuntimeValue): boolean {
  if (left.type !== right.type) {
    return false;
  }

  switch (left.type) {
    case 'array':
      return left === right;
    case 'boolean':
      return right.type === 'boolean' && left.value === right.value;
    case 'native-function':
      return left === right;
    case 'function':
      return left === right;
    case 'null':
      return true;
    case 'number':
      return right.type === 'number' && left.value === right.value;
    case 'string':
      return right.type === 'string' && left.value === right.value;
  }
}

function isEqualityOperator(operator: BinaryOperator): boolean {
  return operator === '==' || operator === '!=';
}

function isLogicalOperator(operator: BinaryOperator): boolean {
  return operator === '&&' || operator === '||';
}

function toBinaryOperator(operator: AssignmentOperator): BinaryOperator {
  switch (operator) {
    case '&&=':
    case '??=':
    case '||=':
      throw createTypeError(`Logical assignment operator '${operator}' cannot be converted to a binary operator`);
    case '%=':
      return '%';
    case '*=':
      return '*';
    case '+=':
      return '+';
    case '-=':
      return '-';
    case '/=':
      return '/';
    case '=':
      throw createTypeError("Simple assignment operator '=' cannot be converted to a binary operator");
  }
}

function isNumericTypeAnnotation(typeAnnotation: TypeName | undefined): typeAnnotation is NumberLiteralType {
  return typeAnnotation === 'double' || typeAnnotation === 'float' || typeAnnotation === 'int';
}

function coerceValueToBindingType(value: RuntimeValue, typeAnnotation: TypeName | undefined): RuntimeValue {
  if (value.type === 'number' && isNumericTypeAnnotation(typeAnnotation)) {
    return {
      ...value,
      numberType: typeAnnotation,
    };
  }

  return value;
}

class Scope {
  private readonly bindings = new Map<string, Binding>();

  public constructor(private readonly parent?: Scope) {}

  public assign(name: string, value: RuntimeValue): RuntimeValue {
    const binding = this.resolve(name);

    if (!binding) {
      throw createReferenceError(`Binding '${name}' is not defined`);
    }

    if (!binding.mutable) {
      throw createTypeError(`Cannot reassign immutable binding '${name}'`);
    }

    binding.value = coerceValueToBindingType(value, binding.typeAnnotation);
    return binding.value;
  }

  public define(name: string, value: RuntimeValue, mutable: boolean, typeAnnotation?: TypeName): RuntimeValue {
    if (this.bindings.has(name)) {
      throw createTypeError(`Binding '${name}' is already defined`);
    }

    const bindingValue = coerceValueToBindingType(value, typeAnnotation);
    const binding: Binding = { mutable, value: bindingValue };

    if (typeAnnotation !== undefined) {
      binding.typeAnnotation = typeAnnotation;
    }

    this.bindings.set(name, binding);
    return bindingValue;
  }

  public lookup(name: string): RuntimeValue {
    const binding = this.resolve(name);

    if (!binding) {
      throw createReferenceError(`Binding '${name}' is not defined`);
    }

    return binding.value;
  }

  private resolve(name: string): Binding | undefined {
    return this.bindings.get(name) ?? this.parent?.resolve(name);
  }
}

function evaluateCompoundAssignment(
  current: NumberValue,
  operator: AssignmentOperator,
  value: NumberValue
): NumberValue {
  const binaryOperator = toBinaryOperator(operator);
  const numberType = promoteNumberType(binaryOperator, current.numberType, value.numberType);

  switch (operator) {
    case '&&=':
    case '??=':
    case '||=':
      throw createTypeError(`Logical assignment operator '${operator}' cannot be evaluated as numeric assignment`);
    case '%=':
      return { numberType, type: 'number', value: current.value % value.value };
    case '*=':
      return { numberType, type: 'number', value: current.value * value.value };
    case '+=':
      return { numberType, type: 'number', value: current.value + value.value };
    case '-=':
      return { numberType, type: 'number', value: current.value - value.value };
    case '/=':
      return { numberType, type: 'number', value: current.value / value.value };
    case '=':
      throw createTypeError("Simple assignment operator '=' cannot be evaluated as compound assignment");
  }
}

export class Interpreter {
  private readonly exports = new Map<string, RuntimeValue>();
  private scope = new Scope();

  public constructor(private readonly resolveImport?: RuntimeImportResolver) {
    this.scope.define(
      'print',
      {
        call: (args): RuntimeValue => {
          const renderedArgs = args.map((arg) => this.runtimeValueToString(arg));
          console.log(...renderedArgs);

          return { type: 'null', value: null };
        },
        name: 'print',
        type: 'native-function',
      },
      false
    );
  }

  public execute(program: Program): RuntimeValue {
    let lastValue: RuntimeValue = { type: 'null', value: null };

    for (const statement of program.body) {
      lastValue = this.executeStatement(statement);
    }

    return lastValue;
  }

  public getExports(): RuntimeModuleExports {
    return this.exports;
  }

  private callUserFunction(callee: UserFunctionValue): RuntimeValue {
    try {
      return this.withScopeFrom(callee.closure, () => {
        let lastValue: RuntimeValue = { type: 'null', value: null };

        for (const bodyStatement of callee.body) {
          lastValue = this.executeStatement(bodyStatement);
        }

        return lastValue;
      });
    } catch (error) {
      if (error instanceof ReturnSignal) {
        return error.value;
      }

      throw error;
    }
  }

  private evaluateArrayLiteral(expression: ArrayLiteral): RuntimeValue {
    return {
      elements: expression.elements.map((element) => this.evaluateExpression(element)),
      type: 'array',
    };
  }

  private evaluateAssignmentValue(statement: AssignmentStatement): RuntimeValue {
    if (statement.operator === '=') {
      return this.evaluateExpression(statement.value);
    }

    const current = this.scope.lookup(statement.identifier.name);

    if (statement.operator === '??=') {
      return current.type === 'null' ? this.evaluateExpression(statement.value) : current;
    }

    if (statement.operator === '&&=' || statement.operator === '||=') {
      if (current.type !== 'boolean') {
        throw createTypeError(`Operator '${statement.operator}' expects boolean operands`);
      }

      if ((statement.operator === '&&=' && !current.value) || (statement.operator === '||=' && current.value)) {
        return current;
      }

      const value = this.evaluateExpression(statement.value);

      if (value.type !== 'boolean') {
        throw createTypeError(`Operator '${statement.operator}' expects boolean operands`);
      }

      return value;
    }

    const value = this.evaluateExpression(statement.value);

    if (current.type !== 'number' || value.type !== 'number') {
      throw createTypeError(`Operator '${statement.operator}' expects number operands`);
    }

    return evaluateCompoundAssignment(current, statement.operator, value);
  }

  private evaluateBinaryExpression(expression: BinaryExpression): RuntimeValue {
    const left = this.evaluateExpression(expression.left);

    if (isLogicalOperator(expression.operator)) {
      if (left.type !== 'boolean') {
        throw createTypeError(`Operator '${expression.operator}' expects boolean operands`);
      }

      if ((expression.operator === '&&' && !left.value) || (expression.operator === '||' && left.value)) {
        return left;
      }

      const right = this.evaluateExpression(expression.right);

      if (right.type !== 'boolean') {
        throw createTypeError(`Operator '${expression.operator}' expects boolean operands`);
      }

      return right;
    }

    if (expression.operator === '??') {
      return left.type === 'null' ? this.evaluateExpression(expression.right) : left;
    }

    const right = this.evaluateExpression(expression.right);

    if (isEqualityOperator(expression.operator)) {
      const value = areRuntimeValuesEqual(left, right);

      return {
        type: 'boolean',
        value: expression.operator === '!=' ? !value : value,
      };
    }

    if (left.type !== 'number' || right.type !== 'number') {
      throw createTypeError(`Operator '${expression.operator}' expects number operands`);
    }

    switch (expression.operator) {
      case '>':
        return {
          type: 'boolean',
          value: left.value > right.value,
        };
      case '>=':
        return {
          type: 'boolean',
          value: left.value >= right.value,
        };
      case '<':
        return {
          type: 'boolean',
          value: left.value < right.value,
        };
      case '<=':
        return {
          type: 'boolean',
          value: left.value <= right.value,
        };
      case '%':
        return {
          numberType: promoteNumberType(expression.operator, left.numberType, right.numberType),
          type: 'number',
          value: left.value % right.value,
        };
      case '+':
        return {
          numberType: promoteNumberType(expression.operator, left.numberType, right.numberType),
          type: 'number',
          value: left.value + right.value,
        };
      case '-':
        return {
          numberType: promoteNumberType(expression.operator, left.numberType, right.numberType),
          type: 'number',
          value: left.value - right.value,
        };
      case '*':
        return {
          numberType: promoteNumberType(expression.operator, left.numberType, right.numberType),
          type: 'number',
          value: left.value * right.value,
        };
      case '/':
        return {
          numberType: promoteNumberType(expression.operator, left.numberType, right.numberType),
          type: 'number',
          value: left.value / right.value,
        };
      case '!=':
      case '==':
      case '&&':
      case '||':
        throw createTypeError(`Operator '${expression.operator}' should be handled before arithmetic`);
    }
  }

  private evaluateCallExpression(expression: CallExpression): RuntimeValue {
    const callee = this.scope.lookup(expression.callee.name);

    const args = expression.arguments.map((arg) => this.evaluateExpression(arg));

    if (callee.type === 'native-function') {
      return callee.call(args);
    }

    if (callee.type === 'function') {
      if (args.length !== 0) {
        throw createTypeError(`Function '${callee.name}' expects 0 arguments, got ${args.length}`);
      }

      return this.callUserFunction(callee);
    }

    throw createTypeError(`Binding '${expression.callee.name}' is not callable`);
  }

  private evaluateConditionalExpression(expression: ConditionalExpression): RuntimeValue {
    const test = this.evaluateExpression(expression.test);

    if (test.type !== 'boolean') {
      throw createTypeError('Ternary condition must be a boolean');
    }

    return this.evaluateExpression(test.value ? expression.consequent : expression.alternate);
  }

  private evaluateExpression(expression: Expression): RuntimeValue {
    switch (expression.kind) {
      case 'ArrayLiteral':
        return this.evaluateArrayLiteral(expression);
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(expression);
      case 'CallExpression':
        return this.evaluateCallExpression(expression);
      case 'ConditionalExpression':
        return this.evaluateConditionalExpression(expression);
      case 'Identifier':
        return this.evaluateIdentifier(expression);
      case 'NumberLiteral':
        return this.evaluateNumberLiteral(expression);
      case 'NullLiteral':
        return this.evaluateNullLiteral();
      case 'StringLiteral':
        return this.evaluateStringLiteral(expression);
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(expression);
    }
  }

  private evaluateIdentifier(expression: Identifier): RuntimeValue {
    return this.scope.lookup(expression.name);
  }

  private evaluateNullLiteral(): RuntimeValue {
    return {
      type: 'null',
      value: null,
    };
  }

  private evaluateNumberLiteral(expression: NumberLiteral): RuntimeValue {
    return {
      numberType: expression.numberType,
      type: 'number',
      value: expression.value,
    };
  }

  private evaluateStringLiteral(expression: StringLiteral): RuntimeValue {
    return {
      type: 'string',
      value: expression.value,
    };
  }

  private evaluateUnaryExpression(expression: UnaryExpression): RuntimeValue {
    const argument = this.evaluateExpression(expression.argument);

    if (argument.type !== 'number') {
      throw createTypeError(`Operator '${expression.operator}' expects a number operand`);
    }

    return {
      numberType: argument.numberType,
      type: 'number',
      value: -argument.value,
    };
  }

  private executeAssignmentStatement(statement: AssignmentStatement): RuntimeValue {
    const value = this.evaluateAssignmentValue(statement);
    return this.scope.assign(statement.identifier.name, value);
  }

  private executeDoWhileStatement(statement: DoWhileStatement): RuntimeValue {
    let lastValue: RuntimeValue;
    let shouldContinue: boolean;

    do {
      lastValue = this.withScope(() => {
        let bodyValue: RuntimeValue = { type: 'null', value: null };

        for (const bodyStatement of statement.body) {
          bodyValue = this.executeStatement(bodyStatement);
        }

        return bodyValue;
      });

      const condition = this.evaluateExpression(statement.condition);

      if (condition.type !== 'boolean') {
        throw createTypeError('Do while condition must be a boolean');
      }

      shouldContinue = condition.value;
    } while (shouldContinue);

    return lastValue;
  }

  private executeExportDeclaration(statement: ExportDeclaration): RuntimeValue {
    const value =
      statement.declaration === undefined
        ? ({ type: 'null', value: null } satisfies NullValue)
        : this.executeStatement(statement.declaration);

    const identifier = statement.declaration?.identifier ?? statement.identifier;

    if (identifier === undefined) {
      throw createTypeError('Expected exported binding name');
    }

    this.exports.set(identifier.name, this.scope.lookup(identifier.name));

    return value;
  }

  private executeForStatement(statement: ForStatement): RuntimeValue {
    const iterable = this.evaluateExpression(statement.iterable);
    let lastValue: RuntimeValue = { type: 'null', value: null };

    if (iterable.type !== 'array') {
      throw createTypeError('For loop iterable must be an array');
    }

    for (const [index, element] of iterable.elements.entries()) {
      lastValue = this.withScope(() => {
        this.scope.define(statement.element.name, element, true);

        if (statement.index !== undefined) {
          this.scope.define(statement.index.name, { numberType: 'int', type: 'number', value: index }, false);
        }

        let bodyValue: RuntimeValue = { type: 'null', value: null };

        for (const bodyStatement of statement.body) {
          bodyValue = this.executeStatement(bodyStatement);
        }

        return bodyValue;
      });
    }

    return lastValue;
  }

  private executeFunctionDeclaration(statement: FunctionDeclaration): RuntimeValue {
    return this.scope.define(
      statement.identifier.name,
      {
        body: statement.body,
        closure: this.scope,
        name: statement.identifier.name,
        returnType: statement.returnType,
        type: 'function',
      },
      false
    );
  }

  private executeImportDeclaration(statement: ImportDeclaration): RuntimeValue {
    if (this.resolveImport === undefined) {
      throw createTypeError('Imports are not supported in this interpreter mode');
    }

    const moduleExports = this.resolveImport(statement.source.value);

    for (const identifier of statement.identifiers) {
      const value = moduleExports.get(identifier.name);

      if (value === undefined) {
        throw createReferenceError(`Module '${statement.source.value}' does not export '${identifier.name}'`);
      }

      this.scope.define(identifier.name, value, false);
    }

    return { type: 'null', value: null };
  }

  private executeReturnStatement(statement: ReturnStatement): RuntimeValue {
    const value =
      statement.value === undefined
        ? ({ type: 'null', value: null } satisfies NullValue)
        : this.evaluateExpression(statement.value);

    throw new ReturnSignal(value);
  }

  private executeStatement(statement: Statement): RuntimeValue {
    switch (statement.kind) {
      case 'AssignmentStatement':
        return this.executeAssignmentStatement(statement);
      case 'DoWhileStatement':
        return this.executeDoWhileStatement(statement);
      case 'ExportDeclaration':
        return this.executeExportDeclaration(statement);
      case 'ExpressionStatement':
        return this.evaluateExpression(statement.expression);
      case 'ForStatement':
        return this.executeForStatement(statement);
      case 'FunctionDeclaration':
        return this.executeFunctionDeclaration(statement);
      case 'ImportDeclaration':
        return this.executeImportDeclaration(statement);
      case 'ReturnStatement':
        return this.executeReturnStatement(statement);
      case 'VariableDeclaration':
        return this.executeVariableDeclaration(statement);
      case 'WhileStatement':
        return this.executeWhileStatement(statement);
    }
  }

  private executeVariableDeclaration(statement: VariableDeclaration): RuntimeValue {
    const value = this.evaluateExpression(statement.initializer);

    return this.scope.define(
      statement.identifier.name,
      value,
      statement.declarationType === 'var',
      statement.typeAnnotation
    );
  }

  private executeWhileStatement(statement: WhileStatement): RuntimeValue {
    let lastValue: RuntimeValue = { type: 'null', value: null };

    while (true) {
      const condition = this.evaluateExpression(statement.condition);

      if (condition.type !== 'boolean') {
        throw createTypeError('While condition must be a boolean');
      }

      if (!condition.value) {
        break;
      }

      lastValue = this.withScope(() => {
        let bodyValue: RuntimeValue = { type: 'null', value: null };

        for (const bodyStatement of statement.body) {
          bodyValue = this.executeStatement(bodyStatement);
        }

        return bodyValue;
      });
    }

    return lastValue;
  }

  private runtimeValueToString(value: RuntimeValue): string {
    switch (value.type) {
      case 'array':
        return `[${value.elements.map((element) => this.runtimeValueToString(element)).join(', ')}]`;
      case 'boolean':
        return String(value.value);
      case 'native-function':
        return `<native function ${value.name}>`;
      case 'function':
        return `<function ${value.name}>`;
      case 'null':
        return 'null';
      case 'number':
        return String(value.value);
      case 'string':
        return value.value;
    }
  }

  private withScope(callback: () => RuntimeValue): RuntimeValue {
    const previousScope = this.scope;
    return this.withScopeFrom(previousScope, callback);
  }

  private withScopeFrom(parent: Scope, callback: () => RuntimeValue): RuntimeValue {
    const previousScope = this.scope;
    this.scope = new Scope(parent);

    try {
      return callback();
    } finally {
      this.scope = previousScope;
    }
  }
}
