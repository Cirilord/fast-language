import { createSyntaxError } from './errors';
import { type Token, TokenType } from './token';
import { Char } from './utils/char';

const KEYWORDS: Record<string, TokenType> = {
  as: TokenType.As,
  for: TokenType.For,
  null: TokenType.Null,
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

      if (Char.isBang(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.BangEqual, '!=', startColumn));
          continue;
        }

        throw createSyntaxError("Unexpected character '!'. Did you mean '!='?", {
          column: startColumn,
          line: this.line,
        });
      }

      if (Char.isEquals(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.EqualEqual, '==', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Equals, char, startColumn));
        continue;
      }

      if (Char.isGreater(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.GreaterEquals, '>=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Greater, char, startColumn));
        continue;
      }

      if (Char.isLess(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.LessEquals, '<=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Less, char, startColumn));
        continue;
      }

      if (Char.isPlus(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.PlusEquals, '+=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Plus, char, startColumn));
        continue;
      }

      if (Char.isMinus(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.MinusEquals, '-=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Minus, char, startColumn));
        continue;
      }

      if (Char.isPercent(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.PercentEquals, '%=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Percent, char, startColumn));
        continue;
      }

      if (Char.isStar(char)) {
        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.StarEquals, '*=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Star, char, startColumn));
        continue;
      }

      if (Char.isSlash(char)) {
        if (Char.isSlash(this.peek())) {
          this.skipLineComment();
          continue;
        }

        if (Char.isEquals(this.peek())) {
          this.advance();
          tokens.push(this.makeToken(TokenType.SlashEquals, '/=', startColumn));
          continue;
        }

        tokens.push(this.makeToken(TokenType.Slash, char, startColumn));
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
    let hasDecimalPoint = false;

    while (!this.isAtEnd() && Char.isDigit(this.peek())) {
      lexeme += this.advance();
    }

    if (!this.isAtEnd() && Char.isDot(this.peek())) {
      hasDecimalPoint = true;
      lexeme += this.advance();

      if (this.isAtEnd() || !Char.isDigit(this.peek())) {
        throw createSyntaxError('Expected digit after decimal point in number literal', {
          column: this.column,
          line: this.line,
        });
      }

      while (!this.isAtEnd() && Char.isDigit(this.peek())) {
        lexeme += this.advance();
      }
    }

    if (this.isAtEnd() || !Char.isNumberSuffix(this.peek())) {
      throw createSyntaxError("Number literal must include a type suffix: 'i', 'f', or 'd'", {
        column: startColumn,
        line: this.line,
      });
    }

    const suffix = this.advance();

    if (suffix === 'i' && hasDecimalPoint) {
      throw createSyntaxError("Integer literal cannot include a decimal point. Use 'f' or 'd' instead", {
        column: startColumn,
        line: this.line,
      });
    }

    lexeme += suffix;

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

  private skipLineComment(): void {
    while (!this.isAtEnd() && !Char.isBreakline(this.peek())) {
      this.advance();
    }
  }
}
