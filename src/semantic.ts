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
  ExpressionStatement,
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
  TypeName,
  TupleLiteral,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { createReferenceError, createSyntaxError, createTypeError } from './errors';

export type SemanticType = 'function' | 'null' | 'void' | TypeName | 'unknown';

export type SemanticSymbol = {
  arity?: number;
  callable: boolean;
  classDeclaration?: ClassDeclaration;
  minArity?: number;
  mutable: boolean;
  name: string;
  parameterTypes?: TypeName[];
  returnType?: SemanticType;
  type: SemanticType;
};

export type SemanticModuleExports = ReadonlyMap<string, SemanticSymbol>;

export type SemanticImportResolver = (source: string) => SemanticModuleExports;

type ResolvedClassMember = {
  member: ClassMethod | ClassProperty;
  owner: ClassDeclaration;
};

function isNumericType(type: SemanticType): type is NumberLiteralType {
  return type === 'double' || type === 'float' || type === 'int';
}

function isArrayType(type: SemanticType): boolean {
  return typeof type === 'string' && type.endsWith('[]');
}

function isTupleType(type: SemanticType): boolean {
  return typeof type === 'string' && type.startsWith('(') && type.endsWith(')');
}

function splitTupleTypes(type: string): string[] {
  const content = type.slice(1, -1);

  if (content.trim() === '') {
    return [];
  }

  const parts: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let parenDepth = 0;

  for (const char of content) {
    if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
    } else if (char === ']') {
      bracketDepth -= 1;
    } else if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
    }

    current += char;
  }

  parts.push(current.trim());
  return parts;
}

function getArrayElementType(type: string): string {
  return type.slice(0, -2);
}

function getWiderType(leftType: SemanticType, rightType: SemanticType): SemanticType | undefined {
  if (leftType === rightType) {
    return leftType;
  }

  if (leftType === 'null') {
    return rightType;
  }

  if (rightType === 'null') {
    return leftType;
  }

  if (isNumericType(leftType) && isNumericType(rightType)) {
    return promoteNumericType(leftType, rightType);
  }

  if (isArrayType(leftType) && isArrayType(rightType)) {
    const elementType = getWiderType(getArrayElementType(leftType), getArrayElementType(rightType));
    return elementType === undefined ? undefined : `${elementType}[]`;
  }

  return undefined;
}

function areTypesCompatible(expectedType: SemanticType, actualType: SemanticType): boolean {
  if (actualType === 'null' || actualType === 'unknown' || expectedType === actualType) {
    return true;
  }

  if (expectedType === 'array') {
    return actualType === 'array' || actualType === 'unknown[]' || isArrayType(actualType);
  }

  if (isArrayType(expectedType) && isArrayType(actualType)) {
    return areTypesCompatible(getArrayElementType(expectedType), getArrayElementType(actualType));
  }

  if (isTupleType(expectedType) && isTupleType(actualType)) {
    const expectedTypes = splitTupleTypes(expectedType);
    const actualTypes = splitTupleTypes(actualType);

    return (
      expectedTypes.length === actualTypes.length &&
      expectedTypes.every((type, index) => areTypesCompatible(type, actualTypes[index] ?? 'unknown'))
    );
  }

  return expectedType === 'float' && actualType === 'double';
}

function isEqualityOperator(operator: BinaryOperator): boolean {
  return operator === '==' || operator === '!=';
}

function isLogicalOperator(operator: BinaryOperator): boolean {
  return operator === '&&' || operator === '||';
}

function isRelationalOperator(operator: BinaryOperator): boolean {
  return operator === '>' || operator === '>=' || operator === '<' || operator === '<=';
}

function promoteNumericType(leftType: NumberLiteralType, rightType: NumberLiteralType): SemanticType {
  if (leftType === 'double' || rightType === 'double') {
    return 'double';
  }

  if (leftType === 'float' || rightType === 'float') {
    return 'float';
  }

  return 'int';
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

class SemanticScope {
  private readonly symbols = new Map<string, SemanticSymbol>();

  public constructor(private readonly parent?: SemanticScope) {}

  public assign(name: string, location?: Identifier['location']): SemanticSymbol {
    const symbol = this.resolve(name);

    if (symbol === undefined) {
      throw createReferenceError(`Binding '${name}' is not defined`, location);
    }

    if (!symbol.mutable) {
      throw createTypeError(`Cannot reassign immutable binding '${name}'`, location);
    }

    return symbol;
  }

  public define(symbol: SemanticSymbol, location?: Identifier['location']): void {
    if (this.symbols.has(symbol.name)) {
      throw createSyntaxError(`Binding '${symbol.name}' is already defined`, location);
    }

    this.symbols.set(symbol.name, symbol);
  }

  public lookup(name: string, location?: Identifier['location']): SemanticSymbol {
    const symbol = this.resolve(name);

    if (symbol === undefined) {
      throw createReferenceError(`Binding '${name}' is not defined`, location);
    }

    return symbol;
  }

  private resolve(name: string): SemanticSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.resolve(name);
  }
}

export class SemanticAnalyzer {
  private currentClass: ClassDeclaration | undefined;
  private currentReturnType: FunctionReturnType | undefined;
  private readonly exports = new Map<string, SemanticSymbol>();
  private scope = new SemanticScope();

  public constructor(private readonly resolveImport?: SemanticImportResolver) {
    this.scope.define({
      callable: true,
      mutable: false,
      name: 'print',
      returnType: 'unknown',
      type: 'function',
    });
  }

  public analyze(program: Program): void {
    for (const statement of program.body) {
      this.analyzeStatement(statement);
    }
  }

