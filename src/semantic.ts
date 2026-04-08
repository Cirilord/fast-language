import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  ClassDeclaration,
  ClassMethod,
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
  mutable: boolean;
  name: string;
  parameterTypes?: TypeName[];
  returnType?: SemanticType;
  type: SemanticType;
};

export type SemanticModuleExports = ReadonlyMap<string, SemanticSymbol>;

export type SemanticImportResolver = (source: string) => SemanticModuleExports;

function isNumericType(type: SemanticType): type is NumberLiteralType {
  return type === 'double' || type === 'float' || type === 'int';
}

function areTypesCompatible(expectedType: SemanticType, actualType: SemanticType): boolean {
  if (actualType === 'null' || actualType === 'unknown' || expectedType === actualType) {
    return true;
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
    if (args.length !== parameterTypes.length) {
      throw createTypeError(`'${calleeName}' expects ${parameterTypes.length} arguments, got ${args.length}`);
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
    for (const element of expression.elements) {
      this.analyzeExpression(element);
    }

    return 'array';
  }

  private analyzeAssignmentStatement(statement: AssignmentStatement): void {
    const type = this.analyzeExpression(statement.value);

    if (statement.target.kind === 'MemberExpression') {
      this.analyzeMemberExpression(statement.target);
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
    this.analyzeClassMembers(statement);
  }

  private analyzeClassMembers(statement: ClassDeclaration): void {
    const previousReturnType = this.currentReturnType;

    try {
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
          this.currentReturnType = 'void';
          this.withScope(() => {
            this.defineParameters(member.parameters);

            for (const bodyStatement of member.body) {
              this.analyzeStatement(bodyStatement);
            }
          });
          continue;
        }

        if (member.body === undefined) {
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
        return 'unknown';
      case 'ThisExpression':
        return 'unknown';
      case 'UnaryExpression':
        return this.analyzeUnaryExpression(expression);
    }
  }

  private analyzeExpressionStatement(statement: ExpressionStatement): void {
    this.analyzeExpression(statement.expression);
  }

  private analyzeForStatement(statement: ForStatement): void {
    const iterableType = this.analyzeExpression(statement.iterable);

    if (iterableType !== 'array' && iterableType !== 'unknown') {
      throw createTypeError('For loop iterable must be an array', statement.element.location);
    }

    this.withScope(() => {
      this.scope.define(
        {
          callable: false,
          mutable: true,
          name: statement.element.name,
          type: 'unknown',
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

      if (exportedSymbol.parameterTypes !== undefined) {
        importedSymbol.parameterTypes = exportedSymbol.parameterTypes;
      }

      this.scope.define(importedSymbol, identifier.location);
    }
  }

  private analyzeMemberExpression(expression: MemberExpression): SemanticType {
    this.analyzeExpression(expression.object);
    return 'unknown';
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

    const constructorMember = symbol.classDeclaration.members.find((member) => member.kind === 'ClassConstructor');
    const parameterTypes = constructorMember?.parameters.map((parameter) => parameter.typeAnnotation) ?? [];
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

  private ensureSingleConstructor(statement: ClassDeclaration): void {
    const constructors = statement.members.filter((member) => member.kind === 'ClassConstructor');

    if (constructors.length > 1) {
      throw createSyntaxError(
        `Class '${statement.identifier.name}' can only have one constructor`,
        statement.identifier.location
      );
    }
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
