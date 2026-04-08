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
  TypeParameter,
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
  restParameterType?: TypeName;
  returnType?: SemanticType;
  type: SemanticType;
  typeParameters?: TypeParameter[];
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

function splitTopLevel(content: string): string[] {
  if (content.trim() === '') {
    return [];
  }

  const parts: string[] = [];
  let current = '';
  let angleDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (const char of content) {
    if (char === ',' && angleDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    if (char === '<') {
      angleDepth += 1;
    } else if (char === '>') {
      angleDepth -= 1;
    } else if (char === '[') {
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

function splitTupleTypes(type: string): string[] {
  const content = type.slice(1, -1);

  return splitTopLevel(content);
}

function parseAppliedGenericType(type: string): { args: string[]; baseName: string } | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)<(.*)>$/.exec(type);

  if (match === null) {
    return undefined;
  }

  const [, baseName, argsContent] = match;

  if (baseName === undefined || argsContent === undefined) {
    return undefined;
  }

  return {
    args: splitTopLevel(argsContent),
    baseName,
  };
}

function getArrayElementType(type: string): string {
  return type.slice(0, -2);
}

function instantiateType(type: string, typeArguments: ReadonlyMap<string, TypeName>): string {
  const direct = typeArguments.get(type);

  if (direct !== undefined) {
    return direct;
  }

  if (type.endsWith('[]')) {
    return `${instantiateType(getArrayElementType(type), typeArguments)}[]`;
  }

  if (isTupleType(type)) {
    return `(${splitTupleTypes(type)
      .map((part) => instantiateType(part, typeArguments))
      .join(',')})`;
  }

  const appliedType = parseAppliedGenericType(type);

  if (appliedType !== undefined) {
    return `${appliedType.baseName}<${appliedType.args.map((arg) => instantiateType(arg, typeArguments)).join(',')}>`;
  }

  return type;
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

function mergeInferredType(currentType: TypeName | undefined, nextType: SemanticType): TypeName | undefined {
  if (nextType === 'unknown') {
    return currentType;
  }

  if (currentType === undefined) {
    return nextType;
  }

  if (currentType === nextType) {
    return currentType;
  }

  return getWiderType(currentType, nextType);
}

function inferTypeArgumentsFromTypes(
  expectedType: TypeName,
  actualType: SemanticType,
  genericNames: ReadonlySet<string>,
  inferredTypes: Map<string, TypeName>
): void {
  if (actualType === 'unknown' || actualType === 'null') {
    return;
  }

  if (genericNames.has(expectedType)) {
    const mergedType = mergeInferredType(inferredTypes.get(expectedType), actualType);

    if (mergedType !== undefined) {
      inferredTypes.set(expectedType, mergedType);
    }

    return;
  }

  if (isArrayType(expectedType) && isArrayType(actualType)) {
    inferTypeArgumentsFromTypes(
      getArrayElementType(expectedType),
      getArrayElementType(actualType),
      genericNames,
      inferredTypes
    );
    return;
  }

  if (isTupleType(expectedType) && isTupleType(actualType)) {
    const expectedTypes = splitTupleTypes(expectedType);
    const actualTypes = splitTupleTypes(actualType);

    for (const [index, tupleExpectedType] of expectedTypes.entries()) {
      const tupleActualType = actualTypes[index];

      if (tupleActualType !== undefined) {
        inferTypeArgumentsFromTypes(tupleExpectedType, tupleActualType, genericNames, inferredTypes);
      }
    }

    return;
  }

  const expectedAppliedType = parseAppliedGenericType(expectedType);
  const actualAppliedType = parseAppliedGenericType(actualType);

  if (
    expectedAppliedType !== undefined &&
    actualAppliedType !== undefined &&
    expectedAppliedType.baseName === actualAppliedType.baseName &&
    expectedAppliedType.args.length === actualAppliedType.args.length
  ) {
    for (const [index, appliedExpectedType] of expectedAppliedType.args.entries()) {
      const appliedActualType = actualAppliedType.args[index];

      if (appliedActualType !== undefined) {
        inferTypeArgumentsFromTypes(appliedExpectedType, appliedActualType, genericNames, inferredTypes);
      }
    }
  }
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

  private analyzeArguments(
    args: Expression[],
    parameterTypes: TypeName[],
    calleeName: string,
    restParameterType?: TypeName
  ): void {
    const fixedArity = restParameterType === undefined ? parameterTypes.length : parameterTypes.length - 1;

    if (restParameterType === undefined && args.length > parameterTypes.length) {
      throw createTypeError(`'${calleeName}' expects at most ${parameterTypes.length} arguments, got ${args.length}`);
    }

    for (const [index, arg] of args.entries()) {
      const argType = this.analyzeExpression(arg);
      const parameterType =
        index < fixedArity
          ? parameterTypes[index]
          : restParameterType === undefined
            ? undefined
            : getArrayElementType(restParameterType);

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
      const calleeObjectType = this.analyzeExpression(expression.callee.object);

      if (calleeObjectType === 'function') {
        if (expression.callee.property.name === 'name') {
          throw createTypeError(
            `Member '${expression.callee.property.name}' is not callable`,
            expression.callee.property.location
          );
        }

        if (expression.callee.property.name === 'toString') {
          if (expression.arguments.length !== 0) {
            throw createTypeError(
              `'${expression.callee.property.name}' expects 0 arguments, got ${expression.arguments.length}`,
              expression.callee.property.location
            );
          }

          return 'string';
        }

        throw createReferenceError(
          `Member '${expression.callee.property.name}' is not defined`,
          expression.callee.property.location
        );
      }

      const resolved = this.resolveMemberExpression(expression.callee);

      if (resolved.member.kind !== 'ClassMethod') {
        throw createTypeError(
          `Member '${expression.callee.property.name}' is not callable`,
          expression.callee.property.location
        );
      }

      const objectType = this.analyzeExpression(expression.callee.object);
      const typeArguments = this.resolveClassTypeArguments(
        resolved.owner,
        objectType,
        expression.callee.property.location
      );
      const parameterTypes = resolved.member.parameters.map((parameter) =>
        instantiateType(parameter.typeAnnotation, typeArguments)
      );
      const restParameterType = resolved.member.parameters.find((parameter) => parameter.rest)?.typeAnnotation;
      const instantiatedRestParameterType =
        restParameterType === undefined ? undefined : instantiateType(restParameterType, typeArguments);

      this.analyzeArguments(
        expression.arguments,
        parameterTypes,
        expression.callee.property.name,
        instantiatedRestParameterType
      );

      if (expression.arguments.length < this.getMinimumArity(resolved.member.parameters)) {
        throw createTypeError(
          `'${expression.callee.property.name}' expects at least ${this.getMinimumArity(resolved.member.parameters)} arguments, got ${expression.arguments.length}`,
          expression.callee.property.location
        );
      }

      return instantiateType(resolved.member.returnType, typeArguments);
    }

    if (expression.callee.kind === 'SuperExpression') {
      const currentClass = this.requireCurrentClass('super');

      if (currentClass.baseClass === undefined) {
        throw createTypeError("'super()' can only be used in classes with a base class");
      }

      const baseClass = this.getClassDeclaration(currentClass.baseClass);
      const constructorMember = this.getConstructor(baseClass);
      const parameterTypes = constructorMember?.parameters.map((parameter) => parameter.typeAnnotation) ?? [];
      const restParameterType = constructorMember?.parameters.find((parameter) => parameter.rest)?.typeAnnotation;
      const minimumArity = constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters);

      if (expression.arguments.length < minimumArity) {
        throw createTypeError(`'super' expects at least ${minimumArity} arguments, got ${expression.arguments.length}`);
      }

      this.analyzeArguments(expression.arguments, parameterTypes, 'super', restParameterType);
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

      if (callee.typeParameters !== undefined && callee.typeParameters.length > 0) {
        const typeArguments = this.analyzeGenericArguments(
          expression.arguments,
          callee.parameterTypes,
          callee.typeParameters,
          expression.typeArguments,
          expression.callee.location,
          expression.callee.name,
          callee.restParameterType
        ).returnTypeArguments;

        return callee.returnType === undefined ? 'unknown' : instantiateType(callee.returnType, typeArguments);
      }

      this.analyzeArguments(
        expression.arguments,
        callee.parameterTypes,
        expression.callee.name,
        callee.restParameterType
      );
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
    for (const member of statement.members) {
      if (
        (member.kind === 'ClassMethod' || member.kind === 'ClassProperty') &&
        member.static &&
        member.name.name === 'name'
      ) {
        throw createTypeError(
          `Class '${statement.identifier.name}' cannot declare static member 'name' because it is reserved`,
          member.name.location
        );
      }
    }

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

        if (member.name.name === 'toString') {
          if (member.parameters.length > 0) {
            throw createTypeError(
              `Method 'toString' in '${statement.identifier.name}' cannot accept parameters`,
              member.name.location
            );
          }

          if (member.returnType !== 'string') {
            throw createTypeError(
              `Method 'toString' in '${statement.identifier.name}' must return 'string'`,
              member.name.location
            );
          }
        }

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
        if (parameter.rest && !isArrayType(parameter.typeAnnotation)) {
          throw createTypeError(
            `Rest parameter '${parameter.identifier.name}' in '${ownerName}' must use an array type`,
            parameter.identifier.location
          );
        }

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
    const restParameter = statement.parameters.find((parameter) => parameter.rest);
    const symbol: SemanticSymbol = {
      arity: statement.parameters.length,
      callable: true,
      minArity: this.getMinimumArity(statement.parameters),
      mutable: false,
      name: statement.identifier.name,
      parameterTypes: statement.parameters.map((parameter) => parameter.typeAnnotation),
      returnType: statement.returnType,
      type: 'function',
    };

    if (restParameter !== undefined) {
      symbol.restParameterType = restParameter.typeAnnotation;
    }

    if (statement.typeParameters.length > 0) {
      symbol.typeParameters = statement.typeParameters;
    }

    this.scope.define(symbol, statement.identifier.location);

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

  private analyzeGenericArguments(
    args: Expression[],
    parameterTypes: TypeName[],
    typeParameters: TypeParameter[],
    explicitTypeArguments: TypeName[],
    location: Identifier['location'],
    ownerName: string,
    restParameterType?: TypeName
  ): { parameterTypes: TypeName[]; returnTypeArguments: Map<string, TypeName> } {
    const genericNames = new Set(typeParameters.map((typeParameter) => typeParameter.identifier.name));
    const inferredTypes = new Map<string, TypeName>();
    const fixedArity = restParameterType === undefined ? parameterTypes.length : parameterTypes.length - 1;
    const restElementType = restParameterType === undefined ? undefined : getArrayElementType(restParameterType);

    for (const [index, arg] of args.entries()) {
      const argType = this.analyzeExpression(arg);
      const parameterType = index < fixedArity ? parameterTypes[index] : restElementType;

      if (parameterType !== undefined) {
        inferTypeArgumentsFromTypes(parameterType, argType, genericNames, inferredTypes);
      }
    }

    const typeArguments = this.buildTypeArgumentMap(
      typeParameters,
      explicitTypeArguments,
      inferredTypes,
      location,
      ownerName
    );

    const instantiatedParameterTypes = parameterTypes.map((parameterType) =>
      instantiateType(parameterType, typeArguments)
    );
    const instantiatedRestParameterType =
      restParameterType === undefined ? undefined : instantiateType(restParameterType, typeArguments);

    this.analyzeArguments(args, instantiatedParameterTypes, ownerName, instantiatedRestParameterType);

    return {
      parameterTypes: instantiatedParameterTypes,
      returnTypeArguments: typeArguments,
    };
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

      if (exportedSymbol.restParameterType !== undefined) {
        importedSymbol.restParameterType = exportedSymbol.restParameterType;
      }

      if (exportedSymbol.typeParameters !== undefined) {
        importedSymbol.typeParameters = exportedSymbol.typeParameters;
      }

      this.scope.define(importedSymbol, identifier.location);
    }
  }

  private analyzeMemberExpression(expression: MemberExpression): SemanticType {
    const objectType = this.analyzeExpression(expression.object);

    if (expression.property.name === 'constructor' && objectType !== 'unknown') {
      return objectType;
    }

    if (objectType === 'function') {
      if (expression.property.name === 'name') {
        return 'string';
      }

      if (expression.property.name === 'toString') {
        return 'function';
      }

      throw createReferenceError(`Member '${expression.property.name}' is not defined`, expression.property.location);
    }

    const resolved = this.resolveMemberExpression(expression);

    if (resolved.member.kind === 'ClassProperty') {
      const typeArguments = this.resolveClassTypeArguments(resolved.owner, objectType, expression.property.location);
      return instantiateType(resolved.member.typeAnnotation, typeArguments);
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
    const restParameterType = constructorMember?.parameters.find((parameter) => parameter.rest)?.typeAnnotation;

    if (
      expression.arguments.length <
      (constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters))
    ) {
      throw createTypeError(
        `'${expression.callee.name}' expects at least ${constructorMember === undefined ? 0 : this.getMinimumArity(constructorMember.parameters)} arguments, got ${expression.arguments.length}`,
        expression.callee.location
      );
    }

    if (symbol.classDeclaration.typeParameters.length > 0) {
      const typeArguments = this.analyzeGenericArguments(
        expression.arguments,
        parameterTypes,
        symbol.classDeclaration.typeParameters,
        expression.typeArguments,
        expression.callee.location,
        expression.callee.name,
        restParameterType
      ).returnTypeArguments;

      return this.buildAppliedGenericType(
        expression.callee.name,
        symbol.classDeclaration.typeParameters.map((typeParameter) => {
          const typeArgument = typeArguments.get(typeParameter.identifier.name);

          if (typeArgument === undefined) {
            throw createTypeError(
              `Could not resolve type parameter '${typeParameter.identifier.name}' in '${expression.callee.name}'`,
              expression.callee.location
            );
          }

          return typeArgument;
        })
      );
    }

    this.analyzeArguments(expression.arguments, parameterTypes, expression.callee.name, restParameterType);

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

  private buildAppliedGenericType(baseName: string, typeArguments: TypeName[]): TypeName {
    return typeArguments.length === 0 ? baseName : `${baseName}<${typeArguments.join(',')}>`;
  }

  private buildTypeArgumentMap(
    typeParameters: TypeParameter[],
    explicitTypeArguments: TypeName[],
    inferredTypes: Map<string, TypeName>,
    location: Identifier['location'],
    ownerName: string
  ): Map<string, TypeName> {
    if (explicitTypeArguments.length > typeParameters.length) {
      throw createTypeError(
        `'${ownerName}' expects at most ${typeParameters.length} type arguments, got ${explicitTypeArguments.length}`,
        location
      );
    }

    const typeArguments = new Map<string, TypeName>();

    for (const [index, typeParameter] of typeParameters.entries()) {
      const explicitTypeArgument = explicitTypeArguments[index];

      if (explicitTypeArgument !== undefined) {
        typeArguments.set(typeParameter.identifier.name, explicitTypeArgument);
        continue;
      }

      const inferredType = inferredTypes.get(typeParameter.identifier.name);

      if (inferredType !== undefined) {
        typeArguments.set(typeParameter.identifier.name, inferredType);
        continue;
      }

      if (typeParameter.defaultType !== undefined) {
        typeArguments.set(typeParameter.identifier.name, instantiateType(typeParameter.defaultType, typeArguments));
        continue;
      }

      throw createTypeError(
        `Could not resolve type parameter '${typeParameter.identifier.name}' in '${ownerName}'`,
        location
      );
    }

    return typeArguments;
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
    const appliedType = parseAppliedGenericType(identifier.name);
    const symbol = this.scope.lookup(appliedType?.baseName ?? identifier.name, identifier.location);

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

    if (name === 'toString') {
      return {
        member: {
          access: 'public',
          kind: 'ClassMethod',
          name: {
            kind: 'Identifier',
            location: statement.identifier.location,
            name: 'toString',
          },
          override: false,
          parameters: [],
          returnType: 'string',
          static: isStatic,
          virtual: false,
        },
        owner: statement,
      };
    }

    if (statement.baseClass !== undefined) {
      return this.getMethod(this.getClassDeclaration(statement.baseClass), name, isStatic);
    }

    return undefined;
  }

  private getMinimumArity(parameters: Parameter[]): number {
    return parameters.filter((parameter) => parameter.defaultValue === undefined && !parameter.rest).length;
  }

  private getProperty(statement: ClassDeclaration, name: string, isStatic: boolean): ResolvedClassMember | undefined {
    if (isStatic && name === 'name') {
      return {
        member: {
          access: 'public',
          declarationType: 'val',
          initializer: {
            kind: 'StringLiteral',
            value: statement.identifier.name,
          },
          kind: 'ClassProperty',
          name: {
            kind: 'Identifier',
            location: statement.identifier.location,
            name: 'name',
          },
          static: true,
          typeAnnotation: 'string',
        },
        owner: statement,
      };
    }

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

  private resolveClassTypeArguments(
    statement: ClassDeclaration,
    objectType: SemanticType,
    location: Identifier['location']
  ): Map<string, TypeName> {
    const typeArguments = new Map<string, TypeName>();

    if (statement.typeParameters.length === 0) {
      return typeArguments;
    }

    const appliedType = typeof objectType === 'string' ? parseAppliedGenericType(objectType) : undefined;

    if (appliedType !== undefined && appliedType.baseName === statement.identifier.name) {
      return this.buildTypeArgumentMap(
        statement.typeParameters,
        appliedType.args,
        new Map(),
        location,
        statement.identifier.name
      );
    }

    if (objectType === statement.identifier.name) {
      return new Map(
        statement.typeParameters.map((typeParameter) => [typeParameter.identifier.name, typeParameter.identifier.name])
      );
    }

    return this.buildTypeArgumentMap(statement.typeParameters, [], new Map(), location, statement.identifier.name);
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

    if (expression.object.kind === 'MemberExpression' && expression.object.property.name === 'constructor') {
      const objectType = this.analyzeExpression(expression.object);
      const objectClass = this.getClassDeclaration({
        kind: 'Identifier',
        location: expression.property.location,
        name: objectType,
      });
      const member = this.getMember(objectClass, expression.property.name, true);

      if (member === undefined) {
        throw createReferenceError(
          `Static member '${expression.property.name}' is not defined`,
          expression.property.location
        );
      }

      this.ensureMemberIsAccessible(member, expression.property.location);
      return member;
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
