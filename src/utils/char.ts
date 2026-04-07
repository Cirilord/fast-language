export class Char {
  public static isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  public static isAlphaNumeric(char: string): boolean {
    return Char.isAlpha(char) || Char.isDigit(char);
  }

  public static isBacktick(char: string): boolean {
    return char === '`';
  }

  public static isBreakline(char: string): boolean {
    return char === '\n';
  }

  public static isComma(char: string): boolean {
    return char === ',';
  }

  public static isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  public static isDot(char: string): boolean {
    return char === '.';
  }

  public static isDoubleQuote(char: string): boolean {
    return char === '"';
  }

  public static isEquals(char: string): boolean {
    return char === '=';
  }

  public static isLeftBrace(char: string): boolean {
    return char === '{';
  }

  public static isLeftBracket(char: string): boolean {
    return char === '[';
  }

  public static isLeftParen(char: string): boolean {
    return char === '(';
  }

  public static isMinus(char: string): boolean {
    return char === '-';
  }

  public static isNumberSuffix(char: string): boolean {
    return char === 'i' || char === 'f' || char === 'd';
  }

  public static isPlus(char: string): boolean {
    return char === '+';
  }

  public static isRightBrace(char: string): boolean {
    return char === '}';
  }

  public static isRightBracket(char: string): boolean {
    return char === ']';
  }

  public static isRightParen(char: string): boolean {
    return char === ')';
  }

  public static isSemicolon(char: string): boolean {
    return char === ';';
  }

  public static isSlash(char: string): boolean {
    return char === '/';
  }

  public static isStar(char: string): boolean {
    return char === '*';
  }

  public static isWhitespace(char: string): boolean {
    return char === ' ' || char === '\r' || char === '\t';
  }
}
