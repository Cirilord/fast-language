import type {
  ArrayLiteral,
  AssignmentOperator,
  AssignmentStatement,
  AssignmentTarget,
  BinaryExpression,
  BinaryOperator,
  BreakStatement,
  CallExpression,
  ClassConstructor,
  ClassDeclaration,
  ClassMember,
  ClassMethod,
  ClassProperty,
  ConditionalExpression,
  ContinueStatement,
  DoWhileStatement,
  ExceptClause,
  ExportDeclaration,
  Expression,
  ExpressionStatement,
  ForStatement,
  FunctionDeclaration,
  FunctionReturnType,
  Identifier,
  IndexExpression,
  IfStatement,
  ImportDeclaration,
  MemberExpression,
  NewExpression,
  NullLiteral,
  NumberLiteral,
  Parameter,
  Program,
  ReturnStatement,
  Statement,
  StringLiteral,
  ThrowStatement,
  TryStatement,
  TupleLiteral,
  TypeName,
  TypeParameter,
  UnaryExpression,
  UnaryOperator,
  VariableDeclaration,
  WhileStatement,
} from './ast';
import { createSyntaxError } from './errors';
import { TokenType, type Token } from './token';

export class Parser {
  private current = 0;

  public constructor(private readonly tokens: Token[]) {}

