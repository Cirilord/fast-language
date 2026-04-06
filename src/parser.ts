import type {
  AssignmentStatement,
  CallExpression,
  Expression,
  ExpressionStatement,
  Identifier,
  NumberLiteral,
  Program,
  Statement,
  StringLiteral,
  VariableDeclaration,
} from './ast';
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

  private error(token: Token, message: string): Error {
    return new Error(`${message} Found '${token.lexeme || token.type}' at line ${token.line}, column ${token.column}.`);
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

  private parseAssignmentStatement(): AssignmentStatement {
    const identifier = this.consume(TokenType.Identifier, 'Expected identifier before assignment.');

    this.consume(TokenType.Equals, "Expected '=' in assignment.");
    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after assignment.");

    return {
      identifier: {
        kind: 'Identifier',
        name: identifier.lexeme,
      },
      kind: 'AssignmentStatement',
      value,
    };
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

  private parsePrimary(): Expression {
    if (this.match(TokenType.Identifier)) {
      return {
        kind: 'Identifier',
        name: this.previous().lexeme,
      } satisfies Identifier;
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
      identifier: {
        kind: 'Identifier',
        name: name.lexeme,
      },
      initializer,
      kind: 'VariableDeclaration',
    };
  }

  private peek(): Token {
    const token = this.tokens[this.current];

    if (token === undefined) {
      throw new Error('Unexpected end of token stream while peeking.');
    }

    return token;
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];

    if (token === undefined) {
      throw new Error('Unexpected start of token stream while reading previous token.');
    }

    return token;
  }
}