  public getExports(): SemanticModuleExports {
    return this.exports;
  }

  private analyzeArguments(args: Expression[], parameterTypes: TypeName[], calleeName: string): void {
    if (args.length > parameterTypes.length) {
      throw createTypeError(`'${calleeName}' expects at most ${parameterTypes.length} arguments, got ${args.length}`);
    }

    for (const [index, arg] of args.entries()) {
      const argType = this.analyzeExpression(arg);
      const parameterType = parameterTypes[index];

      if (parameterType === undefined) {
        throw createTypeError(`Missing parameter type for argument ${index + 1} in '${calleeName}'`);
      }

      if (!areTypesCompatible(parameterType, argType)) {
        throw createTypeError(`Argument ${index + 1} of '${calleeName}' expects '${parameterType}', got '${argType}'`);
      }
    }
  }

  private analyzeArrayLiteral(expression: ArrayLiteral): SemanticType {
    if (expression.elements.length === 0) {
      return 'unknown[]';
    }

    const [firstElement, ...restElements] = expression.elements;

    if (firstElement === undefined) {
      throw createTypeError('Unexpected empty array literal');
    }

    let elementType = this.analyzeExpression(firstElement);

    for (const element of restElements) {
      const currentType = this.analyzeExpression(element);
      const widerType = getWiderType(elementType, currentType);

      if (widerType === undefined) {
        throw createTypeError(
          `Array literal elements must have compatible types, got '${elementType}' and '${currentType}'`
        );
      }

      elementType = widerType;
    }

    return `${elementType}[]`;
  }

  private analyzeAssignmentStatement(statement: AssignmentStatement): void {
    const type = this.analyzeExpression(statement.value);

    if (statement.target.kind === 'MemberExpression') {
      const resolved = this.resolveMemberExpression(statement.target);

      if (resolved.member.kind !== 'ClassProperty') {
        throw createTypeError(
          `Cannot assign to method '${statement.target.property.name}'`,
          statement.target.property.location
        );
      }

      if (resolved.member.declarationType === 'val') {
        throw createTypeError(
          `Cannot reassign immutable property '${statement.target.property.name}'`,
          statement.target.property.location
        );
      }

      if (statement.operator !== '=' && statement.operator !== '??=') {
        if (!isNumericType(resolved.member.typeAnnotation) || !isNumericType(type)) {
          throw createTypeError(
            `Operator '${statement.operator}' expects number operands`,
            statement.target.property.location
          );
        }
        return;
      }

      if (!areTypesCompatible(resolved.member.typeAnnotation, type)) {
        throw createTypeError(
          `Cannot assign value of type '${type}' to property '${statement.target.property.name}' of type '${resolved.member.typeAnnotation}'`,
          statement.target.property.location
        );
      }

      return;
    }

    const symbol = this.scope.lookup(statement.target.name, statement.target.location);

    if (statement.operator === '=') {
      if (!areTypesCompatible(symbol.type, type)) {
        throw createTypeError(
          `Cannot assign value of type '${type}' to binding '${statement.target.name}' of type '${symbol.type}'`,
          statement.target.location
        );
      }

      this.scope.assign(statement.target.name, statement.target.location);
      return;
    }

    if (statement.operator === '??=') {
      if (!areTypesCompatible(symbol.type, type)) {
        throw createTypeError(
          `Cannot assign value of type '${type}' to binding '${statement.target.name}' of type '${symbol.type}'`,
          statement.target.location
        );
      }

      this.scope.assign(statement.target.name, statement.target.location);
      return;
    }

    if (statement.operator === '&&=' || statement.operator === '||=') {
      if (symbol.type !== 'boolean' || (type !== 'boolean' && type !== 'unknown')) {
        throw createTypeError(`Operator '${statement.operator}' expects boolean operands`, statement.target.location);
      }

      this.scope.assign(statement.target.name, statement.target.location);
      return;
    }

    if (!symbol.mutable) {
      throw createTypeError(`Cannot reassign immutable binding '${statement.target.name}'`, statement.target.location);
    }

    if (!isNumericType(symbol.type) || !isNumericType(type)) {
      throw createTypeError(`Operator '${statement.operator}' expects number operands`, statement.target.location);
    }

    toBinaryOperator(statement.operator);
    this.scope.assign(statement.target.name, statement.target.location);
  }

  private analyzeBinaryExpression(expression: BinaryExpression): SemanticType {
    const leftType = this.analyzeExpression(expression.left);
    const rightType = this.analyzeExpression(expression.right);

    if (isLogicalOperator(expression.operator)) {
      if ((leftType !== 'boolean' && leftType !== 'unknown') || (rightType !== 'boolean' && rightType !== 'unknown')) {
        throw createTypeError(`Operator '${expression.operator}' expects boolean operands`);
      }

      return 'boolean';
    }

    if (expression.operator === '??') {
      if (leftType === 'null') {
        return rightType;
      }

      if (rightType === 'null' || areTypesCompatible(leftType, rightType)) {
        return leftType;
      }

      throw createTypeError(`Operator '${expression.operator}' expects compatible operands`);
    }

    if (isEqualityOperator(expression.operator)) {
      if (isNumericType(leftType) && isNumericType(rightType)) {
        return 'boolean';
      }

      if (leftType !== rightType && leftType !== 'unknown' && rightType !== 'unknown') {
        throw createTypeError(`Operator '${expression.operator}' expects operands with compatible types`);
      }

      return 'boolean';
    }

    if (isRelationalOperator(expression.operator)) {
      if (!isNumericType(leftType) || !isNumericType(rightType)) {
        throw createTypeError(`Operator '${expression.operator}' expects number operands`);
      }

      return 'boolean';
    }

    if (!isNumericType(leftType) || !isNumericType(rightType)) {
      throw createTypeError(`Operator '${expression.operator}' expects number operands`);
    }

    return promoteNumericType(leftType, rightType);
  }

