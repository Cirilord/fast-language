export type Program = {
  body: Statement[];
  kind: 'Program';
};

export type Statement =
  | AssignmentStatement
  | DoWhileStatement
  | ExportDeclaration
  | ExpressionStatement
  | ForStatement
  | FunctionDeclaration
  | ImportDeclaration
  | ReturnStatement
  | VariableDeclaration
  | WhileStatement;

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

export type DoWhileStatement = {
  body: Statement[];
  condition: Expression;
  kind: 'DoWhileStatement';
};

export type ExportableDeclaration = FunctionDeclaration | VariableDeclaration;

export type ExportDeclaration = {
  declaration?: ExportableDeclaration;
  identifier?: Identifier;
  kind: 'ExportDeclaration';
};

export type FunctionDeclaration = {
  body: Statement[];
  identifier: Identifier;
  kind: 'FunctionDeclaration';
  returnType: FunctionReturnType;
};

export type ImportDeclaration = {
  identifiers: Identifier[];
  kind: 'ImportDeclaration';
  source: StringLiteral;
};

export type ReturnStatement = {
  kind: 'ReturnStatement';
  value?: Expression;
};

export type VariableDeclaration = {
  declarationType: 'var' | 'val';
  identifier: Identifier;
  initializer: Expression;
  kind: 'VariableDeclaration';
  typeAnnotation?: TypeName;
};

export type WhileStatement = {
  body: Statement[];
  condition: Expression;
  kind: 'WhileStatement';
};

export type ExpressionStatement = {
  expression: Expression;
  kind: 'ExpressionStatement';
};

export type BinaryOperator = '!=' | '&&' | '%' | '*' | '+' | '-' | '/' | '<' | '<=' | '==' | '>' | '>=' | '??' | '||';

export type AssignmentOperator = '&&=' | '%=' | '*=' | '+=' | '-=' | '/=' | '=' | '??=' | '||=';

export type UnaryOperator = '-';

export type Expression =
  | ArrayLiteral
  | BinaryExpression
  | CallExpression
  | ConditionalExpression
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

export type ConditionalExpression = {
  alternate: Expression;
  consequent: Expression;
  kind: 'ConditionalExpression';
  test: Expression;
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

export type FunctionReturnType = TypeName | 'void';

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
