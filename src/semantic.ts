import type {
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

type SemanticSymbol = {
  callable: boolean;
  mutable: boolean;
  name: string;
};

class SemanticScope {
  private readonly symbols = new Map<string, SemanticSymbol>();

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
    });
  }

  public analyze(program: Program): void {
    for (const statement of program.body) {
      this.analyzeStatement(statement);
    }
  }

  private analyzeAssignmentStatement(statement: AssignmentStatement): void {
    const symbol = this.scope.lookup(statement.identifier.name, statement.identifier.location);

    if (!symbol.mutable) {
      throw createTypeError(
        `Cannot reassign immutable binding '${statement.identifier.name}'`,
        statement.identifier.location
      );
    }

    this.analyzeExpression(statement.value);
  }

  private analyzeCallExpression(expression: CallExpression): void {
    const callee = this.scope.lookup(expression.callee.name, expression.callee.location);

    if (!callee.callable) {
      throw createTypeError(`Binding '${expression.callee.name}' is not callable`, expression.callee.location);
    }

    for (const arg of expression.arguments) {
      this.analyzeExpression(arg);
    }
  }

  private analyzeExpression(expression: Expression): void {
    switch (expression.kind) {
      case 'CallExpression':
        this.analyzeCallExpression(expression);
        return;
      case 'Identifier':
        this.analyzeIdentifier(expression);
        return;
      case 'NumberLiteral':
        this.analyzeNumberLiteral();
        return;
      case 'StringLiteral':
        this.analyzeStringLiteral();
        return;
    }
  }

  private analyzeExpressionStatement(statement: ExpressionStatement): void {
    this.analyzeExpression(statement.expression);
  }

  private analyzeIdentifier(expression: Identifier): void {
    this.scope.lookup(expression.name, expression.location);
  }

  private analyzeNumberLiteral(): void {}

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

  private analyzeStringLiteral(): void {}

  private analyzeVariableDeclaration(statement: VariableDeclaration): void {
    this.analyzeExpression(statement.initializer);
    this.scope.define(
      {
        callable: false,
        mutable: statement.declarationType === 'var',
        name: statement.identifier.name,
      },
      statement.identifier.location
    );
  }
}
