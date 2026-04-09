import type {
  AnonymousFunctionExpression,
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  ClassConstructor,
  ClassDeclaration,
  ClassicForStatement,
  ClassMethod,
  ClassProperty,
  ConditionalExpression,
  DoWhileStatement,
  EnumDeclaration,
  ExceptClause,
  ExportDeclaration,
  Expression,
  ExpressionStatement,
  ForStatement,
  FunctionDeclaration,
  FunctionReturnType,
  Identifier,
  IfStatement,
  ImportDeclaration,
  IndexExpression,
  MemberExpression,
  NewExpression,
  NumberLiteral,
  NumberLiteralType,
  Parameter,
  Program,
  ReturnStatement,
  Statement,
  SwitchCase,
  SwitchStatement,
  ThrowStatement,
  TryStatement,
  TupleLiteral,
  TypeName,
  TypeParameter,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { getBuiltinClassDeclarations } from './builtins';
import { createReferenceError, createSyntaxError, createTypeError } from './errors';

export type SemanticType = 'function' | 'null' | 'void' | TypeName | 'unknown';

export type CallableSignature = {
  minArity: number;
  parameterTypes: TypeName[];
  restParameterType?: TypeName;
  returnType: SemanticType;
  typeParameters: TypeParameter[];
};

export type SemanticSymbol = {
  arity?: number;
  callable: boolean;
  classDeclaration?: ClassDeclaration;
  enumDeclaration?: EnumDeclaration;
  minArity?: number;
  mutable: boolean;
  name: string;
  namespaceExports?: SemanticModuleExports;
  overloadSignatures?: CallableSignature[];
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

type ResolvedEnumMember = {
  member: Identifier;
  owner: EnumDeclaration;
};

type TypeGuard = {
  identifier: Identifier;
  narrowedType: SemanticType;
};

type BranchTypeGuards = {
  falsy: TypeGuard[];
  truthy: TypeGuard[];
};

function getTypeGuardKey(guard: TypeGuard): string {
  return `${guard.identifier.name}:${guard.narrowedType}`;
}

function mergeTypeGuards(left: TypeGuard[], right: TypeGuard[]): TypeGuard[] {
  const merged = new Map<string, TypeGuard>();

  for (const guard of [...left, ...right]) {
    merged.set(getTypeGuardKey(guard), guard);
  }

  return [...merged.values()];
}

function intersectTypeGuards(left: TypeGuard[], right: TypeGuard[]): TypeGuard[] {
  const rightKeys = new Set(right.map((guard) => getTypeGuardKey(guard)));
  return left.filter((guard) => rightKeys.has(getTypeGuardKey(guard)));
}

function emptyBranchTypeGuards(): BranchTypeGuards {
  return {
    falsy: [],
    truthy: [],
  };
}

function isNumericType(type: SemanticType): type is NumberLiteralType {
  return type === 'byte' || type === 'double' || type === 'float' || type === 'int';
}

function isArrayType(type: SemanticType): boolean {
  return typeof type === 'string' && type.endsWith('[]');
}

function isFunctionType(type: SemanticType): boolean {
  return typeof type === 'string' && type.startsWith('fn(');
}

function isTupleType(type: SemanticType): boolean {
  return typeof type === 'string' && type.startsWith('(') && type.endsWith(')');
}

function buildFunctionType(parameterTypes: TypeName[], returnType: FunctionReturnType): TypeName {
  return `fn(${parameterTypes.join(',')}):${returnType}`;
}

function parseFunctionType(type: string): { parameterTypes: TypeName[]; returnType: FunctionReturnType } | undefined {
  if (!type.startsWith('fn(')) {
    return undefined;
  }

  let closeIndex = -1;
  let nestedParenDepth = 0;

  for (let index = 3; index < type.length; index += 1) {
    const char = type[index];

    if (char === '(') {
      nestedParenDepth += 1;
      continue;
    }

    if (char === ')') {
      if (nestedParenDepth === 0) {
        closeIndex = index;
        break;
      }

      nestedParenDepth -= 1;
    }
  }

  if (closeIndex === -1 || type.slice(closeIndex + 1, closeIndex + 2) !== ':') {
    return undefined;
  }

  const parameterContent = type.slice(3, closeIndex);

  return {
    parameterTypes: splitTopLevel(parameterContent),
    returnType: type.slice(closeIndex + 2) as FunctionReturnType,
  };
}

function isSwitchComparableType(type: SemanticType): boolean {
  return type === 'boolean' || type === 'null' || type === 'string' || isNumericType(type) || isTupleType(type);
}

function canSwitchCompareTypes(leftType: SemanticType, rightType: SemanticType): boolean {
  if (leftType === 'unknown' || rightType === 'unknown') {
    return true;
  }

  if (leftType === 'null' || rightType === 'null') {
    return true;
  }

  if (isNumericType(leftType) && isNumericType(rightType)) {
    return true;
  }

  if (isTupleType(leftType) && isTupleType(rightType)) {
    const leftElements = splitTupleTypes(leftType);
    const rightElements = splitTupleTypes(rightType);

    return (
      leftElements.length === rightElements.length &&
      leftElements.every((elementType, index) => canSwitchCompareTypes(elementType, rightElements[index] ?? 'unknown'))
    );
  }

  return leftType === rightType;
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

function containsUnknownType(type: string): boolean {
  if (type === 'unknown') {
    return true;
  }

  const functionType = parseFunctionType(type);

  if (functionType !== undefined) {
    return (
      functionType.returnType === 'unknown' ||
      functionType.parameterTypes.some((parameterType) => containsUnknownType(parameterType))
    );
  }

  if (type.endsWith('[]')) {
    return containsUnknownType(getArrayElementType(type));
  }

  if (isTupleType(type)) {
    return splitTupleTypes(type).some((part) => containsUnknownType(part));
  }

  const appliedType = parseAppliedGenericType(type);
  return appliedType?.args.some((arg) => containsUnknownType(arg)) ?? false;
}

function toSemanticTypeGuard(typeName: string): SemanticType | undefined {
  switch (typeName) {
    case 'array':
    case 'boolean':
    case 'double':
    case 'float':
    case 'function':
    case 'int':
    case 'null':
    case 'string':
    case 'tuple':
      return typeName;
    case 'class':
    case 'object':
      return undefined;
    default:
      return undefined;
  }
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

  const functionType = parseFunctionType(type);

  if (functionType !== undefined) {
    return buildFunctionType(
      functionType.parameterTypes.map((parameterType) => instantiateType(parameterType, typeArguments)),
      functionType.returnType === 'void' ? 'void' : instantiateType(functionType.returnType, typeArguments)
    );
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
  if (expectedType === 'unknown' || actualType === 'null' || actualType === 'unknown' || expectedType === actualType) {
    return true;
  }

  if (expectedType === 'int' && actualType === 'byte') {
    return true;
  }

  if (expectedType === 'array') {
    return actualType === 'array' || actualType === 'unknown[]' || isArrayType(actualType);
  }

  if (isArrayType(expectedType) && isArrayType(actualType)) {
    return areTypesCompatible(getArrayElementType(expectedType), getArrayElementType(actualType));
  }

  if (isFunctionType(expectedType) && isFunctionType(actualType)) {
    const expectedFunctionType = parseFunctionType(expectedType);
    const actualFunctionType = parseFunctionType(actualType);

    return (
      expectedFunctionType !== undefined &&
      actualFunctionType !== undefined &&
      expectedFunctionType.parameterTypes.length === actualFunctionType.parameterTypes.length &&
      expectedFunctionType.parameterTypes.every(
        (parameterType, index) => parameterType === actualFunctionType.parameterTypes[index]
      ) &&
      expectedFunctionType.returnType === actualFunctionType.returnType
    );
  }

  if (isTupleType(expectedType) && isTupleType(actualType)) {
    const expectedTypes = splitTupleTypes(expectedType);
    const actualTypes = splitTupleTypes(actualType);

    return (
      expectedTypes.length === actualTypes.length &&
      expectedTypes.every((type, index) => areTypesCompatible(type, actualTypes[index] ?? 'unknown'))
    );
  }

  if (expectedType === 'float' && actualType === 'double') {
    return true;
  }

  return false;
}

function isEqualityOperator(operator: BinaryOperator): boolean {
  return operator === '==' || operator === '!=';
}

function isLogicalOperator(operator: BinaryOperator): boolean {
  return operator === '&&' || operator === '||';
}

function isStringConcatenationOperand(type: SemanticType): boolean {
  return type !== 'void';
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

  public lookupCurrent(name: string): SemanticSymbol | undefined {
    return this.symbols.get(name);
  }

  public lookupOptional(name: string): SemanticSymbol | undefined {
    return this.resolve(name);
  }

  public replace(symbol: SemanticSymbol): void {
    this.symbols.set(symbol.name, symbol);
  }

  private resolve(name: string): SemanticSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.resolve(name);
  }
}

export class SemanticAnalyzer {
  private allowFallthroughStatement = false;
  private currentClass: ClassDeclaration | undefined;
  private currentReturnType: FunctionReturnType | undefined;
  private readonly exports = new Map<string, SemanticSymbol>();
  private loopDepth = 0;
  private scope = new SemanticScope();

  public constructor(private readonly resolveImport?: SemanticImportResolver) {
    this.scope.define({
      callable: true,
      minArity: 1,
      mutable: false,
      name: 'print',
      returnType: 'unknown',
      type: 'function',
    });
    this.scope.define({
      callable: true,
      minArity: 1,
      mutable: false,
      name: 'typeOf',
      parameterTypes: ['unknown'],
      returnType: 'string',
      type: 'function',
    });
    this.scope.define({
      callable: true,
      minArity: 2,
      mutable: false,
      name: 'isType',
      parameterTypes: ['unknown', 'string'],
      returnType: 'boolean',
      type: 'function',
    });
    this.scope.define({
      callable: true,
      minArity: 2,
      mutable: false,
      name: 'isInstance',
      returnType: 'boolean',
      type: 'function',
    });

    for (const builtinClass of getBuiltinClassDeclarations()) {
      this.analyzeClassDeclaration(builtinClass);
    }
  }

  public analyze(program: Program): void {
    for (const statement of program.body) {
      this.analyzeStatement(statement);
    }
  }

  public getExports(): SemanticModuleExports {
    return this.exports;
  }

  private analyzeAnonymousFunctionExpression(expression: AnonymousFunctionExpression): SemanticType {
    if (containsUnknownType(expression.returnType)) {
      throw createTypeError("Anonymous function cannot return 'unknown'");
    }

    this.analyzeDefaultParameters(expression.parameters, 'anonymous function');

    const previousReturnType = this.currentReturnType;

    try {
      this.currentReturnType = expression.returnType;
      this.withScope(() => {
        this.defineParameters(expression.parameters);

        for (const bodyStatement of expression.body) {
          this.analyzeStatement(bodyStatement);
        }
      });
    } finally {
      this.currentReturnType = previousReturnType;
    }

    if (expression.returnType !== 'void' && !this.hasReturnStatement(expression.body)) {
      throw createTypeError(`Anonymous function must return a value of type '${expression.returnType}'`);
    }

    return buildFunctionType(
      expression.parameters.map((parameter) => parameter.typeAnnotation),
      expression.returnType
    );
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

    if (statement.target.kind === 'IndexExpression') {
      const objectType = this.analyzeExpression(statement.target.object);
      const indexType = this.analyzeExpression(statement.target.index);

      if (indexType !== 'byte' && indexType !== 'int' && indexType !== 'unknown') {
        throw createTypeError(`Array index must be an int, got '${indexType}'`);
      }

      if (objectType !== 'array' && !isArrayType(objectType) && objectType !== 'unknown') {
        throw createTypeError(`Index assignment requires an array, got '${objectType}'`);
      }

      const elementType =
        objectType === 'array' || objectType === 'unknown' ? 'unknown' : getArrayElementType(objectType);

      if (statement.operator === '=' || statement.operator === '??=') {
        if (!areTypesCompatible(elementType, type)) {
          throw createTypeError(`Cannot assign value of type '${type}' to array element of type '${elementType}'`);
        }

        return;
      }

      if (statement.operator === '&&=' || statement.operator === '||=') {
        if ((elementType !== 'boolean' && elementType !== 'unknown') || (type !== 'boolean' && type !== 'unknown')) {
          throw createTypeError(`Operator '${statement.operator}' expects boolean operands`);
        }

        return;
      }

      if (!isNumericType(elementType) || !isNumericType(type)) {
        throw createTypeError(`Operator '${statement.operator}' expects number operands`);
      }

      toBinaryOperator(statement.operator);
      return;
    }

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

    if (expression.operator === '+') {
      if (leftType === 'string' || rightType === 'string') {
        if (!isStringConcatenationOperand(leftType) || !isStringConcatenationOperand(rightType)) {
          throw createTypeError(`Operator '${expression.operator}' expects renderable operands`);
        }

        return 'string';
      }
    }

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

  private analyzeBreakStatement(): void {
    if (this.loopDepth === 0) {
      throw createSyntaxError("'break' can only be used inside loops");
    }
  }

  private analyzeCallExpression(expression: CallExpression): SemanticType {
    if (expression.callee.kind === 'MemberExpression') {
      if (expression.callee.object.kind === 'Identifier') {
        const objectSymbol = this.scope.lookup(expression.callee.object.name, expression.callee.object.location);

        if (objectSymbol.namespaceExports !== undefined) {
          const exportedSymbol = objectSymbol.namespaceExports.get(expression.callee.property.name);

          if (exportedSymbol === undefined) {
            throw createReferenceError(
              `Module namespace '${expression.callee.object.name}' does not export '${expression.callee.property.name}'`,
              expression.callee.property.location
            );
          }

          if (!exportedSymbol.callable) {
            throw createTypeError(
              `Member '${expression.callee.property.name}' is not callable`,
              expression.callee.property.location
            );
          }

          if (exportedSymbol.overloadSignatures !== undefined) {
            return this.resolveOverloadSignature(
              expression.arguments,
              expression.callee.property.name,
              exportedSymbol.overloadSignatures,
              expression.callee.property.location,
              expression.typeArguments
            ).returnType;
          }

          if (exportedSymbol.parameterTypes !== undefined) {
            if (exportedSymbol.typeParameters !== undefined && exportedSymbol.typeParameters.length > 0) {
              const typeArguments = this.analyzeGenericArguments(
                expression.arguments,
                exportedSymbol.parameterTypes,
                exportedSymbol.typeParameters,
                expression.typeArguments,
                expression.callee.property.location,
                expression.callee.property.name,
                exportedSymbol.restParameterType
              ).returnTypeArguments;

              return exportedSymbol.returnType === undefined
                ? 'unknown'
                : instantiateType(exportedSymbol.returnType, typeArguments);
            }

            this.analyzeArguments(
              expression.arguments,
              exportedSymbol.parameterTypes,
              expression.callee.property.name,
              exportedSymbol.restParameterType
            );

            if (expression.arguments.length < (exportedSymbol.minArity ?? 0)) {
              throw createTypeError(
                `'${expression.callee.property.name}' expects at least ${exportedSymbol.minArity ?? 0} arguments, got ${expression.arguments.length}`,
                expression.callee.property.location
              );
            }

            return exportedSymbol.returnType ?? 'unknown';
          }

          if (exportedSymbol.arity !== undefined && expression.arguments.length !== exportedSymbol.arity) {
            throw createTypeError(
              `'${expression.callee.property.name}' expects ${exportedSymbol.arity} arguments, got ${expression.arguments.length}`,
              expression.callee.property.location
            );
          }

          for (const argument of expression.arguments) {
            this.analyzeExpression(argument);
          }

          return exportedSymbol.returnType ?? 'unknown';
        }
      }

      const calleeObjectType = this.analyzeExpression(expression.callee.object);

      if (calleeObjectType === 'function' || isFunctionType(calleeObjectType)) {
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
      const callTarget = this.getMethodCallTarget(
        resolved.owner,
        expression.callee.property.name,
        resolved.member.static
      );
      const typeArguments = this.resolveClassTypeArguments(
        resolved.owner,
        objectType,
        expression.callee.property.location
      );

      if (callTarget !== undefined && callTarget.overloadSignatures.length > 0) {
        const instantiatedSignatures = callTarget.overloadSignatures.map((signature) => {
          const instantiatedSignature: CallableSignature = {
            minArity: signature.minArity,
            parameterTypes: signature.parameterTypes.map((parameterType) =>
              instantiateType(parameterType, typeArguments)
            ),
            returnType: instantiateType(signature.returnType, typeArguments),
            typeParameters: signature.typeParameters,
          };

          if (signature.restParameterType !== undefined) {
            instantiatedSignature.restParameterType = instantiateType(signature.restParameterType, typeArguments);
          }

          return instantiatedSignature;
        });
        const resolvedOverload = this.resolveOverloadSignature(
          expression.arguments,
          expression.callee.property.name,
          instantiatedSignatures,
          expression.callee.property.location,
          expression.typeArguments
        );

        return resolvedOverload.returnType;
      }

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
      const calleeType = this.analyzeExpression(expression.callee);

      if (isFunctionType(calleeType)) {
        const functionType = parseFunctionType(calleeType);

        if (functionType === undefined) {
          throw createTypeError('Invalid function type in call expression');
        }

        this.analyzeArguments(expression.arguments, functionType.parameterTypes, '<function>');
        return functionType.returnType;
      }

      for (const arg of expression.arguments) {
        this.analyzeExpression(arg);
      }

      throw createTypeError('Expression is not callable');
    }

    const callee = this.scope.lookup(expression.callee.name, expression.callee.location);

    if (!callee.callable) {
      throw createTypeError(`Binding '${expression.callee.name}' is not callable`, expression.callee.location);
    }

    if (expression.callee.name === 'isInstance') {
      if (expression.arguments.length !== 2) {
        throw createTypeError(
          `'${expression.callee.name}' expects 2 arguments, got ${expression.arguments.length}`,
          expression.callee.location
        );
      }

      const instanceArgument = expression.arguments[0];

      if (instanceArgument === undefined) {
        throw createTypeError(`'${expression.callee.name}' expects 2 arguments, got ${expression.arguments.length}`);
      }

      this.analyzeExpression(instanceArgument);

      const classArgument = expression.arguments[1];

      if (classArgument === undefined || classArgument.kind !== 'Identifier') {
        throw createTypeError(
          `'isInstance' expects a class identifier as the second argument`,
          expression.callee.location
        );
      }

      const classSymbol = this.scope.lookup(classArgument.name, classArgument.location);

      if (classSymbol.classDeclaration === undefined) {
        throw createTypeError(`'isInstance' expects a class as the second argument`, classArgument.location);
      }

      return 'boolean';
    }

    if (callee.overloadSignatures !== undefined) {
      const resolvedOverload = this.resolveOverloadSignature(
        expression.arguments,
        expression.callee.name,
        callee.overloadSignatures,
        expression.callee.location,
        expression.typeArguments
      );

      return resolvedOverload.returnType;
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
      this.validateMethodOverloads(statement);

      for (const member of statement.members) {
        if (member.kind === 'ClassProperty') {
          if (containsUnknownType(member.typeAnnotation)) {
            throw createTypeError(
              `Property '${member.name.name}' in '${statement.identifier.name}' cannot use 'unknown'`,
              member.name.location
            );
          }

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

        const overloadSignatures = this.getDeclaredMethods(statement, member.name.name, member.static).filter(
          (declaredMethod) => declaredMethod.body === undefined && !declaredMethod.virtual && !statement.virtual
        );
        const isOverloadImplementation = member.body !== undefined && overloadSignatures.length > 0;

        if (!isOverloadImplementation) {
          this.analyzeDefaultParameters(member.parameters, member.name.name);
        }

        if (containsUnknownType(member.returnType)) {
          throw createTypeError(
            `Method '${member.name.name}' in '${statement.identifier.name}' cannot return 'unknown'`,
            member.name.location
          );
        }

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
            const implementation = this.getDeclaredMethodImplementation(statement, member.name.name, member.static);

            if (implementation === undefined) {
              throw createTypeError(
                `Method overload '${member.name.name}' in '${statement.identifier.name}' requires an implementation`,
                member.name.location
              );
            }
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

  private analyzeClassicForStatement(statement: ClassicForStatement): void {
    this.withLoop(() => {
      this.withScope(() => {
        if (statement.initializer !== undefined) {
          this.analyzeStatement(statement.initializer);
        }

        if (statement.condition !== undefined) {
          const conditionType = this.analyzeExpression(statement.condition);

          if (conditionType !== 'boolean' && conditionType !== 'unknown') {
            throw createTypeError(`For condition must be a boolean, got '${conditionType}'`);
          }
        }

        this.withScope(() => {
          for (const bodyStatement of statement.body) {
            this.analyzeStatement(bodyStatement);
          }
        });

        if (statement.increment !== undefined) {
          this.analyzeStatement(statement.increment);
        }
      });
    });
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

  private analyzeContinueStatement(): void {
    if (this.loopDepth === 0) {
      throw createSyntaxError("'continue' can only be used inside loops");
    }
  }

  private analyzeDefaultParameters(parameters: Parameter[], ownerName: string): void {
    this.withScope(() => {
      for (const parameter of parameters) {
        if (containsUnknownType(parameter.typeAnnotation)) {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in '${ownerName}' can only use 'unknown' in an overload implementation`,
            parameter.identifier.location
          );
        }

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
            ...(this.createCallableSymbolForType(parameter.typeAnnotation) ?? {}),
            callable: isFunctionType(parameter.typeAnnotation),
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
    this.withLoop(() => {
      this.withScope(() => {
        for (const bodyStatement of statement.body) {
          this.analyzeStatement(bodyStatement);
        }
      });
    });

    const conditionType = this.analyzeExpression(statement.condition);

    if (conditionType !== 'boolean' && conditionType !== 'unknown') {
      throw createTypeError(`Do while condition must be a boolean, got '${conditionType}'`);
    }
  }

  private analyzeEnumDeclaration(statement: EnumDeclaration): void {
    if (statement.members.length === 0) {
      throw createTypeError(
        `Enum '${statement.identifier.name}' must declare at least one member`,
        statement.identifier.location
      );
    }

    const seenMembers = new Set<string>();

    for (const member of statement.members) {
      if (seenMembers.has(member.name)) {
        throw createTypeError(
          `Enum '${statement.identifier.name}' already defines member '${member.name}'`,
          member.location
        );
      }

      seenMembers.add(member.name);
    }

    this.scope.define(
      {
        callable: false,
        enumDeclaration: statement,
        mutable: false,
        name: statement.identifier.name,
        type: 'enum',
      },
      statement.identifier.location
    );
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
      case 'AnonymousFunctionExpression':
        return this.analyzeAnonymousFunctionExpression(expression);
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
      case 'IndexExpression':
        return this.analyzeIndexExpression(expression);
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

  private analyzeFallthroughStatement(): void {
    if (!this.allowFallthroughStatement) {
      throw createSyntaxError("'fallthrough' can only be used as the final top-level statement in a switch case");
    }
  }

  private analyzeForStatement(statement: ForStatement): void {
    const iterableType = this.analyzeExpression(statement.iterable);

    if (iterableType !== 'array' && !isArrayType(iterableType) && iterableType !== 'unknown') {
      throw createTypeError('For loop iterable must be an array', statement.element.location);
    }

    const elementType =
      iterableType === 'array' || iterableType === 'unknown' ? 'unknown' : getArrayElementType(iterableType);

    this.withLoop(() => {
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
    });
  }

  private analyzeFunctionDeclaration(statement: FunctionDeclaration): void {
    if (containsUnknownType(statement.returnType)) {
      throw createTypeError(
        `Function '${statement.identifier.name}' cannot return 'unknown'`,
        statement.identifier.location
      );
    }

    const signature = this.buildCallableSignature(statement.parameters, statement.returnType, statement.typeParameters);
    const existing = this.scope.lookupCurrent(statement.identifier.name);
    const usesDefaultOrRest = statement.parameters.some(
      (parameter) => parameter.defaultValue !== undefined || parameter.rest
    );

    if (statement.body === undefined) {
      if (usesDefaultOrRest) {
        throw createTypeError(
          `Overload signature '${statement.identifier.name}' cannot use default or rest parameters`,
          statement.identifier.location
        );
      }

      if (existing?.classDeclaration !== undefined || (existing !== undefined && existing.type !== 'function')) {
        throw createSyntaxError(
          `Binding '${statement.identifier.name}' is already defined`,
          statement.identifier.location
        );
      }

      if (existing !== undefined && existing.overloadSignatures === undefined) {
        throw createTypeError(
          `Overload signature '${statement.identifier.name}' must appear before its implementation`,
          statement.identifier.location
        );
      }

      if (existing === undefined) {
        this.scope.define(
          {
            callable: true,
            mutable: false,
            name: statement.identifier.name,
            overloadSignatures: [signature],
            returnType: statement.returnType,
            type: 'function',
          },
          statement.identifier.location
        );
      } else {
        const overloadSignatures = existing.overloadSignatures ?? [];

        for (const overloadSignature of overloadSignatures) {
          this.canAddOverloadSignature(
            overloadSignature,
            signature,
            statement.identifier.location,
            statement.identifier.name
          );
        }

        this.scope.replace({
          ...existing,
          overloadSignatures: [...overloadSignatures, signature],
        });
      }

      return;
    }

    const hasOverloads = existing?.overloadSignatures !== undefined;

    if (existing !== undefined && !hasOverloads) {
      throw createSyntaxError(
        `Binding '${statement.identifier.name}' is already defined`,
        statement.identifier.location
      );
    }

    if (hasOverloads) {
      if (usesDefaultOrRest) {
        throw createTypeError(
          `Overload implementation '${statement.identifier.name}' cannot use default or rest parameters`,
          statement.identifier.location
        );
      }

      const overloadSignatures = existing?.overloadSignatures ?? [];

      for (const overloadSignature of overloadSignatures) {
        if (overloadSignature.parameterTypes.length !== signature.parameterTypes.length) {
          throw createTypeError(
            `Overload implementation '${statement.identifier.name}' must keep the same parameter count`,
            statement.identifier.location
          );
        }

        if (overloadSignature.returnType !== signature.returnType) {
          throw createTypeError(
            `Overload implementation '${statement.identifier.name}' must keep the same return type`,
            statement.identifier.location
          );
        }
      }

      for (const [index, parameter] of statement.parameters.entries()) {
        const overloadedTypes = new Set(
          overloadSignatures.map((overloadSignature) => overloadSignature.parameterTypes[index] ?? 'unknown')
        );
        const [expectedType] = [...overloadedTypes];

        if (overloadedTypes.size > 1 && parameter.typeAnnotation !== 'unknown') {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}' must use 'unknown'`,
            parameter.identifier.location
          );
        }

        if (overloadedTypes.size === 1 && parameter.typeAnnotation === 'unknown') {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}' cannot use 'unknown' unless the overload varies at this position`,
            parameter.identifier.location
          );
        }

        if (overloadedTypes.size === 1 && expectedType !== undefined && parameter.typeAnnotation !== expectedType) {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}' must match '${expectedType}'`,
            parameter.identifier.location
          );
        }
      }
    } else {
      for (const parameter of statement.parameters) {
        if (containsUnknownType(parameter.typeAnnotation)) {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in '${statement.identifier.name}' can only use 'unknown' in an overload implementation`,
            parameter.identifier.location
          );
        }
      }
    }

    const symbol: SemanticSymbol = {
      arity: statement.parameters.length,
      callable: true,
      minArity: signature.minArity,
      mutable: false,
      name: statement.identifier.name,
      parameterTypes: signature.parameterTypes,
      returnType: statement.returnType,
      type: 'function',
      typeParameters: statement.typeParameters,
    };

    if (signature.restParameterType !== undefined) {
      symbol.restParameterType = signature.restParameterType;
    }

    if (hasOverloads) {
      if (existing?.overloadSignatures !== undefined) {
        symbol.overloadSignatures = existing.overloadSignatures;
      }
      this.scope.replace(symbol);
    } else {
      this.scope.define(symbol, statement.identifier.location);
    }

    const previousReturnType = this.currentReturnType;
    const functionBody = statement.body;

    try {
      if (!hasOverloads) {
        this.analyzeDefaultParameters(statement.parameters, statement.identifier.name);
      }

      this.currentReturnType = statement.returnType;
      this.withScope(() => {
        this.defineParameters(statement.parameters);

        for (const bodyStatement of functionBody) {
          this.analyzeStatement(bodyStatement);
        }
      });
    } finally {
      this.currentReturnType = previousReturnType;
    }

    if (statement.returnType !== 'void' && !this.hasReturnStatement(functionBody)) {
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
    const symbol = this.scope.lookup(expression.name, expression.location);

    if (
      symbol.parameterTypes !== undefined &&
      symbol.returnType !== undefined &&
      symbol.overloadSignatures === undefined
    ) {
      return buildFunctionType(symbol.parameterTypes, symbol.returnType === 'unknown' ? 'void' : symbol.returnType);
    }

    return symbol.type;
  }

  private analyzeIfStatement(statement: IfStatement): void {
    const conditionType = this.analyzeExpression(statement.condition);
    const guards = this.extractTypeGuards(statement.condition);

    if (conditionType !== 'boolean' && conditionType !== 'unknown') {
      throw createTypeError(`If condition must be a boolean, got '${conditionType}'`);
    }

    this.withScope(() => {
      this.applyTypeGuards(guards.truthy);

      for (const bodyStatement of statement.consequent) {
        this.analyzeStatement(bodyStatement);
      }
    });

    const alternate = statement.alternate;

    if (alternate === undefined) {
      return;
    }

    if (Array.isArray(alternate)) {
      this.withScope(() => {
        this.applyTypeGuards(guards.falsy);

        for (const bodyStatement of alternate) {
          this.analyzeStatement(bodyStatement);
        }
      });

      return;
    }

    this.withScope(() => {
      this.applyTypeGuards(guards.falsy);
      this.analyzeIfStatement(alternate);
    });
  }

  private analyzeImportDeclaration(statement: ImportDeclaration): void {
    if (this.resolveImport === undefined) {
      throw createSyntaxError('Imports are not supported in this analyzer mode');
    }

    const moduleExports = this.resolveImport(statement.source.value);

    if (statement.namespaceIdentifier !== undefined) {
      this.scope.define(
        {
          callable: false,
          mutable: false,
          name: statement.namespaceIdentifier.name,
          namespaceExports: moduleExports,
          type: 'namespace',
        },
        statement.namespaceIdentifier.location
      );
    }

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

      if (exportedSymbol.enumDeclaration !== undefined) {
        importedSymbol.enumDeclaration = exportedSymbol.enumDeclaration;
      }

      if (exportedSymbol.classDeclaration !== undefined) {
        importedSymbol.classDeclaration = exportedSymbol.classDeclaration;
      }

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

      if (exportedSymbol.namespaceExports !== undefined) {
        importedSymbol.namespaceExports = exportedSymbol.namespaceExports;
      }

      this.scope.define(importedSymbol, identifier.location);
    }
  }

  private analyzeIndexExpression(expression: IndexExpression): SemanticType {
    const objectType = this.analyzeExpression(expression.object);
    const indexType = this.analyzeExpression(expression.index);

    if (indexType !== 'byte' && indexType !== 'int' && indexType !== 'unknown') {
      throw createTypeError(`Array index must be an int, got '${indexType}'`);
    }

    if (objectType === 'unknown') {
      return 'unknown';
    }

    if (objectType !== 'array' && !isArrayType(objectType)) {
      throw createTypeError(`Index access requires an array, got '${objectType}'`);
    }

    return objectType === 'array' ? 'unknown' : getArrayElementType(objectType);
  }

  private analyzeMemberExpression(expression: MemberExpression): SemanticType {
    if (expression.object.kind === 'Identifier') {
      const objectSymbol = this.scope.lookup(expression.object.name, expression.object.location);

      if (objectSymbol.namespaceExports !== undefined) {
        const exportedSymbol = objectSymbol.namespaceExports.get(expression.property.name);

        if (exportedSymbol === undefined) {
          throw createReferenceError(
            `Module namespace '${expression.object.name}' does not export '${expression.property.name}'`,
            expression.property.location
          );
        }

        return exportedSymbol.type;
      }

      if (objectSymbol.enumDeclaration !== undefined) {
        const member = this.resolveEnumMemberExpression(expression);

        return member.owner.identifier.name;
      }
    }

    const objectType = this.analyzeExpression(expression.object);

    if (expression.property.name === 'constructor' && objectType !== 'unknown') {
      return objectType;
    }

    if (objectType === 'function' || isFunctionType(objectType)) {
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
      case 'BreakStatement':
        this.analyzeBreakStatement();
        return;
      case 'ClassicForStatement':
        this.analyzeClassicForStatement(statement);
        return;
      case 'ClassDeclaration':
        this.analyzeClassDeclaration(statement);
        return;
      case 'ContinueStatement':
        this.analyzeContinueStatement();
        return;
      case 'DoWhileStatement':
        this.analyzeDoWhileStatement(statement);
        return;
      case 'EnumDeclaration':
        this.analyzeEnumDeclaration(statement);
        return;
      case 'FallthroughStatement':
        this.analyzeFallthroughStatement();
        return;
      case 'ThrowStatement':
        this.analyzeThrowStatement(statement);
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
      case 'IfStatement':
        this.analyzeIfStatement(statement);
        return;
      case 'ImportDeclaration':
        this.analyzeImportDeclaration(statement);
        return;
      case 'ReturnStatement':
        this.analyzeReturnStatement(statement);
        return;
      case 'SwitchStatement':
        this.analyzeSwitchStatement(statement);
        return;
      case 'TryStatement':
        this.analyzeTryStatement(statement);
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

  private analyzeSwitchCase(caseClause: SwitchCase, discriminantType: SemanticType, canFallthrough: boolean): void {
    const caseType = this.analyzeExpression(caseClause.test);

    if (!this.isSwitchComparableType(caseType) && caseType !== 'unknown') {
      throw createTypeError(`Switch case value must be a string, number, boolean, null, or tuple, got '${caseType}'`);
    }

    if (!canSwitchCompareTypes(discriminantType, caseType)) {
      throw createTypeError(
        `Switch case value of type '${caseType}' is not compatible with switch value of type '${discriminantType}'`
      );
    }

    this.analyzeSwitchClauseBody(caseClause.body, canFallthrough);
  }

  private analyzeSwitchClauseBody(statements: Statement[], canFallthrough: boolean): void {
    if (statements.length === 0) {
      return;
    }

    this.withScope(() => {
      for (const [index, statement] of statements.entries()) {
        if (statement.kind === 'FallthroughStatement') {
          if (index !== statements.length - 1) {
            throw createSyntaxError("'fallthrough' must be the last statement in a switch case");
          }

          if (!canFallthrough) {
            throw createSyntaxError("Cannot use 'fallthrough' in the final switch clause");
          }
        }

        const previousAllowFallthroughStatement = this.allowFallthroughStatement;
        this.allowFallthroughStatement = statement.kind === 'FallthroughStatement';

        try {
          this.analyzeStatement(statement);
        } finally {
          this.allowFallthroughStatement = previousAllowFallthroughStatement;
        }
      }
    });
  }

  private analyzeSwitchStatement(statement: SwitchStatement): void {
    const discriminantType = this.analyzeExpression(statement.discriminant);
    const hasDefault = statement.defaultBody !== undefined;

    if (!this.isSwitchComparableType(discriminantType) && discriminantType !== 'unknown') {
      throw createTypeError(
        `Switch value must be a string, number, boolean, null, or tuple, got '${discriminantType}'`
      );
    }

    for (const [index, caseClause] of statement.cases.entries()) {
      const canFallthrough = index < statement.cases.length - 1 || hasDefault;
      this.analyzeSwitchCase(caseClause, discriminantType, canFallthrough);
    }

    if (statement.defaultBody !== undefined) {
      this.analyzeSwitchClauseBody(statement.defaultBody, false);
    }
  }

  private analyzeThisExpression(): SemanticType {
    return this.requireCurrentClass('this').identifier.name;
  }

  private analyzeThrowStatement(statement: ThrowStatement): void {
    const thrownType = this.analyzeExpression(statement.value);
    const thrownClass = this.getClassDeclaration({
      kind: 'Identifier',
      location: this.getExpressionLocation(statement.value),
      name: thrownType,
    });

    if (!this.isSameOrSubclass(thrownClass, this.getErrorBaseClass())) {
      throw createTypeError(`Thrown value must extend 'Error', got '${thrownType}'`);
    }
  }

  private analyzeTryStatement(statement: TryStatement): void {
    this.validateExceptClauses(statement.exceptClauses);

    this.withScope(() => {
      for (const bodyStatement of statement.body) {
        this.analyzeStatement(bodyStatement);
      }
    });

    for (const exceptClause of statement.exceptClauses) {
      this.withScope(() => {
        this.scope.define(
          {
            callable: false,
            mutable: false,
            name: exceptClause.identifier.name,
            type: exceptClause.errorType,
          },
          exceptClause.identifier.location
        );

        for (const bodyStatement of exceptClause.body) {
          this.analyzeStatement(bodyStatement);
        }
      });
    }

    const finallyBody = statement.finallyBody;

    if (finallyBody !== undefined) {
      this.withScope(() => {
        for (const bodyStatement of finallyBody) {
          this.analyzeStatement(bodyStatement);
        }
      });
    }
  }

  private analyzeTupleLiteral(expression: TupleLiteral): SemanticType {
    return `(${expression.elements.map((element) => this.analyzeExpression(element)).join(',')})`;
  }

  private analyzeUnaryExpression(expression: UnaryExpression): SemanticType {
    const argumentType = this.analyzeExpression(expression.argument);

    if (expression.operator === '!') {
      if (argumentType !== 'boolean' && argumentType !== 'unknown') {
        throw createTypeError(`Operator '${expression.operator}' expects a boolean operand`);
      }

      return 'boolean';
    }

    if (!isNumericType(argumentType)) {
      throw createTypeError(`Operator '${expression.operator}' expects a number operand`);
    }

    return argumentType === 'byte' ? 'int' : argumentType;
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

      if (type === 'unknown') {
        throw createTypeError(
          `Cannot infer type for binding '${statement.identifier.name}' initialized with unknown value`,
          statement.identifier.location
        );
      }

      this.scope.define(
        {
          ...(this.createCallableSymbolForType(type) ?? {}),
          callable: isFunctionType(type),
          mutable: statement.declarationType === 'var',
          name: statement.identifier.name,
          type,
        },
        statement.identifier.location
      );
      return;
    }

    if (containsUnknownType(statement.typeAnnotation)) {
      throw createTypeError(
        `Binding '${statement.identifier.name}' cannot declare type 'unknown'`,
        statement.identifier.location
      );
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
        ...(this.createCallableSymbolForType(statement.typeAnnotation) ?? {}),
        callable: isFunctionType(statement.typeAnnotation),
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

    this.withLoop(() => {
      this.withScope(() => {
        for (const bodyStatement of statement.body) {
          this.analyzeStatement(bodyStatement);
        }
      });
    });
  }

  private applyTypeGuards(guards: TypeGuard[]): void {
    for (const guard of guards) {
      const symbol = this.scope.lookup(guard.identifier.name, guard.identifier.location);

      this.scope.define(
        {
          ...symbol,
          name: guard.identifier.name,
          type: guard.narrowedType,
        },
        guard.identifier.location
      );
    }
  }

  private buildAppliedGenericType(baseName: string, typeArguments: TypeName[]): TypeName {
    return typeArguments.length === 0 ? baseName : `${baseName}<${typeArguments.join(',')}>`;
  }

  private buildCallableSignature(
    parameters: Parameter[],
    returnType: SemanticType,
    typeParameters: TypeParameter[]
  ): CallableSignature {
    const restParameter = parameters.find((parameter) => parameter.rest);
    const signature: CallableSignature = {
      minArity: this.getMinimumArity(parameters),
      parameterTypes: parameters.map((parameter) => parameter.typeAnnotation),
      returnType,
      typeParameters,
    };

    if (restParameter !== undefined) {
      signature.restParameterType = restParameter.typeAnnotation;
    }

    return signature;
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

  private canAddOverloadSignature(
    existingSignature: CallableSignature,
    nextSignature: CallableSignature,
    location: Identifier['location'],
    ownerName: string
  ): void {
    if (existingSignature.returnType !== nextSignature.returnType) {
      throw createTypeError(`Overload '${ownerName}' must keep the same return type`, location);
    }

    if (existingSignature.typeParameters.length !== nextSignature.typeParameters.length) {
      throw createTypeError(`Overload '${ownerName}' must keep the same generic parameter list`, location);
    }

    const typeParametersMatch = existingSignature.typeParameters.every(
      (typeParameter, index) =>
        typeParameter.identifier.name === nextSignature.typeParameters[index]?.identifier.name &&
        typeParameter.defaultType === nextSignature.typeParameters[index]?.defaultType
    );

    if (!typeParametersMatch) {
      throw createTypeError(`Overload '${ownerName}' must keep the same generic parameter list`, location);
    }

    const sameParameters =
      existingSignature.parameterTypes.length === nextSignature.parameterTypes.length &&
      existingSignature.parameterTypes.every(
        (parameterType, index) => parameterType === nextSignature.parameterTypes[index]
      ) &&
      existingSignature.restParameterType === nextSignature.restParameterType;

    if (sameParameters) {
      throw createTypeError(`Overload '${ownerName}' already defines this signature`, location);
    }
  }

  private createCallableSymbolForType(
    type: SemanticType
  ): Pick<SemanticSymbol, 'minArity' | 'parameterTypes' | 'returnType'> | undefined {
    const functionType = typeof type === 'string' ? parseFunctionType(type) : undefined;

    if (functionType === undefined) {
      return undefined;
    }

    return {
      minArity: functionType.parameterTypes.length,
      parameterTypes: functionType.parameterTypes,
      returnType: functionType.returnType,
    };
  }

  private defineParameters(parameters: Parameter[]): void {
    for (const parameter of parameters) {
      this.scope.define(
        {
          ...(this.createCallableSymbolForType(parameter.typeAnnotation) ?? {}),
          callable: isFunctionType(parameter.typeAnnotation),
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

  private extractTypeGuards(expression: Expression): BranchTypeGuards {
    if (expression.kind === 'BinaryExpression') {
      const leftGuards = this.extractTypeGuards(expression.left);
      const rightGuards = this.extractTypeGuards(expression.right);

      if (expression.operator === '&&') {
        return {
          falsy: intersectTypeGuards(leftGuards.falsy, rightGuards.falsy),
          truthy: mergeTypeGuards(leftGuards.truthy, rightGuards.truthy),
        };
      }

      if (expression.operator === '||') {
        return {
          falsy: mergeTypeGuards(leftGuards.falsy, rightGuards.falsy),
          truthy: intersectTypeGuards(leftGuards.truthy, rightGuards.truthy),
        };
      }

      return emptyBranchTypeGuards();
    }

    if (expression.kind === 'UnaryExpression') {
      if (expression.operator !== '!') {
        return emptyBranchTypeGuards();
      }

      const argumentGuards = this.extractTypeGuards(expression.argument);

      return {
        falsy: argumentGuards.truthy,
        truthy: argumentGuards.falsy,
      };
    }

    if (expression.kind !== 'CallExpression' || expression.callee.kind !== 'Identifier') {
      return emptyBranchTypeGuards();
    }

    if (expression.callee.name === 'isType') {
      const valueArgument = expression.arguments[0];
      const typeArgument = expression.arguments[1];

      if (valueArgument?.kind !== 'Identifier' || typeArgument?.kind !== 'StringLiteral') {
        return emptyBranchTypeGuards();
      }

      const narrowedType = toSemanticTypeGuard(typeArgument.value);

      if (narrowedType === undefined) {
        return emptyBranchTypeGuards();
      }

      return {
        falsy: [],
        truthy: [
          {
            identifier: valueArgument,
            narrowedType,
          },
        ],
      };
    }

    if (expression.callee.name === 'isInstance') {
      const valueArgument = expression.arguments[0];
      const classArgument = expression.arguments[1];

      if (valueArgument?.kind !== 'Identifier' || classArgument?.kind !== 'Identifier') {
        return emptyBranchTypeGuards();
      }

      const classSymbol = this.scope.lookup(classArgument.name, classArgument.location);

      if (classSymbol.classDeclaration === undefined) {
        return emptyBranchTypeGuards();
      }

      return {
        falsy: [],
        truthy: [
          {
            identifier: valueArgument,
            narrowedType: classArgument.name,
          },
        ],
      };
    }

    return emptyBranchTypeGuards();
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

  private getDeclaredMethodImplementation(
    statement: ClassDeclaration,
    name: string,
    isStatic: boolean
  ): ClassMethod | undefined {
    return statement.members.find(
      (member): member is ClassMethod =>
        member.kind === 'ClassMethod' &&
        member.name.name === name &&
        member.static === isStatic &&
        member.body !== undefined
    );
  }

  private getDeclaredMethods(statement: ClassDeclaration, name: string, isStatic: boolean): ClassMethod[] {
    return statement.members.filter(
      (member): member is ClassMethod =>
        member.kind === 'ClassMethod' && member.name.name === name && member.static === isStatic
    );
  }

  private getErrorBaseClass(): ClassDeclaration {
    return this.getClassDeclaration({
      kind: 'Identifier',
      location: {
        column: 1,
        line: 1,
      },
      name: 'Error',
    });
  }

  private getExpressionLocation(expression: Expression): Identifier['location'] {
    switch (expression.kind) {
      case 'Identifier':
        return expression.location;
      case 'MemberExpression':
        return expression.property.location;
      case 'NewExpression':
        return expression.callee.location;
      default:
        return {
          column: 1,
          line: 1,
        };
    }
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
    const method =
      this.getDeclaredMethodImplementation(statement, name, isStatic) ??
      statement.members.find(
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

  private getMethodCallTarget(
    statement: ClassDeclaration,
    name: string,
    isStatic: boolean
  ): { implementation: ClassMethod; overloadSignatures: CallableSignature[]; owner: ClassDeclaration } | undefined {
    const declaredMethods = this.getDeclaredMethods(statement, name, isStatic);
    const implementation = declaredMethods.find((member) => member.body !== undefined);
    const overloadMembers = declaredMethods.filter(
      (member): member is ClassMethod =>
        member.kind === 'ClassMethod' && member.body === undefined && !member.virtual && !statement.virtual
    );

    if (implementation !== undefined) {
      return {
        implementation,
        overloadSignatures: overloadMembers.map((member) =>
          this.buildCallableSignature(member.parameters, member.returnType, [])
        ),
        owner: statement,
      };
    }

    if (statement.baseClass !== undefined) {
      return this.getMethodCallTarget(this.getClassDeclaration(statement.baseClass), name, isStatic);
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
        (statement.kind === 'ClassicForStatement' ||
          statement.kind === 'DoWhileStatement' ||
          statement.kind === 'IfStatement' ||
          statement.kind === 'ForStatement' ||
          statement.kind === 'WhileStatement') &&
        this.hasReturnStatement(statement.kind === 'IfStatement' ? statement.consequent : statement.body)
      ) {
        return true;
      }

      if (
        statement.kind === 'IfStatement' &&
        statement.alternate !== undefined &&
        this.hasReturnStatement(Array.isArray(statement.alternate) ? statement.alternate : [statement.alternate])
      ) {
        return true;
      }

      if (statement.kind === 'TryStatement') {
        if (this.hasReturnStatement(statement.body)) {
          return true;
        }

        if (statement.exceptClauses.some((exceptClause) => this.hasReturnStatement(exceptClause.body))) {
          return true;
        }

        if (statement.finallyBody !== undefined && this.hasReturnStatement(statement.finallyBody)) {
          return true;
        }
      }

      if (statement.kind === 'SwitchStatement') {
        if (statement.cases.some((caseClause) => this.hasReturnStatement(caseClause.body))) {
          return true;
        }

        if (statement.defaultBody !== undefined && this.hasReturnStatement(statement.defaultBody)) {
          return true;
        }
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

  private isEnumType(type: SemanticType): boolean {
    if (typeof type !== 'string') {
      return false;
    }

    const symbol = this.scope.lookupOptional(type);
    return symbol?.enumDeclaration !== undefined;
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

  private isSwitchComparableType(type: SemanticType): boolean {
    return isSwitchComparableType(type) || this.isEnumType(type);
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

  private resolveEnumMemberExpression(expression: MemberExpression): ResolvedEnumMember {
    if (expression.object.kind !== 'Identifier') {
      throw createTypeError('Enum member access requires an enum identifier', expression.property.location);
    }

    const objectSymbol = this.scope.lookup(expression.object.name, expression.object.location);
    const enumDeclaration = objectSymbol.enumDeclaration;

    if (enumDeclaration === undefined) {
      throw createTypeError(`Binding '${expression.object.name}' is not an enum`, expression.object.location);
    }

    const member = enumDeclaration.members.find((enumMember) => enumMember.name === expression.property.name);

    if (member === undefined) {
      throw createReferenceError(
        `Enum member '${expression.property.name}' is not defined`,
        expression.property.location
      );
    }

    return {
      member,
      owner: enumDeclaration,
    };
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

  private resolveOverloadSignature(
    args: Expression[],
    ownerName: string,
    signatures: CallableSignature[],
    location: Identifier['location'],
    explicitTypeArguments: TypeName[]
  ): { returnType: SemanticType; typeArguments?: Map<string, TypeName> } {
    let matched:
      | {
          returnType: SemanticType;
          typeArguments?: Map<string, TypeName>;
        }
      | undefined;

    for (const signature of signatures) {
      try {
        if (signature.typeParameters.length > 0) {
          const typeArguments = this.analyzeGenericArguments(
            args,
            signature.parameterTypes,
            signature.typeParameters,
            explicitTypeArguments,
            location,
            ownerName,
            signature.restParameterType
          ).returnTypeArguments;

          if (matched !== undefined) {
            throw createTypeError(`Call to '${ownerName}' is ambiguous`, location);
          }

          matched = {
            returnType: instantiateType(signature.returnType, typeArguments),
            typeArguments,
          };
          continue;
        }

        this.analyzeArguments(args, signature.parameterTypes, ownerName, signature.restParameterType);

        if (matched !== undefined) {
          throw createTypeError(`Call to '${ownerName}' is ambiguous`, location);
        }

        matched = {
          returnType: signature.returnType,
        };
      } catch (error) {
        if (!(error instanceof Error) || !('name' in error) || error.name !== 'TypeError') {
          throw error;
        }
      }
    }

    if (matched === undefined) {
      throw createTypeError(`No overload for '${ownerName}' matches the provided arguments`, location);
    }

    return matched;
  }

  private validateExceptClauses(exceptClauses: ExceptClause[]): void {
    const errorBaseClass = this.getErrorBaseClass();
    const seenClasses: ClassDeclaration[] = [];

    for (const exceptClause of exceptClauses) {
      const errorClass = this.getClassDeclaration({
        kind: 'Identifier',
        location: exceptClause.identifier.location,
        name: exceptClause.errorType,
      });

      if (!this.isSameOrSubclass(errorClass, errorBaseClass)) {
        throw createTypeError(
          `Except type '${exceptClause.errorType}' must extend 'Error'`,
          exceptClause.identifier.location
        );
      }

      if (seenClasses.some((seenClass) => seenClass.identifier.name === errorClass.identifier.name)) {
        throw createTypeError(
          `Except type '${exceptClause.errorType}' is already handled`,
          exceptClause.identifier.location
        );
      }

      if (seenClasses.some((seenClass) => this.isSameOrSubclass(errorClass, seenClass))) {
        throw createTypeError(
          `Except type '${exceptClause.errorType}' is unreachable because it is already covered by an earlier except`,
          exceptClause.identifier.location
        );
      }

      seenClasses.push(errorClass);
    }
  }

  private validateMethodOverloads(statement: ClassDeclaration): void {
    const groups = new Map<string, ClassMethod[]>();

    for (const member of statement.members) {
      if (member.kind !== 'ClassMethod') {
        continue;
      }

      const key = `${member.static ? 'static' : 'instance'}:${member.name.name}`;
      const group = groups.get(key) ?? [];
      group.push(member);
      groups.set(key, group);
    }

    for (const [key, group] of groups) {
      const signatures = group.filter((member) => member.body === undefined && !member.virtual && !statement.virtual);

      if (signatures.length === 0) {
        continue;
      }

      const implementation = group.find((member) => member.body !== undefined);

      if (implementation === undefined) {
        throw createTypeError(
          `Method overload '${group[0]?.name.name ?? key}' in '${statement.identifier.name}' requires an implementation`,
          group[0]?.name.location
        );
      }

      const implementationIndex = group.indexOf(implementation);

      if (group.slice(implementationIndex + 1).some((member) => member.body === undefined && !member.virtual)) {
        throw createTypeError(
          `Overload implementation '${implementation.name.name}' in '${statement.identifier.name}' must appear after all signatures`,
          implementation.name.location
        );
      }

      for (const signature of signatures) {
        if (signature.parameters.some((parameter) => parameter.defaultValue !== undefined || parameter.rest)) {
          throw createTypeError(
            `Overload '${signature.name.name}' in '${statement.identifier.name}' cannot use default or rest parameters`,
            signature.name.location
          );
        }

        if (signature.access !== implementation.access || signature.static !== implementation.static) {
          throw createTypeError(
            `Overload '${signature.name.name}' in '${statement.identifier.name}' must keep the same access and static modifier`,
            signature.name.location
          );
        }

        if (signature.returnType !== implementation.returnType) {
          throw createTypeError(
            `Overload '${signature.name.name}' in '${statement.identifier.name}' must keep the same return type`,
            signature.name.location
          );
        }
      }

      for (const [index, signature] of signatures.entries()) {
        for (const previousSignature of signatures.slice(0, index)) {
          this.canAddOverloadSignature(
            this.buildCallableSignature(previousSignature.parameters, previousSignature.returnType, []),
            this.buildCallableSignature(signature.parameters, signature.returnType, []),
            signature.name.location,
            `${statement.identifier.name}.${signature.name.name}`
          );
        }
      }

      if (implementation.parameters.some((parameter) => parameter.defaultValue !== undefined || parameter.rest)) {
        throw createTypeError(
          `Overload implementation '${implementation.name.name}' in '${statement.identifier.name}' cannot use default or rest parameters`,
          implementation.name.location
        );
      }

      if (implementation.parameters.length !== signatures[0]?.parameters.length) {
        throw createTypeError(
          `Overload implementation '${implementation.name.name}' in '${statement.identifier.name}' must keep the same parameter count`,
          implementation.name.location
        );
      }

      for (const [index, parameter] of implementation.parameters.entries()) {
        const overloadedTypes = new Set(
          signatures.map((signature) => signature.parameters[index]?.typeAnnotation ?? 'unknown')
        );
        const [expectedType] = [...overloadedTypes];

        if (overloadedTypes.size > 1 && parameter.typeAnnotation !== 'unknown') {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}.${implementation.name.name}' must use 'unknown'`,
            parameter.identifier.location
          );
        }

        if (overloadedTypes.size === 1 && parameter.typeAnnotation === 'unknown') {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}.${implementation.name.name}' cannot use 'unknown' unless the overload varies at this position`,
            parameter.identifier.location
          );
        }

        if (overloadedTypes.size === 1 && expectedType !== undefined && parameter.typeAnnotation !== expectedType) {
          throw createTypeError(
            `Parameter '${parameter.identifier.name}' in overload implementation '${statement.identifier.name}.${implementation.name.name}' must match '${expectedType}'`,
            parameter.identifier.location
          );
        }
      }
    }
  }

  private withLoop(callback: () => void): void {
    this.loopDepth += 1;

    try {
      callback();
    } finally {
      this.loopDepth -= 1;
    }
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
