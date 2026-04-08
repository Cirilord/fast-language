import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CallExpression,
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
  NullLiteral,
  NumberLiteral,
  Program,
  ReturnStatement,
  Statement,
  StringLiteral,
  TypeName,
  UnaryExpression,
  UnaryOperator,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { createSyntaxError } from './errors';
import { TokenType, type Token } from './token';

export class Parser {
  private current = 0;

  public constructor(private readonly tokens: Token[]) {}

  public parseProgram(): Program {
    const body: Statement[] = [];

    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    return {
      body,
      kind: 'Program',
    };
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current += 1;
    }

    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return type === TokenType.EOF;
    }

    return this.peek().type === type;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
  }

  private consumeAssignmentOperator(): Token {
    if (this.isAssignmentOperatorToken(this.peek().type)) {
      return this.advance();
    }

    throw this.error(this.peek(), 'Expected assignment operator.');
  }

  private createIdentifier(token: Token): Identifier {
    return {
      kind: 'Identifier',
      location: {
        column: token.column,
        line: token.line,
      },
      name: token.lexeme,
    };
  }

  private createNumberLiteral(token: Token): NumberLiteral {
    return {
      kind: 'NumberLiteral',
      numberType: token.lexeme.includes('.') ? 'double' : 'int',
      value: Number(token.lexeme),
    };
  }

  private error(token: Token, message: string): Error {
    return createSyntaxError(`${message} Found '${token.lexeme || token.type}'`, {
      column: token.column,
      line: token.line,
    });
  }

  private getFunctionReturnType(token: Token): FunctionReturnType {
    if (token.lexeme === 'void') {
      return 'void';
    }

    return this.getTypeName(token);
  }

  private getTypeName(token: Token): TypeName {
    switch (token.lexeme) {
      case 'array':
        return 'array';
      case 'boolean':
        return 'boolean';
      case 'double':
        return 'double';
      case 'float':
        return 'float';
      case 'int':
        return 'int';
      case 'string':
        return 'string';
      default:
        throw this.error(token, 'Expected a valid type name.');
    }
  }

  private isAssignmentOperatorToken(type: TokenType): boolean {
    return (
      type === TokenType.Equals ||
      type === TokenType.PlusEquals ||
      type === TokenType.MinusEquals ||
      type === TokenType.StarEquals ||
      type === TokenType.SlashEquals ||
      type === TokenType.PercentEquals ||
      type === TokenType.AmpersandAmpersandEquals ||
      type === TokenType.PipePipeEquals ||
      type === TokenType.QuestionQuestionEquals
    );
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private parseArrayLiteral(): ArrayLiteral {
    const elements: Expression[] = [];

    if (!this.check(TokenType.RightBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RightBracket));
    }

    this.consume(TokenType.RightBracket, "Expected ']' after array elements.");

    return {
      elements,
      kind: 'ArrayLiteral',
    };
  }

  private parseAssignmentStatement(): AssignmentStatement {
    const identifier = this.consume(TokenType.Identifier, 'Expected identifier before assignment.');
    const operator = this.consumeAssignmentOperator();

    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after assignment.");

    return {
      identifier: this.createIdentifier(identifier),
      kind: 'AssignmentStatement',
      operator: operator.lexeme as AssignmentOperator,
      value,
    };
  }

  private parseBlockStatement(): Statement[] {
    this.consume(TokenType.LeftBrace, "Expected '{' before block.");
    const body: Statement[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    this.consume(TokenType.RightBrace, "Expected '}' after block.");
    return body;
  }

  private parseCallExpression(): Expression {
    const expression = this.parsePrimary();

    if (!this.match(TokenType.LeftParen)) {
      return expression;
    }

    if (expression.kind !== 'Identifier') {
      throw this.error(this.previous(), 'Only identifiers can be called as functions.');
    }

    const args: Expression[] = [];

    if (!this.check(TokenType.RightParen)) {
      args.push(this.parseExpression());
    }

    this.consume(TokenType.RightParen, "Expected ')' after function arguments.");

    return {
      arguments: args,
      callee: expression,
      kind: 'CallExpression',
    } satisfies CallExpression;
  }

  private parseComparison(): Expression {
    let expression = this.parseTerm();

    while (this.match(TokenType.Greater, TokenType.GreaterEquals, TokenType.Less, TokenType.LessEquals)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseTerm();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseConditionalExpression(): Expression {
    const test = this.parseNullishCoalescing();

    if (!this.match(TokenType.Question)) {
      return test;
    }

    const consequent = this.parseExpression();
    this.consume(TokenType.Colon, "Expected ':' after ternary consequent.");
    const alternate = this.parseExpression();

    return {
      alternate,
      consequent,
      kind: 'ConditionalExpression',
      test,
    } satisfies ConditionalExpression;
  }

  private parseDoWhileStatement(): DoWhileStatement {
    const body = this.parseBlockStatement();

    this.consume(TokenType.While, "Expected 'while' after do block.");
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'.");
    const condition = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after do while condition.");
    this.consume(TokenType.Semicolon, "Expected ';' after do while statement.");

    return {
      body,
      condition,
      kind: 'DoWhileStatement',
    };
  }

  private parseEquality(): Expression {
    let expression = this.parseComparison();

    while (this.match(TokenType.EqualEqual, TokenType.BangEqual)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseComparison();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseExportDeclaration(): ExportDeclaration {
    if (this.match(TokenType.Var)) {
      return {
        declaration: this.parseVariableDeclaration('var'),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Val)) {
      return {
        declaration: this.parseVariableDeclaration('val'),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Function)) {
      return {
        declaration: this.parseFunctionDeclaration(),
        kind: 'ExportDeclaration',
      };
    }

    const identifier = this.consume(TokenType.Identifier, "Expected exported binding name after 'export'.");
    this.consume(TokenType.Semicolon, "Expected ';' after export declaration.");

    return {
      identifier: this.createIdentifier(identifier),
      kind: 'ExportDeclaration',
    };
  }

  private parseExpression(): Expression {
    return this.parseConditionalExpression();
  }

  private parseFactor(): Expression {
    let expression = this.parseUnaryExpression();

    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseUnaryExpression();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseForStatement(): ForStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'for'.");
    this.consume(TokenType.Var, "Expected 'var' in for loop declaration.");
    const element = this.consume(TokenType.Identifier, 'Expected element identifier in for loop.');
    const index = this.match(TokenType.Comma)
      ? this.consume(TokenType.Identifier, "Expected index identifier after ','.")
      : null;

    this.consume(TokenType.Of, "Expected 'of' in for loop.");
    const iterable = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after for loop declaration.");

    const forStatement: ForStatement = {
      body: this.parseBlockStatement(),
      element: this.createIdentifier(element),
      iterable,
      kind: 'ForStatement',
    };

    if (index !== null) {
      forStatement.index = this.createIdentifier(index);
    }

    return forStatement;
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const name = this.consume(TokenType.Identifier, "Expected function name after 'function'.");
    this.consume(TokenType.LeftParen, "Expected '(' after function name.");
    this.consume(TokenType.RightParen, "Expected ')' after function parameters.");
    this.consume(TokenType.Colon, "Expected ':' after function parameters.");
    const returnType = this.consume(TokenType.Identifier, "Expected return type after ':'.");

    return {
      body: this.parseBlockStatement(),
      identifier: this.createIdentifier(name),
      kind: 'FunctionDeclaration',
      returnType: this.getFunctionReturnType(returnType),
    };
  }

  private parseImportDeclaration(): ImportDeclaration {
    this.consume(TokenType.LeftBrace, "Expected '{' after 'import'.");
    const identifiers: Identifier[] = [];

    do {
      const identifier = this.consume(TokenType.Identifier, 'Expected imported binding name.');
      identifiers.push(this.createIdentifier(identifier));
    } while (this.match(TokenType.Comma) && !this.check(TokenType.RightBrace));

    this.consume(TokenType.RightBrace, "Expected '}' after imported binding list.");
    this.consume(TokenType.From, "Expected 'from' after imported binding list.");
    const source = this.consume(TokenType.String, "Expected module path string after 'from'.");
    this.consume(TokenType.Semicolon, "Expected ';' after import declaration.");

    return {
      identifiers,
      kind: 'ImportDeclaration',
      source: {
        kind: 'StringLiteral',
        value: source.lexeme,
      },
    };
  }

  private parseLogicalAnd(): Expression {
    let expression = this.parseEquality();

    while (this.match(TokenType.AmpersandAmpersand)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseEquality();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseLogicalOr(): Expression {
    let expression = this.parseLogicalAnd();

    while (this.match(TokenType.PipePipe)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseLogicalAnd();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseNullLiteral(): NullLiteral {
    return {
      kind: 'NullLiteral',
    };
  }

  private parseNullishCoalescing(): Expression {
    let expression = this.parseLogicalOr();

    while (this.match(TokenType.QuestionQuestion)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseLogicalOr();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parsePrimary(): Expression {
    if (this.match(TokenType.LeftParen)) {
      const expression = this.parseExpression();
      this.consume(TokenType.RightParen, "Expected ')' after grouped expression.");
      return expression;
    }

    if (this.match(TokenType.LeftBracket)) {
      return this.parseArrayLiteral();
    }

    if (this.match(TokenType.Identifier)) {
      return this.createIdentifier(this.previous());
    }

    if (this.match(TokenType.Number)) {
      return this.createNumberLiteral(this.previous());
    }

    if (this.match(TokenType.Null)) {
      return this.parseNullLiteral();
    }

    if (this.match(TokenType.String)) {
      return {
        kind: 'StringLiteral',
        value: this.previous().lexeme,
      } satisfies StringLiteral;
    }

    throw this.error(this.peek(), 'Expected expression.');
  }

  private parseReturnStatement(): ReturnStatement {
    if (this.match(TokenType.Semicolon)) {
      return {
        kind: 'ReturnStatement',
      };
    }

    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after return value.");

    return {
      kind: 'ReturnStatement',
      value,
    };
  }

  private parseStatement(): Statement {
    if (this.match(TokenType.Import)) {
      return this.parseImportDeclaration();
    }

    if (this.match(TokenType.Export)) {
      return this.parseExportDeclaration();
    }

    if (this.match(TokenType.Var)) {
      return this.parseVariableDeclaration('var');
    }

    if (this.match(TokenType.Val)) {
      return this.parseVariableDeclaration('val');
    }

    if (this.match(TokenType.For)) {
      return this.parseForStatement();
    }

    if (this.match(TokenType.Do)) {
      return this.parseDoWhileStatement();
    }

    if (this.match(TokenType.Function)) {
      return this.parseFunctionDeclaration();
    }

    if (this.match(TokenType.Return)) {
      return this.parseReturnStatement();
    }

    if (this.match(TokenType.While)) {
      return this.parseWhileStatement();
    }

    if (this.check(TokenType.Identifier) && this.isAssignmentOperatorToken(this.peekNext().type)) {
      return this.parseAssignmentStatement();
    }

    const expression = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after expression.");

    return {
      expression,
      kind: 'ExpressionStatement',
    } satisfies ExpressionStatement;
  }

  private parseTerm(): Expression {
    let expression = this.parseFactor();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseFactor();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseUnaryExpression(): Expression {
    if (this.match(TokenType.Minus)) {
      const operator = this.previous().lexeme as UnaryOperator;

      return {
        argument: this.parseUnaryExpression(),
        kind: 'UnaryExpression',
        operator,
      } satisfies UnaryExpression;
    }

    return this.parseCallExpression();
  }

  private parseVariableDeclaration(declarationType: 'var' | 'val'): VariableDeclaration {
    const name = this.consume(TokenType.Identifier, `Expected identifier after '${declarationType}'.`);
    const type = this.match(TokenType.Colon)
      ? this.consume(TokenType.Identifier, "Expected type name after ':'.")
      : undefined;

    this.consume(TokenType.Equals, "Expected '=' after variable name.");
    const initializer = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after variable declaration.");

    const declaration: VariableDeclaration = {
      declarationType,
      identifier: this.createIdentifier(name),
      initializer,
      kind: 'VariableDeclaration',
    };

    if (type !== undefined) {
      declaration.typeAnnotation = this.getTypeName(type);
    }

    return declaration;
  }

  private parseWhileStatement(): WhileStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'.");
    const condition = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after while condition.");

    return {
      body: this.parseBlockStatement(),
      condition,
      kind: 'WhileStatement',
    };
  }

  private peek(): Token {
    const token = this.tokens[this.current];

    if (token === undefined) {
      throw createSyntaxError('Unexpected end of token stream while peeking');
    }

    return token;
  }

  private peekNext(): Token {
    return this.tokens[this.current + 1] ?? this.peek();
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];

    if (token === undefined) {
      throw createSyntaxError('Unexpected start of token stream while reading previous token');
    }

    return token;
  }
}
