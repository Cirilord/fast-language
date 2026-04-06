export enum TokenType {
  Comma = 'COMMA',
  EOF = 'EOF',
  Equals = 'EQUALS',
  Identifier = 'IDENTIFIER',
  LeftBracket = 'LEFT_BRACKET',
  LeftParen = 'LEFT_PAREN',
  Number = 'NUMBER',
  RightBracket = 'RIGHT_BRACKET',
  RightParen = 'RIGHT_PAREN',
  Semicolon = 'SEMICOLON',
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
