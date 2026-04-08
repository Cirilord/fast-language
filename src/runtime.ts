import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  ClassConstructor,
  ClassDeclaration,
  ClassMethod,
  ClassProperty,
  ConditionalExpression,
  DoWhileStatement,
  ExportDeclaration,
  Expression,
  ForStatement,
  FunctionDeclaration,
  FunctionReturnType,
  Identifier,
  ImportDeclaration,
  MemberExpression,
  NewExpression,
  NumberLiteral,
  NumberLiteralType,
  Parameter,
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

export type ClassValue = {
  abstract: boolean;
  baseClass?: ClassValue;
  constructorMember?: ClassConstructor;
  instanceMethods: Map<string, ClassMethod>;
  instanceProperties: ClassProperty[];
  name: string;
  staticMethods: Map<string, ClassMethod>;
  staticProperties: Map<string, Binding>;
  type: 'class';
  virtual: boolean;
};

export type InstanceValue = {
  classValue: ClassValue;
  fields: Map<string, Binding>;
  type: 'instance';
};

export type BoundMethodValue = {
  method: ClassMethod;
  receiver: ClassValue | InstanceValue;
  superClass: ClassValue | undefined;
  type: 'bound-method';
};

export type SuperValue = {
  receiver: InstanceValue;
  superClass: ClassValue;
  type: 'super';
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
  parameters: Parameter[];
  returnType: FunctionReturnType;
  type: 'function';
};

export type RuntimeValue =
  | ArrayValue
  | BoundMethodValue
  | BooleanValue
  | ClassValue
  | InstanceValue
  | NativeFunctionValue
  | NullValue
  | NumberValue
  | StringValue
  | SuperValue
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
    case 'bound-method':
      return left === right;
    case 'boolean':
      return right.type === 'boolean' && left.value === right.value;
    case 'class':
      return left === right;
    case 'instance':
      return left === right;
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
    case 'super':
      return left === right;
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

function findInstanceMethod(
  classValue: ClassValue,
  name: string
): { method: ClassMethod; owner: ClassValue } | undefined {
  const method = classValue.instanceMethods.get(name);

  if (method !== undefined) {
    return { method, owner: classValue };
  }

  if (classValue.baseClass !== undefined) {
    return findInstanceMethod(classValue.baseClass, name);
  }

  return undefined;
}

function findStaticMethod(
  classValue: ClassValue,
  name: string
): { method: ClassMethod; owner: ClassValue } | undefined {
  const method = classValue.staticMethods.get(name);

  if (method !== undefined) {
    return { method, owner: classValue };
  }

  if (classValue.baseClass !== undefined) {
    return findStaticMethod(classValue.baseClass, name);
  }

  return undefined;
}

