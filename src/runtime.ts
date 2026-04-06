import type {
  ArrayLiteral,
  AssignmentStatement,
  CallExpression,
  Expression,
  Identifier,
  NumberLiteral,
  Program,
  Statement,
  StringLiteral,
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
  type: 'number';
  value: number;
};

export type RuntimeValue = ArrayValue | NativeFunctionValue | NullValue | NumberValue | StringValue;

export type StringValue = {
  type: 'string';
  value: string;
};

class Scope {
  private readonly bindings = new Map<string, Binding>();

  public assign(name: string, value: RuntimeValue): RuntimeValue {
    const binding = this.bindings.get(name);

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
    const binding = this.bindings.get(name);

    if (!binding) {
      throw createReferenceError(`Binding '${name}' is not defined`);
    }

    return binding.value;
  }
}

export class Interpreter {
  private readonly scope = new Scope();

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
      case 'CallExpression':
        return this.evaluateCallExpression(expression);
      case 'Identifier':
        return this.evaluateIdentifier(expression);
      case 'NumberLiteral':
        return this.evaluateNumberLiteral(expression);
      case 'StringLiteral':
        return this.evaluateStringLiteral(expression);
    }
  }

  private evaluateIdentifier(expression: Identifier): RuntimeValue {
    return this.scope.lookup(expression.name);
  }

  private evaluateNumberLiteral(expression: NumberLiteral): RuntimeValue {
    return {
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

  private executeAssignmentStatement(statement: AssignmentStatement): RuntimeValue {
    const value = this.evaluateExpression(statement.value);
    return this.scope.assign(statement.identifier.name, value);
  }

  private executeStatement(statement: Statement): RuntimeValue {
    switch (statement.kind) {
      case 'AssignmentStatement':
        return this.executeAssignmentStatement(statement);
      case 'ExpressionStatement':
        return this.evaluateExpression(statement.expression);
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
}
