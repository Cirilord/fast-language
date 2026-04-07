import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
  DoWhileStatement,
  Expression,
  ExpressionStatement,
  ForStatement,
  Identifier,
  NumberLiteral,
  NumberLiteralType,
  Program,
  Statement,
  TypeName,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { createReferenceError, createSyntaxError, createTypeError } from './errors';

type SemanticType = 'function' | 'null' | TypeName | 'unknown';

type SemanticSymbol = {
  callable: boolean;
  mutable: boolean;
  name: string;
  type: SemanticType;
};

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
  private scope = new SemanticScope();

  public constructor() {
    this.scope.define({
      callable: true,
      mutable: false,
      name: 'print',
      type: 'function',
    });
  }

  public analyze(program: Program): void {
    for (const statement of program.body) {
      this.analyzeStatement(statement);
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
    const symbol = this.scope.lookup(statement.identifier.name, statement.identifier.location);

    if (statement.operator === '=') {
      if (!areTypesCompatible(symbol.type, type)) {
        throw createTypeError(
          `Cannot assign value of type '${type}' to binding '${statement.identifier.name}' of type '${symbol.type}'`,
          statement.identifier.location
        );
      }

      this.scope.assign(statement.identifier.name, statement.identifier.location);
      return;
    }

    if (statement.operator === '??=') {
      if (!areTypesCompatible(symbol.type, type)) {
        throw createTypeError(
          `Cannot assign value of type '${type}' to binding '${statement.identifier.name}' of type '${symbol.type}'`,
          statement.identifier.location
        );
      }

      this.scope.assign(statement.identifier.name, statement.identifier.location);
      return;
    }

    if (statement.operator === '&&=' || statement.operator === '||=') {
      if (symbol.type !== 'boolean' || (type !== 'boolean' && type !== 'unknown')) {
        throw createTypeError(
          `Operator '${statement.operator}' expects boolean operands`,
          statement.identifier.location
        );
      }

      this.scope.assign(statement.identifier.name, statement.identifier.location);
      return;
    }

    if (!symbol.mutable) {
      throw createTypeError(
        `Cannot reassign immutable binding '${statement.identifier.name}'`,
        statement.identifier.location
      );
    }

    if (!isNumericType(symbol.type) || !isNumericType(type)) {
      throw createTypeError(`Operator '${statement.operator}' expects number operands`, statement.identifier.location);
    }

    toBinaryOperator(statement.operator);
    this.scope.assign(statement.identifier.name, statement.identifier.location);
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
    const callee = this.scope.lookup(expression.callee.name, expression.callee.location);

    if (!callee.callable) {
      throw createTypeError(`Binding '${expression.callee.name}' is not callable`, expression.callee.location);
    }

    for (const arg of expression.arguments) {
      this.analyzeExpression(arg);
    }

    return 'unknown';
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

  private analyzeExpression(expression: Expression): SemanticType {
    switch (expression.kind) {
      case 'ArrayLiteral':
        return this.analyzeArrayLiteral(expression);
      case 'BinaryExpression':
        return this.analyzeBinaryExpression(expression);
      case 'CallExpression':
        return this.analyzeCallExpression(expression);
      case 'Identifier':
        return this.analyzeIdentifier(expression);
      case 'NumberLiteral':
        return this.analyzeNumberLiteral(expression);
      case 'NullLiteral':
        return this.analyzeNullLiteral();
      case 'StringLiteral':
        return this.analyzeStringLiteral();
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

  private analyzeIdentifier(expression: Identifier): SemanticType {
    return this.scope.lookup(expression.name, expression.location).type;
  }

  private analyzeNullLiteral(): SemanticType {
    return 'null';
  }

  private analyzeNumberLiteral(expression: NumberLiteral): SemanticType {
    return expression.numberType;
  }

  private analyzeStatement(statement: Statement): void {
    switch (statement.kind) {
      case 'AssignmentStatement':
        this.analyzeAssignmentStatement(statement);
        return;
      case 'DoWhileStatement':
        this.analyzeDoWhileStatement(statement);
        return;
      case 'ExpressionStatement':
        this.analyzeExpressionStatement(statement);
        return;
      case 'ForStatement':
        this.analyzeForStatement(statement);
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

    if (!areTypesCompatible(statement.typeAnnotation, type)) {
      throw createTypeError(
        `Cannot initialize binding '${statement.identifier.name}' of type '${statement.typeAnnotation}' with value of type '${type}'`,
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