function getClassChain(classValue: ClassValue): ClassValue[] {
  const baseChain = classValue.baseClass === undefined ? [] : getClassChain(classValue.baseClass);
  return [...baseChain, classValue];
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

  private assertArgumentCount(name: string, expected: number, actual: number): void {
    if (actual !== expected) {
      throw createTypeError(`'${name}' expects ${expected} arguments, got ${actual}`);
    }
  }

  private assignMember(expression: MemberExpression, value: RuntimeValue): RuntimeValue {
    const object = this.evaluateExpression(expression.object);

    if (object.type === 'instance') {
      const binding = object.fields.get(expression.property.name);

      if (binding === undefined) {
        throw createReferenceError(`Property '${expression.property.name}' is not defined`);
      }

      if (!binding.mutable) {
        throw createTypeError(`Cannot reassign immutable property '${expression.property.name}'`);
      }

      binding.value = coerceValueToBindingType(value, binding.typeAnnotation);
      return binding.value;
    }

    if (object.type === 'class') {
      const binding = object.staticProperties.get(expression.property.name);

      if (binding === undefined) {
        throw createReferenceError(`Static property '${expression.property.name}' is not defined`);
      }

      if (!binding.mutable) {
        throw createTypeError(`Cannot reassign immutable static property '${expression.property.name}'`);
      }

      binding.value = coerceValueToBindingType(value, binding.typeAnnotation);
      return binding.value;
    }

    throw createTypeError(`Cannot assign property '${expression.property.name}' on '${object.type}'`);
  }

  private bindParameters(parameters: Parameter[], args: RuntimeValue[]): void {
    for (const [index, parameter] of parameters.entries()) {
      const arg = args[index];

      if (arg === undefined) {
        throw createTypeError(`Missing argument for parameter '${parameter.identifier.name}'`);
      }

      this.scope.define(parameter.identifier.name, arg, false, parameter.typeAnnotation);
    }
  }

  private callBoundMethod(callee: BoundMethodValue, args: RuntimeValue[]): RuntimeValue {
    this.assertArgumentCount(callee.method.name.name, callee.method.parameters.length, args.length);
    const parentScope = this.scope;

    try {
      this.scope = new Scope(parentScope);
      this.scope.define('this', callee.receiver, false);
      this.bindParameters(callee.method.parameters, args);

      if (callee.receiver.type === 'instance' && callee.superClass !== undefined) {
        this.scope.define(
          'super',
          {
            receiver: callee.receiver,
            superClass: callee.superClass,
            type: 'super',
          },
          false
        );
      }

      let lastValue: RuntimeValue = { type: 'null', value: null };

      for (const bodyStatement of callee.method.body ?? []) {
        lastValue = this.executeStatement(bodyStatement);
      }

      return lastValue;
    } catch (error) {
      if (error instanceof ReturnSignal) {
        return error.value;
      }

      throw error;
    } finally {
      this.scope = parentScope;
    }
  }

  private callConstructor(classValue: ClassValue, instance: InstanceValue, args: RuntimeValue[]): RuntimeValue {
    if (classValue.constructorMember === undefined) {
      if (classValue.baseClass !== undefined) {
        this.callConstructor(classValue.baseClass, instance, []);
      }

      return { type: 'null', value: null };
    }

    this.assertArgumentCount(classValue.name, classValue.constructorMember.parameters.length, args.length);
    const previousScope = this.scope;

    try {
      this.scope = new Scope(previousScope);
      this.scope.define('this', instance, false);
      this.bindParameters(classValue.constructorMember.parameters, args);

      if (classValue.baseClass !== undefined) {
        this.scope.define(
          'super',
          {
            receiver: instance,
            superClass: classValue.baseClass,
            type: 'super',
          },
          false
        );
      }

      let lastValue: RuntimeValue = { type: 'null', value: null };

      for (const bodyStatement of classValue.constructorMember.body) {
        lastValue = this.executeStatement(bodyStatement);
      }

      return lastValue;
    } catch (error) {
      if (error instanceof ReturnSignal) {
        return error.value;
      }

      throw error;
    } finally {
      this.scope = previousScope;
    }
  }

  private callUserFunction(callee: UserFunctionValue, args: RuntimeValue[]): RuntimeValue {
    this.assertArgumentCount(callee.name, callee.parameters.length, args.length);

    try {
      return this.withScopeFrom(callee.closure, () => {
        this.bindParameters(callee.parameters, args);

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

  private createClassValue(statement: ClassDeclaration): ClassValue {
    const staticMethods = new Map<string, ClassMethod>();
    const staticProperties = new Map<string, Binding>();
    const instanceMethods = new Map<string, ClassMethod>();
    const instanceProperties: ClassProperty[] = [];
    let constructorMember: ClassConstructor | undefined;
    const baseClass = this.resolveBaseClass(statement);

    for (const member of statement.members) {
      if (member.kind === 'ClassConstructor') {
        constructorMember = member;
        continue;
      }

      if (member.kind === 'ClassMethod') {
        if (member.body === undefined) {
          continue;
        }

        if (member.static) {
          staticMethods.set(member.name.name, member);
        } else {
          instanceMethods.set(member.name.name, member);
        }
        continue;
      }

      if (member.static) {
        staticProperties.set(member.name.name, {
          mutable: member.declarationType === 'var',
          typeAnnotation: member.typeAnnotation,
          value: coerceValueToBindingType(this.evaluateExpression(member.initializer), member.typeAnnotation),
        });
      } else {
        instanceProperties.push(member);
      }
    }

    const classValue: ClassValue = {
      abstract: statement.abstract,
      instanceMethods,
      instanceProperties,
      name: statement.identifier.name,
      staticMethods,
      staticProperties,
      type: 'class',
      virtual: statement.virtual,
    };

    if (baseClass !== undefined) {
      classValue.baseClass = baseClass;
    }

    if (constructorMember !== undefined) {
      classValue.constructorMember = constructorMember;
    }

    return classValue;
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

    const current =
      statement.target.kind === 'Identifier'
        ? this.scope.lookup(statement.target.name)
        : this.evaluateExpression(statement.target);

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
    const callee = this.evaluateExpression(expression.callee);
    const calleeName = expression.callee.kind === 'Identifier' ? expression.callee.name : '<expression>';

    if (callee.type === 'native-function') {
      const args = expression.arguments.map((arg) => this.evaluateExpression(arg));
      return callee.call(args);
    }

    if (callee.type === 'function') {
      const args = expression.arguments.map((arg) => this.evaluateExpression(arg));
      return this.callUserFunction(callee, args);
    }

    if (callee.type === 'bound-method') {
      const args = expression.arguments.map((arg) => this.evaluateExpression(arg));
      return this.callBoundMethod(callee, args);
    }

    if (callee.type === 'super') {
      const args = expression.arguments.map((arg) => this.evaluateExpression(arg));
      return this.callConstructor(callee.superClass, callee.receiver, args);
    }

    throw createTypeError(`Binding '${calleeName}' is not callable`);
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
      case 'MemberExpression':
        return this.evaluateMemberExpression(expression);
      case 'NewExpression':
        return this.evaluateNewExpression(expression);
      case 'NumberLiteral':
        return this.evaluateNumberLiteral(expression);
      case 'NullLiteral':
        return this.evaluateNullLiteral();
      case 'StringLiteral':
        return this.evaluateStringLiteral(expression);
      case 'SuperExpression':
        return this.scope.lookup('super');
      case 'ThisExpression':
        return this.scope.lookup('this');
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(expression);
    }
  }

  private evaluateIdentifier(expression: Identifier): RuntimeValue {
    return this.scope.lookup(expression.name);
  }

  private evaluateMemberExpression(expression: MemberExpression): RuntimeValue {
    const object = this.evaluateExpression(expression.object);
    const propertyName = expression.property.name;

    if (object.type === 'instance') {
      const field = object.fields.get(propertyName);

      if (field !== undefined) {
        return field.value;
      }

      const method = findInstanceMethod(object.classValue, propertyName);

      if (method !== undefined) {
        return {
          method: method.method,
          receiver: object,
          superClass: method.owner.baseClass,
          type: 'bound-method',
        };
      }

      throw createReferenceError(`Property '${propertyName}' is not defined`);
    }

    if (object.type === 'class') {
      const property = object.staticProperties.get(propertyName);

      if (property !== undefined) {
        return property.value;
      }

      const method = findStaticMethod(object, propertyName);

      if (method !== undefined) {
        return {
          method: method.method,
          receiver: object,
          superClass: method.owner.baseClass,
          type: 'bound-method',
        };
      }

      throw createReferenceError(`Static property '${propertyName}' is not defined`);
    }

    if (object.type === 'super') {
      const method = findInstanceMethod(object.superClass, propertyName);

      if (method !== undefined) {
        return {
          method: method.method,
          receiver: object.receiver,
          superClass: method.owner.baseClass,
          type: 'bound-method',
        };
      }

      const property = object.receiver.fields.get(propertyName);

      if (property !== undefined) {
        return property.value;
      }

      throw createReferenceError(`Super property '${propertyName}' is not defined`);
    }

    throw createTypeError(`Cannot read property '${propertyName}' from '${object.type}'`);
  }

  private evaluateNewExpression(expression: NewExpression): RuntimeValue {
    const classValue = this.scope.lookup(expression.callee.name);

    if (classValue.type !== 'class') {
      throw createTypeError(`Binding '${expression.callee.name}' is not a class`);
    }

    if (classValue.abstract || classValue.virtual) {
      throw createTypeError(`Cannot instantiate abstract class '${classValue.name}'`);
    }

    const args = expression.arguments.map((arg) => this.evaluateExpression(arg));

    const instance: InstanceValue = {
      classValue,
      fields: new Map(),
      type: 'instance',
    };

    for (const item of getClassChain(classValue)) {
      for (const property of item.instanceProperties) {
        instance.fields.set(property.name.name, {
          mutable: property.declarationType === 'var',
          typeAnnotation: property.typeAnnotation,
          value: coerceValueToBindingType(this.evaluateExpression(property.initializer), property.typeAnnotation),
        });
      }
    }

    this.callConstructor(classValue, instance, args);
    return instance;
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

    if (statement.target.kind === 'MemberExpression') {
      return this.assignMember(statement.target, value);
    }

    return this.scope.assign(statement.target.name, value);
  }

  private executeClassDeclaration(statement: ClassDeclaration): RuntimeValue {
    const classValue = this.createClassValue(statement);
    return this.scope.define(statement.identifier.name, classValue, false);
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
        parameters: statement.parameters,
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
      case 'ClassDeclaration':
        return this.executeClassDeclaration(statement);
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

  private resolveBaseClass(statement: ClassDeclaration): ClassValue | undefined {
    if (statement.baseClass === undefined) {
      return undefined;
    }

    const baseClass = this.scope.lookup(statement.baseClass.name);

    if (baseClass.type !== 'class') {
      throw createTypeError(`Binding '${statement.baseClass.name}' is not a class`);
    }

    return baseClass;
  }

  private runtimeValueToString(value: RuntimeValue): string {
    switch (value.type) {
      case 'array':
        return `[${value.elements.map((element) => this.runtimeValueToString(element)).join(', ')}]`;
      case 'bound-method':
        return '<bound method>';
      case 'boolean':
        return String(value.value);
      case 'class':
        return `<class ${value.name}>`;
      case 'instance':
        return `<${value.classValue.name} instance>`;
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
      case 'super':
        return '<super>';
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