  public parseProgram(): Program {
    const body: Statement[] = [];

    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    return {
      body,
      kind: 'Program',
    };
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current += 1;
    }

    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return type === TokenType.EOF;
    }

    return this.peek().type === type;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
  }

  private consumeAssignmentOperator(): Token {
    if (this.isAssignmentOperatorToken(this.peek().type)) {
      return this.advance();
    }

    throw this.error(this.peek(), 'Expected assignment operator.');
  }

  private createIdentifier(token: Token): Identifier {
    return {
      kind: 'Identifier',
      location: {
        column: token.column,
        line: token.line,
      },
      name: token.lexeme,
    };
  }

  private createNumberLiteral(token: Token): NumberLiteral {
    return {
      kind: 'NumberLiteral',
      numberType: token.lexeme.includes('.') ? 'double' : 'int',
      value: Number(token.lexeme),
    };
  }

  private error(token: Token, message: string): Error {
    return createSyntaxError(`${message} Found '${token.lexeme || token.type}'`, {
      column: token.column,
      line: token.line,
    });
  }

  private getTypeName(typeName: string): TypeName {
    if (typeName === 'void') {
      throw createSyntaxError("'void' can only be used as a function return type.");
    }

    return typeName;
  }

  private isAssignmentOperatorToken(type: TokenType): boolean {
    return (
      type === TokenType.Equals ||
      type === TokenType.PlusEquals ||
      type === TokenType.MinusEquals ||
      type === TokenType.StarEquals ||
      type === TokenType.SlashEquals ||
      type === TokenType.PercentEquals ||
      type === TokenType.AmpersandAmpersandEquals ||
      type === TokenType.PipePipeEquals ||
      type === TokenType.QuestionQuestionEquals
    );
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private parseAccessModifier(): ClassMember['access'] {
    if (this.match(TokenType.Public)) {
      return 'public';
    }

    if (this.match(TokenType.Protected)) {
      return 'protected';
    }

    if (this.match(TokenType.Private)) {
      return 'private';
    }

    throw this.error(this.peek(), 'Expected access modifier for class member.');
  }

  private parseArguments(): Expression[] {
    const args: Expression[] = [];

    if (!this.check(TokenType.RightParen)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RightParen));
    }

    this.consume(TokenType.RightParen, "Expected ')' after arguments.");
    return args;
  }

  private parseArrayLiteral(): ArrayLiteral {
    const elements: Expression[] = [];

    if (!this.check(TokenType.RightBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RightBracket));
    }

    this.consume(TokenType.RightBracket, "Expected ']' after array elements.");

    return {
      elements,
      kind: 'ArrayLiteral',
    };
  }

  private parseAssignmentStatement(target: AssignmentTarget): AssignmentStatement {
    const operator = this.consumeAssignmentOperator();

    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after assignment.");

    return {
      kind: 'AssignmentStatement',
      operator: operator.lexeme as AssignmentOperator,
      target,
      value,
    };
  }

  private parseBlockStatement(): Statement[] {
    this.consume(TokenType.LeftBrace, "Expected '{' before block.");
    const body: Statement[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    this.consume(TokenType.RightBrace, "Expected '}' after block.");
    return body;
  }

  private parseBreakStatement(): BreakStatement {
    this.consume(TokenType.Semicolon, "Expected ';' after break.");

    return {
      kind: 'BreakStatement',
    };
  }

  private parseCallExpression(): Expression {
    let expression = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.Dot)) {
        let property: Token;

        if (this.match(TokenType.Identifier, TokenType.Constructor)) {
          property = this.previous();
        } else {
          throw this.error(this.peek(), "Expected property name after '.'.");
        }

        expression = {
          kind: 'MemberExpression',
          object: expression,
          property: this.createIdentifier(property),
        } satisfies MemberExpression;
        continue;
      }

      if (this.match(TokenType.LeftBracket)) {
        expression = {
          index: this.parseExpression(),
          kind: 'IndexExpression',
          object: expression,
        } satisfies IndexExpression;
        this.consume(TokenType.RightBracket, "Expected ']' after index expression.");
        continue;
      }

      const typeArguments = this.tryParseTypeArguments() ?? [];

      if (this.match(TokenType.LeftParen)) {
        expression = {
          arguments: this.parseArguments(),
          callee: expression,
          kind: 'CallExpression',
          typeArguments,
        } satisfies CallExpression;
        continue;
      }

      return expression;
    }
  }

  private parseClassDeclaration(isAbstract: boolean): ClassDeclaration {
    const isVirtual = isAbstract && this.match(TokenType.Virtual);

    if (isAbstract) {
      this.consume(TokenType.Class, "Expected 'class' after 'abstract'.");
    }

    const name = this.consume(TokenType.Identifier, 'Expected class name.');
    const declaration: ClassDeclaration = {
      abstract: isAbstract,
      implements: [],
      identifier: this.createIdentifier(name),
      kind: 'ClassDeclaration',
      members: [],
      typeParameters: this.parseTypeParameters(),
      virtual: isVirtual,
    };

    if (this.match(TokenType.Extends)) {
      declaration.baseClass = this.createIdentifier(
        this.consume(TokenType.Identifier, "Expected class name after 'extends'.")
      );
    }

    if (this.match(TokenType.Implements)) {
      do {
        declaration.implements.push(
          this.createIdentifier(this.consume(TokenType.Identifier, "Expected class name after 'implements'."))
        );
      } while (this.match(TokenType.Comma));
    }

    this.consume(TokenType.LeftBrace, "Expected '{' before class body.");

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      declaration.members.push(this.parseClassMember(isVirtual));
    }

    this.consume(TokenType.RightBrace, "Expected '}' after class body.");
    return declaration;
  }

  private parseClassMember(classIsVirtual: boolean): ClassMember {
    const access = this.parseAccessModifier();
    const isStatic = this.match(TokenType.Static);

    if (this.match(TokenType.Constructor)) {
      if (isStatic) {
        throw this.error(this.previous(), 'Constructors cannot be static.');
      }

      this.consume(TokenType.LeftParen, "Expected '(' after constructor.");
      const parameters = this.parseParameters();

      return {
        access,
        body: this.parseBlockStatement(),
        kind: 'ClassConstructor',
        parameters,
      } satisfies ClassConstructor;
    }

    if (this.match(TokenType.Var, TokenType.Val)) {
      const declarationType = this.previous().lexeme as 'var' | 'val';
      const name = this.consume(TokenType.Identifier, 'Expected property name.');
      this.consume(TokenType.Colon, "Expected ':' after property name.");
      const typeAnnotation = this.parseTypeName();
      this.consume(TokenType.Equals, "Expected '=' after property type.");
      const initializer = this.parseExpression();
      this.consume(TokenType.Semicolon, "Expected ';' after property declaration.");

      return {
        access,
        declarationType,
        initializer,
        kind: 'ClassProperty',
        name: this.createIdentifier(name),
        static: isStatic,
        typeAnnotation,
      } satisfies ClassProperty;
    }

    const isOverride = this.match(TokenType.Override);
    const isVirtual = classIsVirtual || this.match(TokenType.Virtual);
    const name = this.consume(TokenType.Identifier, 'Expected class member name.');

    if (this.match(TokenType.LeftParen)) {
      const parameters = this.parseParameters();
      this.consume(TokenType.Colon, "Expected ':' after method parameters.");

      const method: ClassMethod = {
        access,
        kind: 'ClassMethod',
        name: this.createIdentifier(name),
        override: isOverride,
        parameters,
        returnType: this.parseFunctionReturnType(),
        static: isStatic,
        virtual: isVirtual,
      };

      if (this.match(TokenType.Semicolon)) {
        return method;
      }

      method.body = this.parseBlockStatement();
      return method;
    }

    throw this.error(this.peek(), "Expected '(' after method name or 'var'/'val' before property name.");
  }

  private parseComparison(): Expression {
    let expression = this.parseTerm();

    while (this.match(TokenType.Greater, TokenType.GreaterEquals, TokenType.Less, TokenType.LessEquals)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseTerm();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseConditionalExpression(): Expression {
    const test = this.parseNullishCoalescing();

    if (!this.match(TokenType.Question)) {
      return test;
    }

    const consequent = this.parseExpression();
    this.consume(TokenType.Colon, "Expected ':' after ternary consequent.");
    const alternate = this.parseExpression();

    return {
      alternate,
      consequent,
      kind: 'ConditionalExpression',
      test,
    } satisfies ConditionalExpression;
  }

  private parseContinueStatement(): ContinueStatement {
    this.consume(TokenType.Semicolon, "Expected ';' after continue.");

    return {
      kind: 'ContinueStatement',
    };
  }

  private parseDoWhileStatement(): DoWhileStatement {
    const body = this.parseBlockStatement();

    this.consume(TokenType.While, "Expected 'while' after do block.");
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'.");
    const condition = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after do while condition.");
    this.consume(TokenType.Semicolon, "Expected ';' after do while statement.");

    return {
      body,
      condition,
      kind: 'DoWhileStatement',
    };
  }

  private parseEquality(): Expression {
    let expression = this.parseComparison();

    while (this.match(TokenType.EqualEqual, TokenType.BangEqual)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseComparison();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseExceptClause(): ExceptClause {
    this.consume(TokenType.LeftParen, "Expected '(' after 'except'.");
    const identifier = this.consume(TokenType.Identifier, 'Expected error binding name.');
    this.consume(TokenType.Colon, "Expected ':' after error binding.");
    const errorType = this.parseTypeName();
    this.consume(TokenType.RightParen, "Expected ')' after except binding.");

    return {
      body: this.parseBlockStatement(),
      errorType,
      identifier: this.createIdentifier(identifier),
      kind: 'ExceptClause',
    };
  }

  private parseExportDeclaration(): ExportDeclaration {
    if (this.match(TokenType.Var)) {
      return {
        declaration: this.parseVariableDeclaration('var'),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Val)) {
      return {
        declaration: this.parseVariableDeclaration('val'),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Function)) {
      return {
        declaration: this.parseFunctionDeclaration(),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Abstract)) {
      return {
        declaration: this.parseClassDeclaration(true),
        kind: 'ExportDeclaration',
      };
    }

    if (this.match(TokenType.Class)) {
      return {
        declaration: this.parseClassDeclaration(false),
        kind: 'ExportDeclaration',
      };
    }

    const identifier = this.consume(TokenType.Identifier, "Expected exported binding name after 'export'.");
    this.consume(TokenType.Semicolon, "Expected ';' after export declaration.");

    return {
      identifier: this.createIdentifier(identifier),
      kind: 'ExportDeclaration',
    };
  }

  private parseExpression(): Expression {
    return this.parseConditionalExpression();
  }

  private parseFactor(): Expression {
    let expression = this.parseUnaryExpression();

    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseUnaryExpression();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseForStatement(): ForStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'for'.");
    this.consume(TokenType.Var, "Expected 'var' in for loop declaration.");
    const element = this.consume(TokenType.Identifier, 'Expected element identifier in for loop.');
    const index = this.match(TokenType.Comma)
      ? this.consume(TokenType.Identifier, "Expected index identifier after ','.")
      : null;

    this.consume(TokenType.Of, "Expected 'of' in for loop.");
    const iterable = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after for loop declaration.");

    const forStatement: ForStatement = {
      body: this.parseBlockStatement(),
      element: this.createIdentifier(element),
      iterable,
      kind: 'ForStatement',
    };

    if (index !== null) {
      forStatement.index = this.createIdentifier(index);
    }

    return forStatement;
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const name = this.consume(TokenType.Identifier, "Expected function name after 'function'.");
    const typeParameters = this.parseTypeParameters();
    this.consume(TokenType.LeftParen, "Expected '(' after function name.");
    const parameters = this.parseParameters();
    this.consume(TokenType.Colon, "Expected ':' after function parameters.");
    const declaration: FunctionDeclaration = {
      identifier: this.createIdentifier(name),
      kind: 'FunctionDeclaration',
      parameters,
      returnType: this.parseFunctionReturnType(),
      typeParameters,
    };

    if (this.match(TokenType.Semicolon)) {
      return declaration;
    }

    declaration.body = this.parseBlockStatement();
    return declaration;
  }

  private parseFunctionReturnType(): FunctionReturnType {
    if (this.check(TokenType.Identifier) && this.peek().lexeme === 'void') {
      this.advance();
      return 'void';
    }

    return this.parseTypeName();
  }

  private parseIfStatement(): IfStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'if'.");
    const condition = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after if condition.");

    const statement: IfStatement = {
      condition,
      consequent: this.parseBlockStatement(),
      kind: 'IfStatement',
    };

    if (this.match(TokenType.Else)) {
      statement.alternate = this.match(TokenType.If) ? this.parseIfStatement() : this.parseBlockStatement();
    }

    return statement;
  }

  private parseImportDeclaration(): ImportDeclaration {
    this.consume(TokenType.LeftBrace, "Expected '{' after 'import'.");
    const identifiers: Identifier[] = [];

    do {
      const identifier = this.consume(TokenType.Identifier, 'Expected imported binding name.');
      identifiers.push(this.createIdentifier(identifier));
    } while (this.match(TokenType.Comma) && !this.check(TokenType.RightBrace));

    this.consume(TokenType.RightBrace, "Expected '}' after imported binding list.");
    this.consume(TokenType.From, "Expected 'from' after imported binding list.");
    const source = this.consume(TokenType.String, "Expected module path string after 'from'.");
    this.consume(TokenType.Semicolon, "Expected ';' after import declaration.");

    return {
      identifiers,
      kind: 'ImportDeclaration',
      source: {
        kind: 'StringLiteral',
        value: source.lexeme,
      },
    };
  }

  private parseLogicalAnd(): Expression {
    let expression = this.parseEquality();

    while (this.match(TokenType.AmpersandAmpersand)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseEquality();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseLogicalOr(): Expression {
    let expression = this.parseLogicalAnd();

    while (this.match(TokenType.PipePipe)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseLogicalAnd();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseNewExpression(): NewExpression {
    const callee = this.consume(TokenType.Identifier, "Expected class name after 'new'.");
    const typeArguments = this.check(TokenType.Less) ? this.parseTypeArguments() : [];
    this.consume(TokenType.LeftParen, "Expected '(' after class name.");

    return {
      arguments: this.parseArguments(),
      callee: this.createIdentifier(callee),
      kind: 'NewExpression',
      typeArguments,
    };
  }

  private parseNullLiteral(): NullLiteral {
    return {
      kind: 'NullLiteral',
    };
  }

  private parseNullishCoalescing(): Expression {
    let expression = this.parseLogicalOr();

    while (this.match(TokenType.QuestionQuestion)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseLogicalOr();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseParameters(): Parameter[] {
    const parameters: Parameter[] = [];
    let foundDefault = false;
    let foundRest = false;

    if (!this.check(TokenType.RightParen)) {
      do {
        if (foundRest) {
          throw this.error(this.peek(), 'Rest parameter must be the last parameter.');
        }

        const isRest = this.match(TokenType.Ellipsis);
        const name = this.consume(TokenType.Identifier, 'Expected parameter name.');
        this.consume(TokenType.Colon, "Expected ':' after parameter name.");

        const parameter: Parameter = {
          identifier: this.createIdentifier(name),
          kind: 'Parameter',
          rest: isRest,
          typeAnnotation: this.parseTypeName(),
        };

        if (isRest) {
          foundRest = true;

          if (this.match(TokenType.Equals)) {
            throw this.error(this.previous(), 'Rest parameters cannot have default values.');
          }
        } else if (this.match(TokenType.Equals)) {
          parameter.defaultValue = this.parseExpression();
          foundDefault = true;
        } else if (foundDefault) {
          throw this.error(this.peek(), 'Required parameters cannot appear after parameters with default values.');
        }

        parameters.push(parameter);
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RightParen));
    }

    this.consume(TokenType.RightParen, "Expected ')' after parameters.");
    return parameters;
  }

  private parsePrimary(): Expression {
    if (this.match(TokenType.LeftParen)) {
      const first = this.parseExpression();

      if (!this.match(TokenType.Comma)) {
        this.consume(TokenType.RightParen, "Expected ')' after grouped expression.");
        return first;
      }

      const elements: Expression[] = [first];

      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma));

      this.consume(TokenType.RightParen, "Expected ')' after tuple literal.");

      return {
        elements,
        kind: 'TupleLiteral',
      } satisfies TupleLiteral;
    }

    if (this.match(TokenType.LeftBracket)) {
      return this.parseArrayLiteral();
    }

    if (this.match(TokenType.Identifier)) {
      return this.createIdentifier(this.previous());
    }

    if (this.match(TokenType.New)) {
      return this.parseNewExpression();
    }

    if (this.match(TokenType.Number)) {
      return this.createNumberLiteral(this.previous());
    }

    if (this.match(TokenType.Null)) {
      return this.parseNullLiteral();
    }

    if (this.match(TokenType.String)) {
      return {
        kind: 'StringLiteral',
        value: this.previous().lexeme,
      } satisfies StringLiteral;
    }

    if (this.match(TokenType.Super)) {
      return {
        kind: 'SuperExpression',
      };
    }

    if (this.match(TokenType.This)) {
      return {
        kind: 'ThisExpression',
      };
    }

    throw this.error(this.peek(), 'Expected expression.');
  }

  private parseReturnStatement(): ReturnStatement {
    if (this.match(TokenType.Semicolon)) {
      return {
        kind: 'ReturnStatement',
      };
    }

    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after return value.");

    return {
      kind: 'ReturnStatement',
      value,
    };
  }

  private parseStatement(): Statement {
    if (this.match(TokenType.Import)) {
      return this.parseImportDeclaration();
    }

    if (this.match(TokenType.Export)) {
      return this.parseExportDeclaration();
    }

    if (this.match(TokenType.Var)) {
      return this.parseVariableDeclaration('var');
    }

    if (this.match(TokenType.Val)) {
      return this.parseVariableDeclaration('val');
    }

    if (this.match(TokenType.For)) {
      return this.parseForStatement();
    }

    if (this.match(TokenType.Do)) {
      return this.parseDoWhileStatement();
    }

    if (this.match(TokenType.Function)) {
      return this.parseFunctionDeclaration();
    }

    if (this.match(TokenType.If)) {
      return this.parseIfStatement();
    }

    if (this.match(TokenType.Break)) {
      return this.parseBreakStatement();
    }

    if (this.match(TokenType.Continue)) {
      return this.parseContinueStatement();
    }

    if (this.match(TokenType.Abstract)) {
      return this.parseClassDeclaration(true);
    }

    if (this.match(TokenType.Class)) {
      return this.parseClassDeclaration(false);
    }

    if (this.match(TokenType.Return)) {
      return this.parseReturnStatement();
    }

    if (this.match(TokenType.Throw)) {
      return this.parseThrowStatement();
    }

    if (this.match(TokenType.Try)) {
      return this.parseTryStatement();
    }

    if (this.match(TokenType.While)) {
      return this.parseWhileStatement();
    }

    const expression = this.parseExpression();

    if (
      (expression.kind === 'Identifier' || expression.kind === 'MemberExpression') &&
      this.isAssignmentOperatorToken(this.peek().type)
    ) {
      return this.parseAssignmentStatement(expression);
    }

    this.consume(TokenType.Semicolon, "Expected ';' after expression.");

    return {
      expression,
      kind: 'ExpressionStatement',
    } satisfies ExpressionStatement;
  }

  private parseTerm(): Expression {
    let expression = this.parseFactor();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().lexeme as BinaryOperator;
      const right = this.parseFactor();

      expression = {
        kind: 'BinaryExpression',
        left: expression,
        operator,
        right,
      } satisfies BinaryExpression;
    }

    return expression;
  }

  private parseThrowStatement(): ThrowStatement {
    const value = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after thrown value.");

    return {
      kind: 'ThrowStatement',
      value,
    };
  }

  private parseTryStatement(): TryStatement {
    const body = this.parseBlockStatement();
    const exceptClauses: ExceptClause[] = [];

    while (this.match(TokenType.Except)) {
      exceptClauses.push(this.parseExceptClause());
    }

    if (exceptClauses.length === 0) {
      throw this.error(this.peek(), "Expected at least one 'except' after try block.");
    }

    const statement: TryStatement = {
      body,
      exceptClauses,
      kind: 'TryStatement',
    };

    if (this.match(TokenType.Finally)) {
      statement.finallyBody = this.parseBlockStatement();
    }

    return statement;
  }

  private parseTypeArguments(): TypeName[] {
    this.consume(TokenType.Less, "Expected '<' before type arguments.");
    const typeArguments: TypeName[] = [];

    do {
      typeArguments.push(this.parseTypeName());
    } while (this.match(TokenType.Comma));

    this.consume(TokenType.Greater, "Expected '>' after type arguments.");
    return typeArguments;
  }

  private parseTypeName(): TypeName {
    if (this.match(TokenType.LeftParen)) {
      const types: TypeName[] = [this.parseTypeName()];

      while (this.match(TokenType.Comma)) {
        types.push(this.parseTypeName());
      }

      this.consume(TokenType.RightParen, "Expected ')' after tuple type.");

      if (types.length < 2) {
        throw this.error(this.previous(), 'Tuple types must contain at least two elements.');
      }

      return `(${types.join(',')})`;
    }

    const type = this.consume(TokenType.Identifier, 'Expected type name.');
    let typeName = this.getTypeName(type.lexeme);

    if (this.check(TokenType.Less)) {
      typeName = `${typeName}<${this.parseTypeArguments().join(',')}>`;
    }

    while (this.match(TokenType.LeftBracket)) {
      this.consume(TokenType.RightBracket, "Expected ']' after array type.");
      typeName = `${typeName}[]`;
    }

    return typeName;
  }

  private parseTypeParameters(): TypeParameter[] {
    if (!this.match(TokenType.Less)) {
      return [];
    }

    const typeParameters: TypeParameter[] = [];

    do {
      const identifier = this.consume(TokenType.Identifier, 'Expected type parameter name.');
      const typeParameter: TypeParameter = {
        identifier: this.createIdentifier(identifier),
        kind: 'TypeParameter',
      };

      if (this.match(TokenType.Equals)) {
        typeParameter.defaultType = this.parseTypeName();
      }

      typeParameters.push(typeParameter);
    } while (this.match(TokenType.Comma));

    this.consume(TokenType.Greater, "Expected '>' after type parameters.");
    return typeParameters;
  }

  private parseUnaryExpression(): Expression {
    if (this.match(TokenType.Bang, TokenType.Minus)) {
      const operator = this.previous().lexeme as UnaryOperator;

      return {
        argument: this.parseUnaryExpression(),
        kind: 'UnaryExpression',
        operator,
      } satisfies UnaryExpression;
    }

    return this.parseCallExpression();
  }

  private parseVariableDeclaration(declarationType: 'var' | 'val'): VariableDeclaration {
    const name = this.consume(TokenType.Identifier, `Expected identifier after '${declarationType}'.`);
    const type = this.match(TokenType.Colon) ? this.parseTypeName() : undefined;

    this.consume(TokenType.Equals, "Expected '=' after variable name.");
    const initializer = this.parseExpression();
    this.consume(TokenType.Semicolon, "Expected ';' after variable declaration.");

    const declaration: VariableDeclaration = {
      declarationType,
      identifier: this.createIdentifier(name),
      initializer,
      kind: 'VariableDeclaration',
    };

    if (type !== undefined) {
      declaration.typeAnnotation = type;
    }

    return declaration;
  }

  private parseWhileStatement(): WhileStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'.");
    const condition = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after while condition.");

    return {
      body: this.parseBlockStatement(),
      condition,
      kind: 'WhileStatement',
    };
  }

  private peek(): Token {
    const token = this.tokens[this.current];

    if (token === undefined) {
      throw createSyntaxError('Unexpected end of token stream while peeking');
    }

    return token;
  }

  private previous(): Token {
    const token = this.tokens[this.current - 1];

    if (token === undefined) {
      throw createSyntaxError('Unexpected start of token stream while reading previous token');
    }

    return token;
  }

  private tryParseTypeArguments(): TypeName[] | undefined {
    if (!this.check(TokenType.Less)) {
      return undefined;
    }

    const start = this.current;

    try {
      const typeArguments = this.parseTypeArguments();

      if (!this.check(TokenType.LeftParen)) {
        this.current = start;
        return undefined;
      }

      return typeArguments;
    } catch {
      this.current = start;
      return undefined;
    }
  }
}