  private analyzeCallExpression(expression: CallExpression): SemanticType {
    if (expression.callee.kind === 'MemberExpression') {
      const resolved = this.resolveMemberExpression(expression.callee);

      if (resolved.member.kind !== 'ClassMethod') {
        throw createTypeError(
          `Member '${expression.callee.property.name}' is not callable`,
          expression.callee.property.location
        );
      }

      this.analyzeArguments(
        expression.arguments,
        resolved.member.parameters.map((parameter) => parameter.typeAnnotation),
        expression.callee.property.name
      );

      if (expression.arguments.length < this.getMinimumArity(resolved.member.parameters)) {
        throw createTypeError(
          `'${expression.callee.property.name}' expects at least ${this.getMinimumArity(resolved.member.parameters)} arguments, got ${expression.arguments.length}`,
          expression.callee.property.location
        );
      }

      return resolved.member.returnType;
    }

    if (expression.callee.kind === 'SuperExpression') {
      const currentClass = this.requireCurrentClass('super');

      if (currentClass.baseClass === undefined) {
        throw createTypeError("'super()' can only be used in classes with a base class");
      }

      const baseClass = this.getClassDeclaration(currentClass.baseClass);
      const constructorMember = this.getConstructor(baseClass);
      const parameterTypes = constructorMember?.parameters.map((parameter) => parameter.typeAnnotation) ?? [];
      const minimumArity = constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters);

      if (expression.arguments.length < minimumArity) {
        throw createTypeError(`'super' expects at least ${minimumArity} arguments, got ${expression.arguments.length}`);
      }

      this.analyzeArguments(expression.arguments, parameterTypes, 'super');
      return 'void';
    }

    if (expression.callee.kind !== 'Identifier') {
      this.analyzeExpression(expression.callee);

      for (const arg of expression.arguments) {
        this.analyzeExpression(arg);
      }

      return 'unknown';
    }

    const callee = this.scope.lookup(expression.callee.name, expression.callee.location);

    if (!callee.callable) {
      throw createTypeError(`Binding '${expression.callee.name}' is not callable`, expression.callee.location);
    }

    if (callee.parameterTypes !== undefined) {
      if (callee.minArity !== undefined && expression.arguments.length < callee.minArity) {
        throw createTypeError(
          `'${expression.callee.name}' expects at least ${callee.minArity} arguments, got ${expression.arguments.length}`,
          expression.callee.location
        );
      }

      this.analyzeArguments(expression.arguments, callee.parameterTypes, expression.callee.name);
      return callee.returnType ?? 'unknown';
    }

    if (callee.arity !== undefined && expression.arguments.length !== callee.arity) {
      throw createTypeError(
        `Function '${expression.callee.name}' expects ${callee.arity} arguments, got ${expression.arguments.length}`,
        expression.callee.location
      );
    }

