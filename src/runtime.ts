import type {
  ArrayLiteral,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  Expression,
  ForStatement,
  Identifier,
  NumberLiteral,
  NumberLiteralType,
  Program,
  Statement,
  StringLiteral,
  UnaryExpression,
  VariableDeclaration,
} from './ast';
import { createReferenceError, createTypeError } from './errors';

type Binding = {
  mutable: boolean;
  value: RuntimeValue;
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

export type RuntimeValue = ArrayValue | NativeFunctionValue | NullValue | NumberValue | StringValue;

export type StringValue = {
  type: 'string';
  value: string;
};

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

    binding.value = value;
    return value;
  }

  public define(name: string, value: RuntimeValue, mutable: boolean): RuntimeValue {
    if (this.bindings.has(name)) {
      throw createTypeError(`Binding '${name}' is already defined`);
    }

    this.bindings.set(name, { mutable, value });
    return value;
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

export class Interpreter {
  private scope = new Scope();

  public constructor() {
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

  private evaluateArrayLiteral(expression: ArrayLiteral): RuntimeValue {
    return {
      elements: expression.elements.map((element) => this.evaluateExpression(element)),
      type: 'array',
    };
  }

  private evaluateBinaryExpression(expression: BinaryExpression): RuntimeValue {
    const left = this.evaluateExpression(expression.left);
    const right = this.evaluateExpression(expression.right);

    if (left.type !== 'number' || right.type !== 'number') {
      throw createTypeError(`Operator '${expression.operator}' expects number operands`);
    }

    switch (expression.operator) {
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
    }
  }

  private evaluateCallExpression(expression: CallExpression): RuntimeValue {
    const callee = this.scope.lookup(expression.callee.name);

    if (callee.type !== 'native-function') {
      throw createTypeError(`Binding '${expression.callee.name}' is not callable`);
    }

    const args = expression.arguments.map((arg) => this.evaluateExpression(arg));
    return callee.call(args);
  }

  private evaluateExpression(expression: Expression): RuntimeValue {
    switch (expression.kind) {
      case 'ArrayLiteral':
        return this.evaluateArrayLiteral(expression);
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(expression);
      case 'CallExpression':
        return this.evaluateCallExpression(expression);
      case 'Identifier':
        return this.evaluateIdentifier(expression);
      case 'NumberLiteral':
        return this.evaluateNumberLiteral(expression);
      case 'StringLiteral':
        return this.evaluateStringLiteral(expression);
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(expression);
    }
  }

  private evaluateIdentifier(expression: Identifier): RuntimeValue {
    return this.scope.lookup(expression.name);
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
    const value = this.evaluateExpression(statement.value);
    return this.scope.assign(statement.identifier.name, value);
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

  private executeStatement(statement: Statement): RuntimeValue {
    switch (statement.kind) {
      case 'AssignmentStatement':
        return this.executeAssignmentStatement(statement);
      case 'ExpressionStatement':
        return this.evaluateExpression(statement.expression);
      case 'ForStatement':
        return this.executeForStatement(statement);
      case 'VariableDeclaration':
        return this.executeVariableDeclaration(statement);
    }
  }

  private executeVariableDeclaration(statement: VariableDeclaration): RuntimeValue {
    const value = this.evaluateExpression(statement.initializer);

    return this.scope.define(statement.identifier.name, value, statement.declarationType === 'var');
  }

  private runtimeValueToString(value: RuntimeValue): string {
    switch (value.type) {
      case 'array':
        return `[${value.elements.map((element) => this.runtimeValueToString(element)).join(', ')}]`;
      case 'native-function':
        return `<native function ${value.name}>`;
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
    this.scope = new Scope(previousScope);

    try {
      return callback();
    } finally {
      this.scope = previousScope;
    }
  }
}
