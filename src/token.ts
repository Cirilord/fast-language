export enum TokenType {
  Comma = 'COMMA',
  EOF = 'EOF',
  Equals = 'EQUALS',
  For = 'FOR',
  Identifier = 'IDENTIFIER',
  LeftBrace = 'LEFT_BRACE',
  LeftBracket = 'LEFT_BRACKET',
  LeftParen = 'LEFT_PAREN',
  Minus = 'MINUS',
  MinusEquals = 'MINUS_EQUALS',
  Number = 'NUMBER',
  Of = 'OF',
  Percent = 'PERCENT',
  PercentEquals = 'PERCENT_EQUALS',
  Plus = 'PLUS',
  PlusEquals = 'PLUS_EQUALS',
  RightBrace = 'RIGHT_BRACE',
  RightBracket = 'RIGHT_BRACKET',
  RightParen = 'RIGHT_PAREN',
  Semicolon = 'SEMICOLON',
  Slash = 'SLASH',
  SlashEquals = 'SLASH_EQUALS',
  Star = 'STAR',
  StarEquals = 'STAR_EQUALS',
  String = 'STRING',
  Val = 'VAL',
  Var = 'VAR',
}

export type Token = {
  column: number;
  lexeme: string;
  line: number;
  type: TokenType;
};
