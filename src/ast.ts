export type Program = {
  body: Statement[];
  kind: 'Program';
};

export type Statement = VariableDeclaration | AssignmentStatement | ExpressionStatement;

export type AssignmentStatement = {
  identifier: Identifier;
  kind: 'AssignmentStatement';
  value: Expression;
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

export type Expression = Identifier | NumberLiteral | StringLiteral | CallExpression;

export type Identifier = {
  kind: 'Identifier';
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