    for (const arg of expression.arguments) {
      this.analyzeExpression(arg);
    }
    return callee.returnType ?? 'unknown';
  }

  private analyzeClassDeclaration(statement: ClassDeclaration): void {
    this.scope.define(
      {
        callable: false,
        classDeclaration: statement,
        mutable: false,
        name: statement.identifier.name,
        type: statement.identifier.name,
      },
      statement.identifier.location
    );

    if (statement.virtual) {
      for (const member of statement.members) {
        if (member.kind !== 'ClassMethod' || member.body !== undefined) {
          throw createTypeError(
            `Abstract virtual class '${statement.identifier.name}' can only contain method signatures`,
            statement.identifier.location
          );
        }
      }
    }

    if (statement.baseClass !== undefined) {
      const base = this.scope.lookup(statement.baseClass.name, statement.baseClass.location);

      if (base.classDeclaration === undefined) {
        throw createTypeError(
          `Class '${statement.identifier.name}' can only extend classes`,
          statement.baseClass.location
        );
      }
    }

    if (!statement.abstract) {
      this.ensureImplementsBaseVirtualMethods(statement);
    }

    for (const implemented of statement.implements) {
      const contract = this.scope.lookup(implemented.name, implemented.location);

      if (contract.classDeclaration === undefined || !contract.classDeclaration.virtual) {
        throw createTypeError(
          `Class '${statement.identifier.name}' can only implement abstract virtual classes`,
          implemented.location
        );
      }

      this.ensureImplementsContract(statement, contract.classDeclaration);
    }

    this.ensureSingleConstructor(statement);
    this.ensureConstructorRules(statement);
    this.ensureOverridesAreValid(statement);
    this.analyzeClassMembers(statement);
  }

  private analyzeClassMembers(statement: ClassDeclaration): void {
    const previousClass = this.currentClass;
    const previousReturnType = this.currentReturnType;

    try {
      this.currentClass = statement;

      for (const member of statement.members) {
        if (member.kind === 'ClassProperty') {
          const initializerType = this.analyzeExpression(member.initializer);

          if (!areTypesCompatible(member.typeAnnotation, initializerType)) {
            throw createTypeError(
              `Cannot initialize property '${member.name.name}' of type '${member.typeAnnotation}' with value of type '${initializerType}'`,
              member.name.location
            );
          }
          continue;
        }

        if (member.kind === 'ClassConstructor') {
          this.analyzeDefaultParameters(member.parameters, `${statement.identifier.name}.constructor`);
          this.currentReturnType = 'void';
          this.withScope(() => {
            this.defineParameters(member.parameters);

            for (const bodyStatement of member.body) {
              this.analyzeStatement(bodyStatement);
            }
          });
          continue;
        }

        this.analyzeDefaultParameters(member.parameters, member.name.name);

        if (member.body === undefined) {
          if (!statement.virtual && !member.virtual) {
            throw createTypeError(
              `Method signature '${member.name.name}' must be virtual in abstract class '${statement.identifier.name}'`,
              member.name.location
            );
          }

          if (!statement.abstract && !statement.virtual) {
            throw createTypeError(
              `Concrete class '${statement.identifier.name}' cannot contain method signature '${member.name.name}'`,
              member.name.location
            );
          }
          continue;
        }

        this.currentReturnType = member.returnType;
        this.withScope(() => {
          this.defineParameters(member.parameters);

          for (const bodyStatement of member.body ?? []) {
            this.analyzeStatement(bodyStatement);
          }
        });

        if (member.returnType !== 'void' && !this.hasReturnStatement(member.body)) {
          throw createTypeError(
            `Method '${member.name.name}' must return a value of type '${member.returnType}'`,
            member.name.location
          );
        }
      }
    } finally {
      this.currentClass = previousClass;
      this.currentReturnType = previousReturnType;
    }
  }

  private analyzeConditionalExpression(expression: ConditionalExpression): SemanticType {
    const testType = this.analyzeExpression(expression.test);

    if (testType !== 'boolean' && testType !== 'unknown') {
      throw createTypeError(`Ternary condition must be a boolean, got '${testType}'`);
    }

    const consequentType = this.analyzeExpression(expression.consequent);
    const alternateType = this.analyzeExpression(expression.alternate);

    if (areTypesCompatible(consequentType, alternateType)) {
      return consequentType;
    }

    if (areTypesCompatible(alternateType, consequentType)) {
      return alternateType;
    }

    throw createTypeError('Ternary branches must have compatible types');
  }

  private analyzeDefaultParameters(parameters: Parameter[], ownerName: string): void {
    this.withScope(() => {
      for (const parameter of parameters) {
        if (parameter.defaultValue !== undefined) {
          const defaultType = this.analyzeExpression(parameter.defaultValue);

          if (!areTypesCompatible(parameter.typeAnnotation, defaultType)) {
            throw createTypeError(
              `Default value for parameter '${parameter.identifier.name}' in '${ownerName}' must be '${parameter.typeAnnotation}', got '${defaultType}'`,
              parameter.identifier.location
            );
          }
        }

        this.scope.define(
          {
            callable: false,
            mutable: false,
            name: parameter.identifier.name,
            type: parameter.typeAnnotation,
          },
          parameter.identifier.location
        );
      }
    });
  }

  private analyzeDoWhileStatement(statement: DoWhileStatement): void {
    this.withScope(() => {
      for (const bodyStatement of statement.body) {
        this.analyzeStatement(bodyStatement);
      }
    });

    const conditionType = this.analyzeExpression(statement.condition);

    if (conditionType !== 'boolean' && conditionType !== 'unknown') {
      throw createTypeError(`Do while condition must be a boolean, got '${conditionType}'`);
    }
  }

  private analyzeExportDeclaration(statement: ExportDeclaration): void {
    if (statement.declaration !== undefined) {
      this.analyzeStatement(statement.declaration);
    }

    const identifier = statement.declaration?.identifier ?? statement.identifier;

    if (identifier === undefined) {
      throw createSyntaxError('Expected exported binding name');
    }

    const symbol = this.scope.lookup(identifier.name, identifier.location);
    this.exports.set(identifier.name, symbol);
  }

  private analyzeExpression(expression: Expression): SemanticType {
    switch (expression.kind) {
      case 'ArrayLiteral':
        return this.analyzeArrayLiteral(expression);
      case 'BinaryExpression':
        return this.analyzeBinaryExpression(expression);
      case 'CallExpression':
        return this.analyzeCallExpression(expression);
      case 'ConditionalExpression':
        return this.analyzeConditionalExpression(expression);
      case 'Identifier':
        return this.analyzeIdentifier(expression);
      case 'MemberExpression':
        return this.analyzeMemberExpression(expression);
      case 'NewExpression':
        return this.analyzeNewExpression(expression);
      case 'NumberLiteral':
        return this.analyzeNumberLiteral(expression);
      case 'NullLiteral':
        return this.analyzeNullLiteral();
      case 'StringLiteral':
        return this.analyzeStringLiteral();
      case 'SuperExpression':
        return this.analyzeSuperExpression();
      case 'ThisExpression':
        return this.analyzeThisExpression();
      case 'TupleLiteral':
        return this.analyzeTupleLiteral(expression);
      case 'UnaryExpression':
        return this.analyzeUnaryExpression(expression);
    }
  }

  private analyzeExpressionStatement(statement: ExpressionStatement): void {
    this.analyzeExpression(statement.expression);
  }

  private analyzeForStatement(statement: ForStatement): void {
    const iterableType = this.analyzeExpression(statement.iterable);

    if (iterableType !== 'array' && !isArrayType(iterableType) && iterableType !== 'unknown') {
      throw createTypeError('For loop iterable must be an array', statement.element.location);
    }

    const elementType =
      iterableType === 'array' || iterableType === 'unknown' ? 'unknown' : getArrayElementType(iterableType);

    this.withScope(() => {
      this.scope.define(
        {
          callable: false,
          mutable: true,
          name: statement.element.name,
          type: elementType,
        },
        statement.element.location
      );

      if (statement.index !== undefined) {
        this.scope.define(
          {
            callable: false,
            mutable: false,
            name: statement.index.name,
            type: 'int',
          },
          statement.index.location
        );
      }

      for (const bodyStatement of statement.body) {
        this.analyzeStatement(bodyStatement);
      }
    });
  }

  private analyzeFunctionDeclaration(statement: FunctionDeclaration): void {
    this.scope.define(
      {
        arity: statement.parameters.length,
        callable: true,
        minArity: this.getMinimumArity(statement.parameters),
        mutable: false,
        name: statement.identifier.name,
        parameterTypes: statement.parameters.map((parameter) => parameter.typeAnnotation),
        returnType: statement.returnType,
        type: 'function',
      },
      statement.identifier.location
    );

    const previousReturnType = this.currentReturnType;

    try {
      this.analyzeDefaultParameters(statement.parameters, statement.identifier.name);
      this.currentReturnType = statement.returnType;
      this.withScope(() => {
        this.defineParameters(statement.parameters);

        for (const bodyStatement of statement.body) {
          this.analyzeStatement(bodyStatement);
        }
      });
    } finally {
      this.currentReturnType = previousReturnType;
    }

    if (statement.returnType !== 'void' && !this.hasReturnStatement(statement.body)) {
      throw createTypeError(
        `Function '${statement.identifier.name}' must return a value of type '${statement.returnType}'`,
        statement.identifier.location
      );
    }
  }

  private analyzeIdentifier(expression: Identifier): SemanticType {
    return this.scope.lookup(expression.name, expression.location).type;
  }

  private analyzeImportDeclaration(statement: ImportDeclaration): void {
    if (this.resolveImport === undefined) {
      throw createSyntaxError('Imports are not supported in this analyzer mode');
    }

    const moduleExports = this.resolveImport(statement.source.value);

    for (const identifier of statement.identifiers) {
      const exportedSymbol = moduleExports.get(identifier.name);

      if (exportedSymbol === undefined) {
        throw createReferenceError(
          `Module '${statement.source.value}' does not export '${identifier.name}'`,
          identifier.location
        );
      }

      const importedSymbol: SemanticSymbol = {
        callable: exportedSymbol.callable,
        mutable: false,
        name: identifier.name,
        type: exportedSymbol.type,
      };

      if (exportedSymbol.arity !== undefined) {
        importedSymbol.arity = exportedSymbol.arity;
      }

      if (exportedSymbol.returnType !== undefined) {
        importedSymbol.returnType = exportedSymbol.returnType;
      }

      if (exportedSymbol.minArity !== undefined) {
        importedSymbol.minArity = exportedSymbol.minArity;
      }

      if (exportedSymbol.parameterTypes !== undefined) {
        importedSymbol.parameterTypes = exportedSymbol.parameterTypes;
      }

      this.scope.define(importedSymbol, identifier.location);
    }
  }

  private analyzeMemberExpression(expression: MemberExpression): SemanticType {
    const resolved = this.resolveMemberExpression(expression);

    if (resolved.member.kind === 'ClassProperty') {
      return resolved.member.typeAnnotation;
    }

    return 'function';
  }

  private analyzeNewExpression(expression: NewExpression): SemanticType {
    const symbol = this.scope.lookup(expression.callee.name, expression.callee.location);

    if (symbol.classDeclaration === undefined) {
      throw createTypeError(`Binding '${expression.callee.name}' is not a class`, expression.callee.location);
    }

    if (symbol.classDeclaration.abstract || symbol.classDeclaration.virtual) {
      throw createTypeError(
        `Cannot instantiate abstract class '${expression.callee.name}'`,
        expression.callee.location
      );
    }

    this.ensureConstructorIsAccessible(symbol.classDeclaration, expression.callee);
    const constructorMember = symbol.classDeclaration.members.find((member) => member.kind === 'ClassConstructor');
    const parameterTypes = constructorMember?.parameters.map((parameter) => parameter.typeAnnotation) ?? [];

    if (
      expression.arguments.length <
      (constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters))
    ) {
      throw createTypeError(
        `'${expression.callee.name}' expects at least ${constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters)} arguments, got ${expression.arguments.length}`,
        expression.callee.location
      );
    }

    this.analyzeArguments(expression.arguments, parameterTypes, expression.callee.name);

    return expression.callee.name;
  }

  private analyzeNullLiteral(): SemanticType {
    return 'null';
  }

  private analyzeNumberLiteral(expression: NumberLiteral): SemanticType {
    return expression.numberType;
  }

  private analyzeReturnStatement(statement: ReturnStatement): void {
    if (this.currentReturnType === undefined) {
      throw createSyntaxError("'return' can only be used inside functions");
    }

    if (statement.value === undefined) {
      if (this.currentReturnType !== 'void') {
        throw createTypeError(`Cannot return void from function returning '${this.currentReturnType}'`);
      }

      return;
    }

    if (this.currentReturnType === 'void') {
      throw createTypeError('Cannot return a value from function returning void');
    }

    const type = this.analyzeExpression(statement.value);

    if (!areTypesCompatible(this.currentReturnType, type)) {
      throw createTypeError(
        `Cannot return value of type '${type}' from function returning '${this.currentReturnType}'`
      );
    }
  }

  private analyzeStatement(statement: Statement): void {
    switch (statement.kind) {
      case 'AssignmentStatement':
        this.analyzeAssignmentStatement(statement);
        return;
      case 'ClassDeclaration':
        this.analyzeClassDeclaration(statement);
        return;
      case 'DoWhileStatement':
        this.analyzeDoWhileStatement(statement);
        return;
      case 'ExportDeclaration':
        this.analyzeExportDeclaration(statement);
        return;
      case 'ExpressionStatement':
        this.analyzeExpressionStatement(statement);
        return;
      case 'ForStatement':
        this.analyzeForStatement(statement);
        return;
      case 'FunctionDeclaration':
        this.analyzeFunctionDeclaration(statement);
        return;
      case 'ImportDeclaration':
        this.analyzeImportDeclaration(statement);
        return;
      case 'ReturnStatement':
        this.analyzeReturnStatement(statement);
        return;
      case 'VariableDeclaration':
        this.analyzeVariableDeclaration(statement);
        return;
      case 'WhileStatement':
        this.analyzeWhileStatement(statement);
        return;
    }
  }

  private analyzeStringLiteral(): SemanticType {
    return 'string';
  }

  private analyzeSuperExpression(): SemanticType {
    const currentClass = this.requireCurrentClass('super');

    if (currentClass.baseClass === undefined) {
      throw createTypeError("'super' can only be used in classes with a base class");
    }

    return currentClass.baseClass.name;
  }

  private analyzeThisExpression(): SemanticType {
    return this.requireCurrentClass('this').identifier.name;
  }

  private analyzeTupleLiteral(expression: TupleLiteral): SemanticType {
    return `(${expression.elements.map((element) => this.analyzeExpression(element)).join(',')})`;
  }

  private analyzeUnaryExpression(expression: UnaryExpression): SemanticType {
    const argumentType = this.analyzeExpression(expression.argument);

    if (!isNumericType(argumentType)) {
      throw createTypeError(`Operator '${expression.operator}' expects a number operand`);
    }

    return argumentType;
  }

  private analyzeVariableDeclaration(statement: VariableDeclaration): void {
    const type = this.analyzeExpression(statement.initializer);

    if (type === 'void') {
      throw createTypeError(`Cannot initialize binding '${statement.identifier.name}' with void value`);
    }

    if (statement.typeAnnotation === undefined) {
      if (type === 'null') {
        throw createTypeError(
          `Cannot infer type for binding '${statement.identifier.name}' initialized with null`,
          statement.identifier.location
        );
      }

      this.scope.define(
        {
          callable: false,
          mutable: statement.declarationType === 'var',
          name: statement.identifier.name,
          type,
        },
        statement.identifier.location
      );
      return;
    }

    if (!areTypesCompatible(statement.typeAnnotation, type)) {
      throw createTypeError(
        `Cannot initialize binding '${statement.identifier.name}' of type ` +
          `'${statement.typeAnnotation}' with value of type '${type}'`,
        statement.identifier.location
      );
    }

    this.scope.define(
      {
        callable: false,
        mutable: statement.declarationType === 'var',
        name: statement.identifier.name,
        type: statement.typeAnnotation,
      },
      statement.identifier.location
    );
  }

  private analyzeWhileStatement(statement: WhileStatement): void {
    const conditionType = this.analyzeExpression(statement.condition);

    if (conditionType !== 'boolean' && conditionType !== 'unknown') {
      throw createTypeError(`While condition must be a boolean, got '${conditionType}'`);
    }

    this.withScope(() => {
      for (const bodyStatement of statement.body) {
        this.analyzeStatement(bodyStatement);
      }
    });
  }

  private defineParameters(parameters: Parameter[]): void {
    for (const parameter of parameters) {
      this.scope.define(
        {
          callable: false,
          mutable: false,
          name: parameter.identifier.name,
          type: parameter.typeAnnotation,
        },
        parameter.identifier.location
      );
    }
  }

  private ensureConstructorIsAccessible(statement: ClassDeclaration, location: Identifier): void {
    const constructorMember = this.getConstructor(statement);

    if (constructorMember === undefined || constructorMember.access === 'public') {
      return;
    }

    const currentClass = this.currentClass;

    if (constructorMember.access === 'private' && currentClass?.identifier.name !== statement.identifier.name) {
      throw createTypeError(`Constructor '${statement.identifier.name}' is private`, location.location);
    }

    if (
      constructorMember.access === 'protected' &&
      (currentClass === undefined || !this.isSameOrSubclass(currentClass, statement))
    ) {
      throw createTypeError(`Constructor '${statement.identifier.name}' is protected`, location.location);
    }
  }

  private ensureConstructorRules(statement: ClassDeclaration): void {
    if (statement.baseClass === undefined) {
      return;
    }

    const baseClass = this.getClassDeclaration(statement.baseClass);
    const baseConstructor = this.getConstructor(baseClass);
    const constructorMember = this.getConstructor(statement);

    if (constructorMember === undefined) {
      if ((baseConstructor?.parameters.length ?? 0) > 0) {
        throw createTypeError(
          `Class '${statement.identifier.name}' must declare a constructor and call super`,
          statement.identifier.location
        );
      }

      return;
    }

    if (!this.hasLeadingSuperCall(constructorMember)) {
      throw createTypeError(
        `Constructor for '${statement.identifier.name}' must start with super()`,
        statement.identifier.location
      );
    }
  }

  private ensureImplementsBaseVirtualMethods(statement: ClassDeclaration): void {
    const requiredMethods = this.getInheritedVirtualMethods(statement);
    const concreteMethods = this.getConcreteMethods(statement);

    for (const requiredMethod of requiredMethods) {
      const implementation = concreteMethods.get(requiredMethod.name.name);

      if (implementation === undefined) {
        throw createTypeError(
          `Class '${statement.identifier.name}' must implement inherited virtual method '${requiredMethod.name.name}'`,
          statement.identifier.location
        );
      }

      if (!implementation.override) {
        throw createTypeError(
          `Method '${implementation.name.name}' must use 'override' to implement inherited virtual method`,
          implementation.name.location
        );
      }

      this.ensureMethodsHaveSameSignature(implementation, requiredMethod);
    }
  }

  private ensureImplementsContract(statement: ClassDeclaration, contract: ClassDeclaration): void {
    const methods = this.getConcreteMethods(statement);

    for (const contractMember of contract.members) {
      if (contractMember.kind !== 'ClassMethod') {
        continue;
      }

      const implementation = methods.get(contractMember.name.name);

      if (implementation === undefined) {
        throw createTypeError(
          `Class '${statement.identifier.name}' must implement method '${contractMember.name.name}'`,
          statement.identifier.location
        );
      }

      if (!implementation.override) {
        throw createTypeError(
          `Method '${implementation.name.name}' must use 'override' to implement '${contract.identifier.name}'`,
          implementation.name.location
        );
      }

      if (implementation.returnType !== contractMember.returnType) {
        throw createTypeError(
          `Method '${implementation.name.name}' must return '${contractMember.returnType}' to implement '${contract.identifier.name}'`,
          implementation.name.location
        );
      }

      if (!this.haveSameParameters(implementation.parameters, contractMember.parameters)) {
        throw createTypeError(
          `Method '${implementation.name.name}' must match parameters from '${contract.identifier.name}'`,
          implementation.name.location
        );
      }
    }
  }

  private ensureMemberIsAccessible(resolved: ResolvedClassMember, location: Identifier['location']): void {
    if (resolved.member.access === 'public') {
      return;
    }

    if (this.currentClass === undefined) {
      throw createTypeError(`Member '${resolved.member.name.name}' is ${resolved.member.access}`, location);
    }

    if (resolved.member.access === 'private' && this.currentClass.identifier.name !== resolved.owner.identifier.name) {
      throw createTypeError(`Member '${resolved.member.name.name}' is private`, location);
    }

    if (resolved.member.access === 'protected' && !this.isSameOrSubclass(this.currentClass, resolved.owner)) {
      throw createTypeError(`Member '${resolved.member.name.name}' is protected`, location);
    }
  }

  private ensureMethodsHaveSameSignature(method: ClassMethod, inheritedMethod: ClassMethod): void {
    if (
      method.returnType !== inheritedMethod.returnType ||
      !this.haveSameParameters(method.parameters, inheritedMethod.parameters)
    ) {
      throw createTypeError(`Method '${method.name.name}' must match inherited method signature`, method.name.location);
    }
  }

  private ensureOverridesAreValid(statement: ClassDeclaration): void {
    const implementedMethodNames = new Set<string>();

    for (const implemented of statement.implements) {
      const contract = this.getClassDeclaration(implemented);

      for (const member of contract.members) {
        if (member.kind === 'ClassMethod') {
          implementedMethodNames.add(member.name.name);
        }
      }
    }

    for (const member of statement.members) {
      if (member.kind !== 'ClassMethod' || member.body === undefined) {
        continue;
      }

      const inheritedMethod = this.getInheritedMethod(statement, member.name.name, member.static);

      if (inheritedMethod === undefined && !implementedMethodNames.has(member.name.name) && member.override) {
        throw createTypeError(
          `Method '${member.name.name}' uses override but does not override anything`,
          member.name.location
        );
      }

      if (inheritedMethod !== undefined && !member.override) {
        throw createTypeError(`Method '${member.name.name}' must use override`, member.name.location);
      }

      if (inheritedMethod !== undefined) {
        this.ensureMethodsHaveSameSignature(member, inheritedMethod);
      }
    }
  }

  private ensureSingleConstructor(statement: ClassDeclaration): void {
    const constructors = statement.members.filter((member) => member.kind === 'ClassConstructor');

    if (constructors.length > 1) {
      throw createSyntaxError(
        `Class '${statement.identifier.name}' can only have one constructor`,
        statement.identifier.location
      );
    }
  }

  private getClassDeclaration(identifier: Identifier): ClassDeclaration {
    const symbol = this.scope.lookup(identifier.name, identifier.location);

    if (symbol.classDeclaration === undefined) {
      throw createTypeError(`Binding '${identifier.name}' is not a class`, identifier.location);
    }

    return symbol.classDeclaration;
  }

  private getConcreteMethods(statement: ClassDeclaration): Map<string, ClassMethod> {
    const methods = new Map<string, ClassMethod>();

    for (const member of statement.members) {
      if (member.kind === 'ClassMethod' && member.body !== undefined) {
        methods.set(member.name.name, member);
      }
    }

    return methods;
  }

  private getConstructor(statement: ClassDeclaration): ClassConstructor | undefined {
    return statement.members.find((member): member is ClassConstructor => member.kind === 'ClassConstructor');
  }

  private getInheritedMethod(statement: ClassDeclaration, name: string, isStatic: boolean): ClassMethod | undefined {
    if (statement.baseClass === undefined) {
      return undefined;
    }

    const baseClass = this.getClassDeclaration(statement.baseClass);
    const baseMethod = this.getMethod(baseClass, name, isStatic);

    if (baseMethod !== undefined) {
      return baseMethod.member;
    }

    return this.getInheritedMethod(baseClass, name, isStatic);
  }

  private getInheritedVirtualMethods(statement: ClassDeclaration): ClassMethod[] {
    if (statement.baseClass === undefined) {
      return [];
    }

    const baseClass = this.getClassDeclaration(statement.baseClass);
    const inheritedMethods = this.getInheritedVirtualMethods(baseClass);
    const directVirtualMethods = baseClass.members.filter(
      (member): member is ClassMethod => member.kind === 'ClassMethod' && member.body === undefined
    );

    return [...inheritedMethods, ...directVirtualMethods];
  }

  private getMember(statement: ClassDeclaration, name: string, isStatic: boolean): ResolvedClassMember | undefined {
    return this.getProperty(statement, name, isStatic) ?? this.getMethod(statement, name, isStatic);
  }

  private getMethod(
    statement: ClassDeclaration,
    name: string,
    isStatic: boolean
  ): { member: ClassMethod; owner: ClassDeclaration } | undefined {
    const method = statement.members.find(
      (member): member is ClassMethod =>
        member.kind === 'ClassMethod' && member.name.name === name && member.static === isStatic
    );

    if (method !== undefined) {
      return {
        member: method,
        owner: statement,
      };
    }

    if (statement.baseClass !== undefined) {
      return this.getMethod(this.getClassDeclaration(statement.baseClass), name, isStatic);
    }

    return undefined;
  }

  private getMinimumArity(parameters: Parameter[]): number {
    return parameters.filter((parameter) => parameter.defaultValue === undefined).length;
  }

  private getProperty(statement: ClassDeclaration, name: string, isStatic: boolean): ResolvedClassMember | undefined {
    const property = statement.members.find(
      (member): member is ClassProperty =>
        member.kind === 'ClassProperty' && member.name.name === name && member.static === isStatic
    );

    if (property !== undefined) {
      return {
        member: property,
        owner: statement,
      };
    }

    if (statement.baseClass !== undefined) {
      return this.getProperty(this.getClassDeclaration(statement.baseClass), name, isStatic);
    }

    return undefined;
  }

  private hasLeadingSuperCall(constructorMember: ClassConstructor): boolean {
    const [firstStatement] = constructorMember.body;

    return (
      firstStatement?.kind === 'ExpressionStatement' &&
      firstStatement.expression.kind === 'CallExpression' &&
      firstStatement.expression.callee.kind === 'SuperExpression'
    );
  }

  private hasReturnStatement(statements: Statement[]): boolean {
    for (const statement of statements) {
      if (statement.kind === 'ReturnStatement') {
        return true;
      }

      if (
        (statement.kind === 'DoWhileStatement' ||
          statement.kind === 'ForStatement' ||
          statement.kind === 'WhileStatement') &&
        this.hasReturnStatement(statement.body)
      ) {
        return true;
      }
    }

    return false;
  }

  private haveSameParameters(left: Parameter[], right: Parameter[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((parameter, index) => parameter.typeAnnotation === right[index]?.typeAnnotation);
  }

  private isSameOrSubclass(candidate: ClassDeclaration, base: ClassDeclaration): boolean {
    if (candidate.identifier.name === base.identifier.name) {
      return true;
    }

    if (candidate.baseClass === undefined) {
      return false;
    }

    return this.isSameOrSubclass(this.getClassDeclaration(candidate.baseClass), base);
  }

  private requireCurrentClass(keyword: 'super' | 'this'): ClassDeclaration {
    if (this.currentClass === undefined) {
      throw createTypeError(`'${keyword}' can only be used inside classes`);
    }

    return this.currentClass;
  }

  private resolveMemberExpression(expression: MemberExpression): ResolvedClassMember {
    if (expression.object.kind === 'SuperExpression') {
      const currentClass = this.requireCurrentClass('super');

      if (currentClass.baseClass === undefined) {
        throw createTypeError("'super' can only be used in classes with a base class", expression.property.location);
      }

      const baseClass = this.getClassDeclaration(currentClass.baseClass);
      const member = this.getMember(baseClass, expression.property.name, false);

      if (member === undefined) {
        throw createReferenceError(`Member '${expression.property.name}' is not defined`, expression.property.location);
      }

      this.ensureMemberIsAccessible(member, expression.property.location);
      return member;
    }

    if (expression.object.kind === 'Identifier') {
      const objectSymbol = this.scope.lookup(expression.object.name, expression.object.location);

      if (objectSymbol.classDeclaration !== undefined) {
        const member = this.getMember(objectSymbol.classDeclaration, expression.property.name, true);

        if (member === undefined) {
          throw createReferenceError(
            `Static member '${expression.property.name}' is not defined`,
            expression.property.location
          );
        }

        this.ensureMemberIsAccessible(member, expression.property.location);
        return member;
      }
    }

    const objectType = this.analyzeExpression(expression.object);

    if (objectType === 'unknown') {
      return {
        member: {
          access: 'public',
          body: [],
          kind: 'ClassMethod',
          name: expression.property,
          override: false,
          parameters: [],
          returnType: 'unknown',
          static: false,
          virtual: false,
        },
        owner: this.requireCurrentClass('this'),
      };
    }

    const objectClass = this.getClassDeclaration({
      kind: 'Identifier',
      location: expression.property.location,
      name: objectType,
    });
    const member = this.getMember(objectClass, expression.property.name, false);

    if (member === undefined) {
      throw createReferenceError(`Member '${expression.property.name}' is not defined`, expression.property.location);
    }

    this.ensureMemberIsAccessible(member, expression.property.location);
    return member;
  }

  private withScope(callback: () => void): void {
    const previousScope = this.scope;
    this.scope = new SemanticScope(previousScope);

    try {
      callback();
    } finally {
      this.scope = previousScope;
    }
  }
}
