export enum TokenType {
  As = 'AS',
  BangEqual = 'BANG_EQUAL',
  Comma = 'COMMA',
  EOF = 'EOF',
  EqualEqual = 'EQUAL_EQUAL',
  Equals = 'EQUALS',
  For = 'FOR',
  Greater = 'GREATER',
  GreaterEquals = 'GREATER_EQUALS',
  Identifier = 'IDENTIFIER',
  LeftBrace = 'LEFT_BRACE',
  LeftBracket = 'LEFT_BRACKET',
  LeftParen = 'LEFT_PAREN',
  Less = 'LESS',
  LessEquals = 'LESS_EQUALS',
  Minus = 'MINUS',
  MinusEquals = 'MINUS_EQUALS',
  Null = 'NULL',
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
