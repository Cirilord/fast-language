import type {
  AssignmentStatement,
  ClassDeclaration,
  ClassMethod,
  ClassProperty,
  Identifier,
  Parameter,
  ReturnStatement,
  SourceLocation,
  Statement,
  StringLiteral,
} from './ast';

const BUILTIN_LOCATION: SourceLocation = {
  column: 1,
  line: 1,
};

function createIdentifier(name: string): Identifier {
  return {
    kind: 'Identifier',
    location: BUILTIN_LOCATION,
    name,
  };
}

function createStringLiteral(value: string): StringLiteral {
  return {
    kind: 'StringLiteral',
    value,
  };
}

function createMessageParameter(): Parameter {
  return {
    identifier: createIdentifier('message'),
    kind: 'Parameter',
    rest: false,
    typeAnnotation: 'string',
  };
}

function createMessageProperty(): ClassProperty {
  return {
    access: 'public',
    declarationType: 'var',
    initializer: createStringLiteral(''),
    kind: 'ClassProperty',
    name: createIdentifier('message'),
    static: false,
    typeAnnotation: 'string',
  };
}

function createMessageAssignment(): AssignmentStatement {
  return {
    kind: 'AssignmentStatement',
    operator: '=',
    target: {
      kind: 'MemberExpression',
      object: {
        kind: 'ThisExpression',
      },
      property: createIdentifier('message'),
    },
    value: createIdentifier('message'),
  };
}

function createToStringMethod(): ClassMethod {
  return {
    access: 'public',
    body: [
      {
        kind: 'ReturnStatement',
        value: {
          kind: 'MemberExpression',
          object: {
            kind: 'ThisExpression',
          },
          property: createIdentifier('message'),
        },
      } satisfies ReturnStatement,
    ],
    kind: 'ClassMethod',
    name: createIdentifier('toString'),
    override: false,
    parameters: [],
    returnType: 'string',
    static: false,
    virtual: false,
  };
}

function createErrorBaseClass(): ClassDeclaration {
  return {
    abstract: false,
    identifier: createIdentifier('Error'),
    implements: [],
    kind: 'ClassDeclaration',
    members: [
      createMessageProperty(),
      {
        access: 'public',
        body: [createMessageAssignment()],
        kind: 'ClassConstructor',
        parameters: [createMessageParameter()],
      },
      createToStringMethod(),
    ],
    typeParameters: [],
    virtual: false,
  };
}

function createDerivedErrorClass(name: string): ClassDeclaration {
  const messageParameter = createMessageParameter();

  return {
    abstract: false,
    baseClass: createIdentifier('Error'),
    identifier: createIdentifier(name),
    implements: [],
    kind: 'ClassDeclaration',
    members: [
      {
        access: 'public',
        body: [
          {
            expression: {
              arguments: [createIdentifier('message')],
              callee: {
                kind: 'SuperExpression',
              },
              kind: 'CallExpression',
              typeArguments: [],
            },
            kind: 'ExpressionStatement',
          } satisfies Statement,
        ],
        kind: 'ClassConstructor',
        parameters: [messageParameter],
      },
    ],
    typeParameters: [],
    virtual: false,
  };
}

export function getBuiltinClassDeclarations(): ClassDeclaration[] {
  return [createErrorBaseClass(), createDerivedErrorClass('TypeError'), createDerivedErrorClass('ReferenceError')];
}
