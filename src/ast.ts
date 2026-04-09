export type Program = {
  body: Statement[];
  kind: 'Program';
};

export type Statement =
  | AssignmentStatement
  | BreakStatement
  | ClassDeclaration
  | ContinueStatement
  | DoWhileStatement
  | FallthroughStatement
  | IfStatement
  | ThrowStatement
  | ExportDeclaration
  | ExpressionStatement
  | ForStatement
  | FunctionDeclaration
  | ImportDeclaration
  | ReturnStatement
  | SwitchStatement
  | TryStatement
  | VariableDeclaration
  | WhileStatement;

export type SourceLocation = {
  column: number;
  line: number;
};

export type AssignmentStatement = {
  kind: 'AssignmentStatement';
  operator: AssignmentOperator;
  target: AssignmentTarget;
  value: Expression;
};

export type BreakStatement = {
  kind: 'BreakStatement';
};

export type AssignmentTarget = Identifier | MemberExpression;

export type AccessModifier = 'private' | 'protected' | 'public';

export type ContinueStatement = {
  kind: 'ContinueStatement';
};

export type FallthroughStatement = {
  kind: 'FallthroughStatement';
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

export type IfStatement = {
  alternate?: ElseBranch;
  condition: Expression;
  consequent: Statement[];
  kind: 'IfStatement';
};

export type ElseBranch = IfStatement | Statement[];

export type SwitchCase = {
  body: Statement[];
  kind: 'SwitchCase';
  test: Expression;
};

export type SwitchStatement = {
  cases: SwitchCase[];
  defaultBody?: Statement[];
  discriminant: Expression;
  kind: 'SwitchStatement';
};

export type ThrowStatement = {
  kind: 'ThrowStatement';
  value: Expression;
};

export type ExportableDeclaration = ClassDeclaration | FunctionDeclaration | VariableDeclaration;

export type ExportDeclaration = {
  declaration?: ExportableDeclaration;
  identifier?: Identifier;
  kind: 'ExportDeclaration';
};

export type FunctionDeclaration = {
  body?: Statement[];
  identifier: Identifier;
  kind: 'FunctionDeclaration';
  parameters: Parameter[];
  returnType: FunctionReturnType;
  typeParameters: TypeParameter[];
};

export type Parameter = {
  defaultValue?: Expression;
  identifier: Identifier;
  kind: 'Parameter';
  rest: boolean;
  typeAnnotation: TypeName;
};

export type ClassDeclaration = {
  abstract: boolean;
  baseClass?: Identifier;
  identifier: Identifier;
  implements: Identifier[];
  kind: 'ClassDeclaration';
  members: ClassMember[];
  typeParameters: TypeParameter[];
  virtual: boolean;
};

export type ClassMember = ClassConstructor | ClassMethod | ClassProperty;

export type ClassConstructor = {
  access: AccessModifier;
  body: Statement[];
  kind: 'ClassConstructor';
  parameters: Parameter[];
};

export type ClassMethod = {
  access: AccessModifier;
  body?: Statement[];
  kind: 'ClassMethod';
  name: Identifier;
  override: boolean;
  parameters: Parameter[];
  returnType: FunctionReturnType;
  static: boolean;
  virtual: boolean;
};

export type ClassProperty = {
  access: AccessModifier;
  declarationType: 'var' | 'val';
  initializer: Expression;
  kind: 'ClassProperty';
  name: Identifier;
  static: boolean;
  typeAnnotation: TypeName;
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

export type ExceptClause = {
  body: Statement[];
  errorType: TypeName;
  identifier: Identifier;
  kind: 'ExceptClause';
};

export type VariableDeclaration = {
  declarationType: 'var' | 'val';
  identifier: Identifier;
  initializer: Expression;
  kind: 'VariableDeclaration';
  typeAnnotation?: TypeName;
};

export type TypeParameter = {
  defaultType?: TypeName;
  identifier: Identifier;
  kind: 'TypeParameter';
};

export type TryStatement = {
  body: Statement[];
  exceptClauses: ExceptClause[];
  finallyBody?: Statement[];
  kind: 'TryStatement';
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

export type UnaryOperator = '!' | '-';

export type Expression =
  | ArrayLiteral
  | BinaryExpression
  | CallExpression
  | ConditionalExpression
  | Identifier
  | IndexExpression
  | MemberExpression
  | NewExpression
  | NullLiteral
  | NumberLiteral
  | StringLiteral
  | SuperExpression
  | ThisExpression
  | TupleLiteral
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

export type IndexExpression = {
  index: Expression;
  kind: 'IndexExpression';
  object: Expression;
};

export type MemberExpression = {
  kind: 'MemberExpression';
  object: Expression;
  property: Identifier;
};

export type NewExpression = {
  arguments: Expression[];
  callee: Identifier;
  kind: 'NewExpression';
  typeArguments: TypeName[];
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

export type TypeName = string;

export type FunctionReturnType = TypeName | 'void';

export type SuperExpression = {
  kind: 'SuperExpression';
};

export type ThisExpression = {
  kind: 'ThisExpression';
};

export type TupleLiteral = {
  elements: Expression[];
  kind: 'TupleLiteral';
};

export type UnaryExpression = {
  argument: Expression;
  kind: 'UnaryExpression';
  operator: UnaryOperator;
};

export type CallExpression = {
  arguments: Expression[];
  callee: Expression;
  kind: 'CallExpression';
  typeArguments: TypeName[];
};
