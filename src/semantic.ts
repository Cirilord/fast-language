import type {
  ArrayLiteral,
  AssignmentStatement,
  CallExpression,
  Expression,
  ExpressionStatement,
  Identifier,
  Program,
  Statement,
  VariableDeclaration,
} from './ast';
import { createReferenceError, createSyntaxError, createTypeError } from './errors';

type SemanticType = 'array' | 'function' | 'null' | 'number' | 'string' | 'unknown';

type SemanticSymbol = {
  callable: boolean;
  mutable: boolean;
  name: string;
  type: SemanticType;
};

class SemanticScope {
  private readonly symbols = new Map<string, SemanticSymbol>();

  public assign(name: string, type: SemanticType, location?: Identifier['location']): SemanticSymbol {
    const symbol = this.symbols.get(name);

    if (symbol === undefined) {
      throw createReferenceError(`Binding '${name}' is not defined`, location);
    }

    if (!symbol.mutable) {
      throw createTypeError(`Cannot reassign immutable binding '${name}'`, location);
    }

    symbol.type = type;
    return symbol;
  }

  public define(symbol: SemanticSymbol, location?: Identifier['location']): void {
    if (this.symbols.has(symbol.name)) {
      throw createSyntaxError(`Binding '${symbol.name}' is already defined`, location);
    }

    this.symbols.set(symbol.name, symbol);
  }

  public lookup(name: string, location?: Identifier['location']): SemanticSymbol {
    const symbol = this.symbols.get(name);

    if (symbol === undefined) {
      throw createReferenceError(`Binding '${name}' is not defined`, location);
    }

    return symbol;
  }
}

export class SemanticAnalyzer {
  private readonly scope = new SemanticScope();

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
    this.scope.assign(statement.identifier.name, type, statement.identifier.location);
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

  private analyzeExpression(expression: Expression): SemanticType {
    switch (expression.kind) {
      case 'ArrayLiteral':
        return this.analyzeArrayLiteral(expression);
      case 'CallExpression':
        return this.analyzeCallExpression(expression);
      case 'Identifier':
        return this.analyzeIdentifier(expression);
      case 'NumberLiteral':
        return this.analyzeNumberLiteral();
      case 'StringLiteral':
        return this.analyzeStringLiteral();
    }
  }

  private analyzeExpressionStatement(statement: ExpressionStatement): void {
    this.analyzeExpression(statement.expression);
  }

  private analyzeIdentifier(expression: Identifier): SemanticType {
    return this.scope.lookup(expression.name, expression.location).type;
  }

  private analyzeNumberLiteral(): SemanticType {
    return 'number';
  }

  private analyzeStatement(statement: Statement): void {
    switch (statement.kind) {
      case 'AssignmentStatement':
        this.analyzeAssignmentStatement(statement);
        return;
      case 'ExpressionStatement':
        this.analyzeExpressionStatement(statement);
        return;
      case 'VariableDeclaration':
        this.analyzeVariableDeclaration(statement);
        return;
    }
  }

  private analyzeStringLiteral(): SemanticType {
    return 'string';
  }

  private analyzeVariableDeclaration(statement: VariableDeclaration): void {
    const type = this.analyzeExpression(statement.initializer);
    this.scope.define(
      {
        callable: false,
        mutable: statement.declarationType === 'var',
        name: statement.identifier.name,
        type,
      },
      statement.identifier.location
    );
  }
}
