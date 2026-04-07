export type Program = {
  body: Statement[];
  kind: 'Program';
};

export type Statement = AssignmentStatement | ExpressionStatement | ForStatement | VariableDeclaration;

export type SourceLocation = {
  column: number;
  line: number;
};

export type AssignmentStatement = {
  identifier: Identifier;
  kind: 'AssignmentStatement';
  value: Expression;
};

export type ForStatement = {
  body: Statement[];
  element: Identifier;
  index?: Identifier;
  iterable: Expression;
  kind: 'ForStatement';
};

export type VariableDeclaration = {
  declarationType: 'var' | 'val';
  identifier: Identifier;
  initializer: Expression;
  kind: 'VariableDeclaration';
};

export type ExpressionStatement = {
  expression: Expression;
  kind: 'ExpressionStatement';
};

export type BinaryOperator = '+' | '-' | '*' | '/';

export type Expression = ArrayLiteral | BinaryExpression | CallExpression | Identifier | NumberLiteral | StringLiteral;

export type ArrayLiteral = {
  elements: Expression[];
  kind: 'ArrayLiteral';
};

export type BinaryExpression = {
  kind: 'BinaryExpression';
  left: Expression;
  operator: BinaryOperator;
  right: Expression;
};

export type Identifier = {
  kind: 'Identifier';
  location: SourceLocation;
  name: string;
};

export type NumberLiteral = {
  kind: 'NumberLiteral';
  value: number;
};

export type StringLiteral = {
  kind: 'StringLiteral';
  value: string;
};

export type CallExpression = {
  arguments: Expression[];
  callee: Identifier;
  kind: 'CallExpression';
};
