import { type Token, TokenType } from './token';
import { Char } from './utils/char';

const KEYWORDS: Record<string, TokenType> = {
  for: TokenType.For,
  of: TokenType.Of,
  val: TokenType.Val,
  var: TokenType.Var,
};

export class Lexer {
  private column = 1;
  private current = 0;
  private line = 1;

  public constructor(private readonly source: string) {}

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const startColumn = this.column;
      const char = this.advance();

      if (Char.isWhitespace(char)) {
        continue;
      }

      if (Char.isBreakline(char)) {
        this.line += 1;
        this.column = 1;
        continue;
      }

      if (Char.isEquals(char)) {
        tokens.push(this.makeToken(TokenType.Equals, char, startColumn));
        continue;
      }

      if (Char.isComma(char)) {
        tokens.push(this.makeToken(TokenType.Comma, char, startColumn));
        continue;
      }

      if (Char.isLeftBracket(char)) {
        tokens.push(this.makeToken(TokenType.LeftBracket, char, startColumn));
        continue;
      }

      if (Char.isLeftBrace(char)) {
        tokens.push(this.makeToken(TokenType.LeftBrace, char, startColumn));
        continue;
      }

      if (Char.isRightBracket(char)) {
        tokens.push(this.makeToken(TokenType.RightBracket, char, startColumn));
        continue;
      }

      if (Char.isRightBrace(char)) {
        tokens.push(this.makeToken(TokenType.RightBrace, char, startColumn));
        continue;
      }

      if (Char.isLeftParen(char)) {
        tokens.push(this.makeToken(TokenType.LeftParen, char, startColumn));
        continue;
      }

      if (Char.isRightParen(char)) {
        tokens.push(this.makeToken(TokenType.RightParen, char, startColumn));
        continue;
      }

      if (Char.isSemicolon(char)) {
        tokens.push(this.makeToken(TokenType.Semicolon, char, startColumn));
        continue;
      }

      if (Char.isDoubleQuote(char)) {
        tokens.push(this.readString(char, startColumn, false));
        continue;
      }

      if (Char.isBacktick(char)) {
        tokens.push(this.readString(char, startColumn, true));
        continue;
      }

      if (Char.isDigit(char)) {
        tokens.push(this.readNumber(char, startColumn));
        continue;
      }

      if (Char.isAlpha(char)) {
        tokens.push(this.readIdentifier(char, startColumn));
        continue;
      }

      throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${startColumn}`);
    }

    tokens.push({
      type: TokenType.EOF,
      lexeme: '',
      line: this.line,
      column: this.column,
    });

    return tokens;
  }

  private advance(): string {
    const char = this.source[this.current];

    if (char === undefined) {
      throw new Error('Unexpected end of source while advancing lexer.');
    }

    this.current += 1;
    this.column += 1;
    return char;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private makeToken(type: TokenType, lexeme: string, column: number): Token {
    return {
      type,
      lexeme,
      line: this.line,
      column,
    };
  }

  private peek(): string {
    return this.source[this.current] ?? '\0';
  }

  private readIdentifier(firstChar: string, startColumn: number): Token {
    let lexeme = firstChar;

    while (!this.isAtEnd() && Char.isAlphaNumeric(this.peek())) {
      lexeme += this.advance();
    }

    const type = KEYWORDS[lexeme] ?? TokenType.Identifier;
    return this.makeToken(type, lexeme, startColumn);
  }

  private readNumber(firstChar: string, startColumn: number): Token {
    let lexeme = firstChar;

    while (!this.isAtEnd() && Char.isDigit(this.peek())) {
      lexeme += this.advance();
    }

    return this.makeToken(TokenType.Number, lexeme, startColumn);
  }

  private readString(quote: string, startColumn: number, allowMultiline: boolean): Token {
    let lexeme = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      const char = this.advance();

      if (Char.isBreakline(char) && !allowMultiline) {
        throw new Error(`Unterminated string at line ${this.line}, column ${startColumn}`);
      }

      if (Char.isBreakline(char) && allowMultiline) {
        this.line += 1;
        this.column = 1;
      }

      lexeme += char;
    }

    if (this.isAtEnd()) {
      throw new Error(`Unterminated string at line ${this.line}, column ${startColumn}`);
    }

    this.advance();
    return this.makeToken(TokenType.String, lexeme, startColumn);
  }
}
