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
  operator: AssignmentOperator;
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
  typeAnnotation: TypeName;
};

export type ExpressionStatement = {
  expression: Expression;
  kind: 'ExpressionStatement';
};

export type BinaryOperator = '!=' | '%' | '*' | '+' | '-' | '/' | '<' | '<=' | '==' | '>' | '>=';

export type AssignmentOperator = '%=' | '*=' | '+=' | '-=' | '/=' | '=';

export type UnaryOperator = '-';

export type Expression =
  | ArrayLiteral
  | BinaryExpression
  | CallExpression
  | Identifier
  | NullLiteral
  | NumberLiteral
  | StringLiteral
  | UnaryExpression;

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
  numberType: NumberLiteralType;
  value: number;
};

export type NumberLiteralType = 'double' | 'float' | 'int';

export type NullLiteral = {
  kind: 'NullLiteral';
};

export type StringLiteral = {
  kind: 'StringLiteral';
  value: string;
};

export type TypeName = 'array' | 'boolean' | 'double' | 'float' | 'int' | 'string';

export type UnaryExpression = {
  argument: Expression;
  kind: 'UnaryExpression';
  operator: UnaryOperator;
};

export type CallExpression = {
  arguments: Expression[];
  callee: Identifier;
  kind: 'CallExpression';
};
