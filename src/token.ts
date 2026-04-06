export enum TokenType {
  Var = 'VAR',
  Val = 'VAL',
  Identifier = 'IDENTIFIER',
  Number = 'NUMBER',
  String = 'STRING',
  Equals = 'EQUALS',
  LeftParen = 'LEFT_PAREN',
  RightParen = 'RIGHT_PAREN',
  Semicolon = 'SEMICOLON',
  EOF = 'EOF',
}

export type Token = {
  column: number;
  lexeme: string;
  line: number;
  type: TokenType;
};
