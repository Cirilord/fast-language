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
  ExceptClause,
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
  ThrowStatement,
  TypeParameter,
  TypeName,
  TryStatement,
  TupleLiteral,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { getBuiltinClassDeclarations } from './builtins';
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
  declaration: ClassDeclaration;
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

export type TupleValue = {
  elements: RuntimeValue[];
  type: 'tuple';
};

export type UserFunctionValue = {
  body: Statement[];
  closure: Scope;
  name: string;
  parameters: Parameter[];
  returnType: FunctionReturnType;
  type: 'function';
  typeParameters: TypeParameter[];
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
  | TupleValue
  | UserFunctionValue;

export type RuntimeModuleExports = ReadonlyMap<string, RuntimeValue>;

export type RuntimeImportResolver = (source: string) => RuntimeModuleExports;

class ReturnSignal {
  public constructor(public readonly value: RuntimeValue) {}
}

class ThrowSignal {
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
    case 'tuple':
      return (
        right.type === 'tuple' &&
        left.elements.length === right.elements.length &&
        left.elements.every((element, index) => {
          const rightElement = right.elements[index];
          return rightElement !== undefined && areRuntimeValuesEqual(element, rightElement);
        })
      );
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

function getMinimumArity(parameters: Parameter[]): number {
  return parameters.filter((parameter) => parameter.defaultValue === undefined && !parameter.rest).length;
}

function getTypeBaseName(typeName: TypeName): string {
  const genericStart = typeName.indexOf('<');

  return genericStart === -1 ? typeName : typeName.slice(0, genericStart);
}

function isSameClassOrSubclass(candidate: ClassValue, base: ClassValue): boolean {
  if (candidate.name === base.name) {
    return true;
  }

  if (candidate.baseClass === undefined) {
    return false;
  }

  return isSameClassOrSubclass(candidate.baseClass, base);
}

function hasRestParameter(parameters: Parameter[]): boolean {
  return parameters.some((parameter) => parameter.rest);
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
    this.scope.define(
      'typeOf',
      {
        call: ([value]): RuntimeValue => ({
          type: 'string',
          value: this.getRuntimeTypeName(value ?? { type: 'null', value: null }),
        }),
        name: 'typeOf',
        type: 'native-function',
      },
      false
    );
    this.scope.define(
      'isType',
      {
        call: ([value, expectedType]): RuntimeValue => ({
          type: 'boolean',
          value:
            expectedType?.type === 'string' &&
            this.getRuntimeTypeName(value ?? { type: 'null', value: null }) === expectedType.value,
        }),
        name: 'isType',
        type: 'native-function',
      },
      false
    );
    this.scope.define(
      'isInstance',
      {
        call: ([value, classValue]): RuntimeValue => ({
          type: 'boolean',
          value:
            value?.type === 'instance' &&
            classValue?.type === 'class' &&
            isSameClassOrSubclass(value.classValue, classValue),
        }),
        name: 'isInstance',
        type: 'native-function',
      },
      false
    );

    for (const builtinClass of getBuiltinClassDeclarations()) {
      this.executeClassDeclaration(builtinClass);
    }
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

  private assertArgumentCount(name: string, minimum: number, maximum: number, actual: number): void {
    if (actual < minimum) {
      throw createTypeError(`'${name}' expects at least ${minimum} arguments, got ${actual}`);
    }

    if (actual > maximum) {
      throw createTypeError(`'${name}' expects at most ${maximum} arguments, got ${actual}`);
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
      if (parameter.rest) {
        this.scope.define(
          parameter.identifier.name,
          {
            elements: args.slice(index),
            type: 'array',
          },
          false,
          parameter.typeAnnotation
        );
        return;
      }

      const arg =
        args[index] ??
        (parameter.defaultValue === undefined ? undefined : this.evaluateExpression(parameter.defaultValue));

      if (arg === undefined) {
        throw createTypeError(`Missing argument for parameter '${parameter.identifier.name}'`);
      }

      this.scope.define(parameter.identifier.name, arg, false, parameter.typeAnnotation);
    }
  }

  private callBoundMethod(callee: BoundMethodValue, args: RuntimeValue[]): RuntimeValue {
    this.assertArgumentCount(
      callee.method.name.name,
      getMinimumArity(callee.method.parameters),
      hasRestParameter(callee.method.parameters) ? Number.POSITIVE_INFINITY : callee.method.parameters.length,
      args.length
    );
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
      this.assertArgumentCount(classValue.name, 0, 0, args.length);

      if (classValue.baseClass !== undefined) {
        this.callConstructor(classValue.baseClass, instance, []);
      }

      return { type: 'null', value: null };
    }

    this.assertArgumentCount(
      classValue.name,
      getMinimumArity(classValue.constructorMember.parameters),
      hasRestParameter(classValue.constructorMember.parameters)
        ? Number.POSITIVE_INFINITY
        : classValue.constructorMember.parameters.length,
      args.length
    );
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
    this.assertArgumentCount(
      callee.name,
      getMinimumArity(callee.parameters),
      hasRestParameter(callee.parameters) ? Number.POSITIVE_INFINITY : callee.parameters.length,
      args.length
    );

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
    const staticProperties = new Map<string, Binding>([
      [
        'name',
        {
          mutable: false,
          typeAnnotation: 'string',
          value: {
            type: 'string',
            value: statement.identifier.name,
          },
        },
      ],
    ]);
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
      declaration: statement,
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
      case 'TupleLiteral':
        return this.evaluateTupleLiteral(expression);
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

    if (object.type === 'function') {
      if (propertyName === 'name') {
        return {
          type: 'string',
          value: object.name,
        };
      }

      if (propertyName === 'toString') {
        return {
          call: (): RuntimeValue => ({
            type: 'string',
            value: this.renderUserFunctionValue(object),
          }),
          name: `${object.name}.toString`,
          type: 'native-function',
        };
      }

      throw createReferenceError(`Property '${propertyName}' is not defined`);
    }

    if (object.type === 'native-function') {
      if (propertyName === 'name') {
        return {
          type: 'string',
          value: object.name,
        };
      }

      if (propertyName === 'toString') {
        return {
          call: (): RuntimeValue => ({
            type: 'string',
            value: `<native function ${object.name}>`,
          }),
          name: `${object.name}.toString`,
          type: 'native-function',
        };
      }

      throw createReferenceError(`Property '${propertyName}' is not defined`);
    }

    if (object.type === 'instance') {
      if (propertyName === 'constructor') {
        return object.classValue;
      }

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

      if (propertyName === 'toString') {
        return {
          call: (): RuntimeValue => ({
            type: 'string',
            value: this.renderInstanceValue(object),
          }),
          name: `${object.classValue.name}.toString`,
          type: 'native-function',
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

      if (propertyName === 'toString') {
        return {
          call: (): RuntimeValue => ({
            type: 'string',
            value: this.renderClassValue(object),
          }),
          name: `${object.name}.toString`,
          type: 'native-function',
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

  private evaluateTupleLiteral(expression: TupleLiteral): RuntimeValue {
    return {
      elements: expression.elements.map((element) => this.evaluateExpression(element)),
      type: 'tuple',
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
    if (statement.body === undefined) {
      return { type: 'null', value: null };
    }

    return this.scope.define(
      statement.identifier.name,
      {
        body: statement.body,
        closure: this.scope,
        name: statement.identifier.name,
        parameters: statement.parameters,
        returnType: statement.returnType,
        typeParameters: statement.typeParameters,
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
      case 'ThrowStatement':
        return this.executeThrowStatement(statement);
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
      case 'TryStatement':
        return this.executeTryStatement(statement);
      case 'VariableDeclaration':
        return this.executeVariableDeclaration(statement);
      case 'WhileStatement':
        return this.executeWhileStatement(statement);
    }
  }

  private executeThrowStatement(statement: ThrowStatement): RuntimeValue {
    const value = this.evaluateExpression(statement.value);

    if (value.type !== 'instance' || !isSameClassOrSubclass(value.classValue, this.getErrorClassValue())) {
      throw createTypeError(`Thrown value must extend 'Error', got '${value.type}'`);
    }

    throw new ThrowSignal(value);
  }

  private executeTryStatement(statement: TryStatement): RuntimeValue {
    let completionSignal: ReturnSignal | ThrowSignal | undefined;
    let lastValue: RuntimeValue = { type: 'null', value: null };

    try {
      lastValue = this.withScope(() => {
        let bodyValue: RuntimeValue = { type: 'null', value: null };

        for (const bodyStatement of statement.body) {
          bodyValue = this.executeStatement(bodyStatement);
        }

        return bodyValue;
      });
    } catch (error) {
      if (!(error instanceof ThrowSignal)) {
        completionSignal = error instanceof ReturnSignal ? error : undefined;

        if (completionSignal === undefined) {
          throw error;
        }
      } else {
        const matchedClause = this.findMatchingExceptClause(statement.exceptClauses, error.value);

        if (matchedClause === undefined) {
          completionSignal = error;
        } else {
          try {
            lastValue = this.withScope(() => {
              this.scope.define(matchedClause.identifier.name, error.value, false, matchedClause.errorType);

              let bodyValue: RuntimeValue = { type: 'null', value: null };

              for (const bodyStatement of matchedClause.body) {
                bodyValue = this.executeStatement(bodyStatement);
              }

              return bodyValue;
            });
          } catch (exceptError) {
            if (exceptError instanceof ReturnSignal || exceptError instanceof ThrowSignal) {
              completionSignal = exceptError;
            } else {
              throw exceptError;
            }
          }
        }
      }
    }

    const finallyBody = statement.finallyBody;

    if (finallyBody !== undefined) {
      try {
        lastValue = this.withScope(() => {
          let bodyValue: RuntimeValue = { type: 'null', value: null };

          for (const bodyStatement of finallyBody) {
            bodyValue = this.executeStatement(bodyStatement);
          }

          return bodyValue;
        });
      } catch (finallyError) {
        if (finallyError instanceof ReturnSignal || finallyError instanceof ThrowSignal) {
          completionSignal = finallyError;
        } else {
          throw finallyError;
        }
      }
    }

    if (completionSignal !== undefined) {
      throw completionSignal;
    }

    return lastValue;
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

  private findMatchingExceptClause(exceptClauses: ExceptClause[], thrownValue: RuntimeValue): ExceptClause | undefined {
    if (thrownValue.type !== 'instance') {
      return undefined;
    }

    for (const exceptClause of exceptClauses) {
      const errorClass = this.lookupClassValue(exceptClause.errorType);

      if (isSameClassOrSubclass(thrownValue.classValue, errorClass)) {
        return exceptClause;
      }
    }

    return undefined;
  }

  private getErrorClassValue(): ClassValue {
    return this.lookupClassValue('Error');
  }

  private getRuntimeTypeName(value: RuntimeValue): string {
    switch (value.type) {
      case 'array':
        return 'array';
      case 'boolean':
        return 'boolean';
      case 'bound-method':
        return 'function';
      case 'class':
        return 'class';
      case 'function':
        return 'function';
      case 'instance':
        return 'object';
      case 'native-function':
        return 'function';
      case 'null':
        return 'null';
      case 'number':
        return value.numberType;
      case 'string':
        return 'string';
      case 'super':
        return 'object';
      case 'tuple':
        return 'tuple';
    }
  }

  private lookupClassValue(typeName: TypeName): ClassValue {
    const classValue = this.scope.lookup(getTypeBaseName(typeName));

    if (classValue.type !== 'class') {
      throw createTypeError(`Binding '${typeName}' is not a class`);
    }

    return classValue;
  }

  private renderClassValue(classValue: ClassValue): string {
    const declarationKind = classValue.virtual
      ? 'abstract virtual class'
      : classValue.abstract
        ? 'abstract class'
        : 'class';

    return `${declarationKind} ${classValue.name} { ... }`;
  }

  private renderInstanceValue(instance: InstanceValue): string {
    const explicitToString = findInstanceMethod(instance.classValue, 'toString');

    if (explicitToString !== undefined) {
      const result = this.callBoundMethod(
        {
          method: explicitToString.method,
          receiver: instance,
          superClass: explicitToString.owner.baseClass,
          type: 'bound-method',
        },
        []
      );

      if (result.type !== 'string') {
        throw createTypeError(`Method '${instance.classValue.name}.toString' must return a string`);
      }

      return result.value;
    }

    const fields = [...instance.fields.entries()].map(
      ([name, binding]) => `${name}: ${this.runtimeValueToString(binding.value)}`
    );

    return `${instance.classValue.name} { ${fields.join(', ')} }`;
  }

  private renderUserFunctionValue(functionValue: UserFunctionValue): string {
    const typeParameters =
      functionValue.typeParameters.length === 0
        ? ''
        : `<${functionValue.typeParameters
            .map((typeParameter) =>
              typeParameter.defaultType === undefined
                ? typeParameter.identifier.name
                : `${typeParameter.identifier.name} = ${typeParameter.defaultType}`
            )
            .join(', ')}>`;
    const parameters = functionValue.parameters
      .map((parameter) => {
        const rest = parameter.rest ? '...' : '';
        const defaultValue = parameter.defaultValue === undefined ? '' : ' = ...';
        return `${rest}${parameter.identifier.name}: ${parameter.typeAnnotation}${defaultValue}`;
      })
      .join(', ');

    return `function ${functionValue.name}${typeParameters}(${parameters}): ${functionValue.returnType} { ... }`;
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
        return this.renderClassValue(value);
      case 'instance':
        return this.renderInstanceValue(value);
      case 'native-function':
        return `<native function ${value.name}>`;
      case 'function':
        return this.renderUserFunctionValue(value);
      case 'null':
        return 'null';
      case 'number':
        return String(value.value);
      case 'string':
        return value.value;
      case 'super':
        return '<super>';
      case 'tuple':
        return `(${value.elements.map((element) => this.runtimeValueToString(element)).join(', ')})`;
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
