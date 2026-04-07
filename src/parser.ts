import type {
  ArrayLiteral,
  AssignmentStatement,
  CallExpression,
  Expression,
  ExpressionStatement,
  ForStatement,
  Identifier,
  NumberLiteral,
  Program,
  Statement,
  StringLiteral,
  VariableDeclaration,
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

  private checkNext(type: TokenType): boolean {
    const token = this.tokens[this.current + 1];
    return token?.type === type;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
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

  private error(token: Token, message: string): Error {
    return createSyntaxError(`${message} Found '${token.lexeme || token.type}'`, {
      column: token.column,
      line: token.line,
    });
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

    this.consume(TokenType.Equals, "Expected '=' in assignment.");
    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after assignment.");

    return {
      identifier: this.createIdentifier(identifier),
      kind: 'AssignmentStatement',
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

  private parseExpression(): Expression {
    return this.parseCallExpression();
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

  private parsePrimary(): Expression {
    if (this.match(TokenType.LeftBracket)) {
      return this.parseArrayLiteral();
    }

    if (this.match(TokenType.Identifier)) {
      return this.createIdentifier(this.previous());
    }

    if (this.match(TokenType.Number)) {
      return {
        kind: 'NumberLiteral',
        value: Number(this.previous().lexeme),
      } satisfies NumberLiteral;
    }

    if (this.match(TokenType.String)) {
      return {
        kind: 'StringLiteral',
        value: this.previous().lexeme,
      } satisfies StringLiteral;
    }

    throw this.error(this.peek(), 'Expected expression.');
  }

  private parseStatement(): Statement {
    if (this.match(TokenType.Var)) {
      return this.parseVariableDeclaration('var');
    }

    if (this.match(TokenType.Val)) {
      return this.parseVariableDeclaration('val');
    }

    if (this.match(TokenType.For)) {
      return this.parseForStatement();
    }

    if (this.check(TokenType.Identifier) && this.checkNext(TokenType.Equals)) {
      return this.parseAssignmentStatement();
    }

    const expression = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after expression.");

    return {
      expression,
      kind: 'ExpressionStatement',
    } satisfies ExpressionStatement;
  }

  private parseVariableDeclaration(declarationType: 'var' | 'val'): VariableDeclaration {
    const name = this.consume(TokenType.Identifier, `Expected identifier after '${declarationType}'.`);

    this.consume(TokenType.Equals, "Expected '=' after variable name.");
    const initializer = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after variable declaration.");

    return {
      declarationType,
      identifier: this.createIdentifier(name),
      initializer,
      kind: 'VariableDeclaration',
    };
  }

  private peek(): Token {
    const token = this.tokens[this.current];

    if (token === undefined) {
      throw createSyntaxError('Unexpected end of token stream while peeking');
    }

    return token;
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];

    if (token === undefined) {
      throw createSyntaxError('Unexpected start of token stream while reading previous token');
    }

    return token;
  }
}
