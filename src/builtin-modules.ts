import type { NumberLiteralType, TypeParameter } from './ast';
import { createReferenceError, createTypeError } from './errors';
import type { RuntimeModuleExports, RuntimeValue } from './runtime';
import type { CallableSignature, SemanticModuleExports, SemanticSymbol } from './semantic';

const EMPTY_TYPE_PARAMETERS: TypeParameter[] = [];

function createTypeParameter(name: string): TypeParameter {
  return {
    identifier: {
      kind: 'Identifier',
      location: {
        column: 1,
        line: 1,
      },
      name,
    },
    kind: 'TypeParameter',
  };
}

const ARRAY_TYPE_PARAMETERS: TypeParameter[] = [createTypeParameter('T')];

function createNumberValue(value: number, numberType: NumberLiteralType = 'double'): RuntimeValue {
  return {
    numberType,
    type: 'number',
    value,
  };
}

function createSemanticConstant(type: SemanticSymbol['type']): SemanticSymbol {
  return {
    callable: false,
    mutable: false,
    name: '',
    type,
  };
}

function createSemanticFunction(
  returnType: Exclude<SemanticSymbol['returnType'], undefined>,
  parameterTypes: string[],
  minArity = parameterTypes.length,
  restParameterType?: string,
  overloadSignatures?: CallableSignature[],
  typeParameters: TypeParameter[] = EMPTY_TYPE_PARAMETERS
): SemanticSymbol {
  const symbol: SemanticSymbol = {
    callable: true,
    minArity,
    mutable: false,
    name: '',
    parameterTypes,
    returnType,
    type: 'function',
    typeParameters,
  };

  if (restParameterType !== undefined) {
    symbol.restParameterType = restParameterType;
  }

  if (overloadSignatures !== undefined) {
    symbol.overloadSignatures = overloadSignatures;
  }

  return symbol;
}

function createSignature(parameterTypes: string[], returnType: string): CallableSignature {
  return {
    minArity: parameterTypes.length,
    parameterTypes,
    returnType,
    typeParameters: EMPTY_TYPE_PARAMETERS,
  };
}

function createUnaryNumericOverloads(
  returnType: string | ((parameterType: NumberLiteralType) => string)
): CallableSignature[] {
  return ['int', 'float', 'double'].map((parameterType) =>
    createSignature(
      [parameterType],
      typeof returnType === 'function' ? returnType(parameterType as NumberLiteralType) : returnType
    )
  );
}

function createBinaryNumericOverloads(returnType: string): CallableSignature[] {
  const numberTypes: NumberLiteralType[] = ['byte', 'int', 'float', 'double'];
  return numberTypes.flatMap((leftType) =>
    numberTypes.map((rightType) => createSignature([leftType, rightType], returnType))
  );
}

function expectNumberArgument(value: RuntimeValue | undefined, functionName: string, index: number | string): number {
  if (value?.type !== 'number') {
    throw createTypeError(`'${functionName}' expects number at argument ${index}`);
  }

  return value.value;
}

function expectNumericArrayArgument(value: RuntimeValue | undefined, functionName: string, index: number): number[] {
  if (value?.type !== 'array') {
    throw createTypeError(`'${functionName}' expects array at argument ${index}`);
  }

  return value.elements.map((element, elementIndex) =>
    expectNumberArgument(element, functionName, `${index}.${elementIndex + 1}`)
  );
}

function expectArrayArgument(value: RuntimeValue | undefined, functionName: string, index: number): RuntimeValue[] {
  if (value?.type !== 'array') {
    throw createTypeError(`'${functionName}' expects array at argument ${index}`);
  }

  return value.elements;
}

function expectIntegerArgument(value: RuntimeValue | undefined, functionName: string, index: number): number {
  if (value?.type !== 'number' || (value.numberType !== 'byte' && value.numberType !== 'int')) {
    throw createTypeError(`'${functionName}' expects integer at argument ${index}`);
  }

  return value.value;
}

function expectStringArgument(value: RuntimeValue | undefined, functionName: string, index: number): string {
  if (value?.type !== 'string') {
    throw createTypeError(`'${functionName}' expects string at argument ${index}`);
  }

  return value.value;
}

function getArrayElementAt(elements: RuntimeValue[], index: number, functionName: string): RuntimeValue {
  const value = elements[index];

  if (value === undefined) {
    throw createReferenceError(`'${functionName}' index '${index}' is out of bounds`);
  }

  return value;
}

function runtimeValueToBuiltinString(value: RuntimeValue): string {
  switch (value.type) {
    case 'array':
      return `[${value.elements.map((element) => runtimeValueToBuiltinString(element)).join(', ')}]`;
    case 'boolean':
      return String(value.value);
    case 'bound-method':
      return '<bound method>';
    case 'class':
      return `class ${value.name} { ... }`;
    case 'enum':
      return `enum ${value.name} { ... }`;
    case 'enum-member':
      return `${value.enumValue.name}.${value.name}`;
    case 'function':
      return value.name === '' ? 'function(...): ... { ... }' : `function ${value.name}(...) { ... }`;
    case 'instance':
      return `${value.classValue.name} { ... }`;
    case 'namespace':
      return `<namespace ${value.name}>`;
    case 'native-function':
      return `<native function ${value.name}>`;
    case 'null':
      return 'null';
    case 'number':
      return String(value.value);
    case 'string':
      return value.value;
    case 'super':
      return `${value.superClass.name} { ... }`;
    case 'tuple':
      return `(${value.elements.map((element) => runtimeValueToBuiltinString(element)).join(', ')})`;
  }
}

function areBuiltinRuntimeValuesEqual(left: RuntimeValue, right: RuntimeValue): boolean {
  if (left.type !== right.type) {
    return false;
  }

  switch (left.type) {
    case 'array':
      return left === right;
    case 'boolean':
      return right.type === 'boolean' && left.value === right.value;
    case 'bound-method':
      return left === right;
    case 'class':
      return left === right;
    case 'enum':
      return left === right;
    case 'enum-member':
      return left === right;
    case 'function':
      return left === right;
    case 'instance':
      return left === right;
    case 'namespace':
      return left === right;
    case 'native-function':
      return left === right;
    case 'null':
      return true;
    case 'number':
      return right.type === 'number' && left.value === right.value;
    case 'string':
      return right.type === 'string' && left.value === right.value;
    case 'super':
      return left === right;
    case 'tuple':
      return (
        right.type === 'tuple' &&
        left.elements.length === right.elements.length &&
        left.elements.every((element, index) => {
          const rightElement = right.elements[index];
          return rightElement !== undefined && areBuiltinRuntimeValuesEqual(element, rightElement);
        })
      );
  }
}

function roundToFloat16(value: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return value;
  }

  const sign = Math.sign(value) < 0 ? -1 : 1;
  let absolute = Math.abs(value);

  if (absolute >= 65504) {
    return sign * 65504;
  }

  if (absolute < 2 ** -24) {
    return sign * 0;
  }

  const exponent = Math.floor(Math.log2(absolute));
  const normalized = absolute / 2 ** exponent;
  const roundedMantissa = Math.round((normalized - 1) * 1024) / 1024;
  let adjustedExponent = exponent;
  let adjustedMantissa = roundedMantissa;

  if (adjustedMantissa >= 1) {
    adjustedMantissa = 0;
    adjustedExponent += 1;
  }

  absolute = (1 + adjustedMantissa) * 2 ** adjustedExponent;
  return sign * absolute;
}

function preciseSum(values: number[]): number {
  let sum = 0;
  let compensation = 0;

  for (const value of values) {
    const corrected = value - compensation;
    const next = sum + corrected;
    compensation = next - sum - corrected;
    sum = next;
  }

  return sum;
}

function getStringCharacterAt(value: string, index: number, functionName: string): string {
  const normalizedIndex = index >= 0 ? index : value.length + index;
  const character = value.at(normalizedIndex);

  if (character === undefined) {
    throw createReferenceError(`'${functionName}' index '${index}' is out of bounds`);
  }

  return character;
}

function createMathRuntimeExports(): RuntimeModuleExports {
  const exports = new Map<string, RuntimeValue>();

  const constants = {
    E: Math.E,
    LN10: Math.LN10,
    LN2: Math.LN2,
    LOG10E: Math.LOG10E,
    LOG2E: Math.LOG2E,
    PI: Math.PI,
    SQRT1_2: Math.SQRT1_2,
    SQRT2: Math.SQRT2,
  } as const;

  for (const [name, value] of Object.entries(constants)) {
    exports.set(name, createNumberValue(value));
  }

  const unaryDoubleFunctions = [
    'acos',
    'acosh',
    'asin',
    'asinh',
    'atan',
    'atanh',
    'cbrt',
    'cos',
    'cosh',
    'exp',
    'expm1',
    'log',
    'log10',
    'log1p',
    'log2',
    'sin',
    'sinh',
    'sqrt',
    'tan',
    'tanh',
  ] as const;

  for (const name of unaryDoubleFunctions) {
    exports.set(name, {
      call: ([value]): RuntimeValue => createNumberValue(Math[name](expectNumberArgument(value, `Math.${name}`, 1))),
      name: `Math.${name}`,
      type: 'native-function',
    });
  }

  exports.set('abs', {
    call: ([value]): RuntimeValue => {
      if (value?.type !== 'number') {
        throw createTypeError("'Math.abs' expects number at argument 1");
      }

      return createNumberValue(Math.abs(value.value), value.numberType);
    },
    name: 'Math.abs',
    type: 'native-function',
  });

  exports.set('atan2', {
    call: ([y, x]): RuntimeValue =>
      createNumberValue(Math.atan2(expectNumberArgument(y, 'Math.atan2', 1), expectNumberArgument(x, 'Math.atan2', 2))),
    name: 'Math.atan2',
    type: 'native-function',
  });

  exports.set('ceil', {
    call: ([value]): RuntimeValue => createNumberValue(Math.ceil(expectNumberArgument(value, 'Math.ceil', 1)), 'int'),
    name: 'Math.ceil',
    type: 'native-function',
  });

  exports.set('clz32', {
    call: ([value]): RuntimeValue => createNumberValue(Math.clz32(expectNumberArgument(value, 'Math.clz32', 1)), 'int'),
    name: 'Math.clz32',
    type: 'native-function',
  });

  exports.set('f16round', {
    call: ([value]): RuntimeValue =>
      createNumberValue(roundToFloat16(expectNumberArgument(value, 'Math.f16round', 1)), 'float'),
    name: 'Math.f16round',
    type: 'native-function',
  });

  exports.set('floor', {
    call: ([value]): RuntimeValue => createNumberValue(Math.floor(expectNumberArgument(value, 'Math.floor', 1)), 'int'),
    name: 'Math.floor',
    type: 'native-function',
  });

  exports.set('fround', {
    call: ([value]): RuntimeValue =>
      createNumberValue(Math.fround(expectNumberArgument(value, 'Math.fround', 1)), 'float'),
    name: 'Math.fround',
    type: 'native-function',
  });

  exports.set('hypot', {
    call: (values): RuntimeValue =>
      createNumberValue(
        Math.hypot(...values.map((value, index) => expectNumberArgument(value, 'Math.hypot', index + 1)))
      ),
    name: 'Math.hypot',
    type: 'native-function',
  });

  exports.set('imul', {
    call: ([left, right]): RuntimeValue =>
      createNumberValue(
        Math.imul(expectNumberArgument(left, 'Math.imul', 1), expectNumberArgument(right, 'Math.imul', 2)),
        'int'
      ),
    name: 'Math.imul',
    type: 'native-function',
  });

  exports.set('max', {
    call: (values): RuntimeValue =>
      createNumberValue(Math.max(...values.map((value, index) => expectNumberArgument(value, 'Math.max', index + 1)))),
    name: 'Math.max',
    type: 'native-function',
  });

  exports.set('min', {
    call: (values): RuntimeValue =>
      createNumberValue(Math.min(...values.map((value, index) => expectNumberArgument(value, 'Math.min', index + 1)))),
    name: 'Math.min',
    type: 'native-function',
  });

  exports.set('pow', {
    call: ([base, exponent]): RuntimeValue =>
      createNumberValue(
        Math.pow(expectNumberArgument(base, 'Math.pow', 1), expectNumberArgument(exponent, 'Math.pow', 2))
      ),
    name: 'Math.pow',
    type: 'native-function',
  });

  exports.set('random', {
    call: (): RuntimeValue => createNumberValue(Math.random()),
    name: 'Math.random',
    type: 'native-function',
  });

  exports.set('round', {
    call: ([value]): RuntimeValue => createNumberValue(Math.round(expectNumberArgument(value, 'Math.round', 1)), 'int'),
    name: 'Math.round',
    type: 'native-function',
  });

  exports.set('sign', {
    call: ([value]): RuntimeValue => createNumberValue(Math.sign(expectNumberArgument(value, 'Math.sign', 1)), 'int'),
    name: 'Math.sign',
    type: 'native-function',
  });

  exports.set('sumPrecise', {
    call: ([values]): RuntimeValue =>
      createNumberValue(preciseSum(expectNumericArrayArgument(values, 'Math.sumPrecise', 1))),
    name: 'Math.sumPrecise',
    type: 'native-function',
  });

  exports.set('trunc', {
    call: ([value]): RuntimeValue => createNumberValue(Math.trunc(expectNumberArgument(value, 'Math.trunc', 1)), 'int'),
    name: 'Math.trunc',
    type: 'native-function',
  });

  return exports;
}

function createMathSemanticExports(): SemanticModuleExports {
  const exports = new Map<string, SemanticSymbol>();

  const constants: ReadonlyArray<[string, SemanticSymbol['type']]> = [
    ['E', 'double'],
    ['LN10', 'double'],
    ['LN2', 'double'],
    ['LOG10E', 'double'],
    ['LOG2E', 'double'],
    ['PI', 'double'],
    ['SQRT1_2', 'double'],
    ['SQRT2', 'double'],
  ];

  for (const [name, type] of constants) {
    exports.set(name, { ...createSemanticConstant(type), name });
  }

  const unaryDoubleFunctions = [
    'acos',
    'acosh',
    'asin',
    'asinh',
    'atan',
    'atanh',
    'cbrt',
    'cos',
    'cosh',
    'exp',
    'expm1',
    'log',
    'log10',
    'log1p',
    'log2',
    'sin',
    'sinh',
    'sqrt',
    'tan',
    'tanh',
  ] as const;

  for (const name of unaryDoubleFunctions) {
    exports.set(name, {
      ...createSemanticFunction('double', ['unknown'], 1, undefined, createUnaryNumericOverloads('double')),
      name,
    });
  }

  const unaryIntFunctions = ['ceil', 'clz32', 'floor', 'round', 'sign', 'trunc'] as const;

  for (const name of unaryIntFunctions) {
    exports.set(name, {
      ...createSemanticFunction('int', ['unknown'], 1, undefined, createUnaryNumericOverloads('int')),
      name,
    });
  }

  exports.set('abs', {
    ...createSemanticFunction(
      'double',
      ['unknown'],
      1,
      undefined,
      createUnaryNumericOverloads((parameterType) => parameterType)
    ),
    name: 'abs',
  });
  exports.set('atan2', {
    ...createSemanticFunction('double', ['unknown', 'unknown'], 2, undefined, createBinaryNumericOverloads('double')),
    name: 'atan2',
  });
  exports.set('f16round', {
    ...createSemanticFunction('float', ['unknown'], 1, undefined, createUnaryNumericOverloads('float')),
    name: 'f16round',
  });
  exports.set('fround', {
    ...createSemanticFunction('float', ['unknown'], 1, undefined, createUnaryNumericOverloads('float')),
    name: 'fround',
  });
  exports.set('hypot', { ...createSemanticFunction('double', ['unknown[]'], 0, 'unknown[]'), name: 'hypot' });
  exports.set('imul', {
    ...createSemanticFunction('int', ['unknown', 'unknown'], 2, undefined, createBinaryNumericOverloads('int')),
    name: 'imul',
  });
  exports.set('max', { ...createSemanticFunction('double', ['unknown[]'], 0, 'unknown[]'), name: 'max' });
  exports.set('min', { ...createSemanticFunction('double', ['unknown[]'], 0, 'unknown[]'), name: 'min' });
  exports.set('pow', {
    ...createSemanticFunction('double', ['unknown', 'unknown'], 2, undefined, createBinaryNumericOverloads('double')),
    name: 'pow',
  });
  exports.set('random', { ...createSemanticFunction('double', [], 0), name: 'random' });
  exports.set('sumPrecise', { ...createSemanticFunction('double', ['array'], 1), name: 'sumPrecise' });

  return exports;
}

function createArrayRuntimeExports(): RuntimeModuleExports {
  const exports = new Map<string, RuntimeValue>();

  exports.set('length', {
    call: ([array]): RuntimeValue => createNumberValue(expectArrayArgument(array, 'Array.length', 1).length, 'int'),
    name: 'Array.length',
    type: 'native-function',
  });

  exports.set('push', {
    call: ([array, value]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.push', 1);

      if (value === undefined) {
        throw createTypeError("'Array.push' expects value at argument 2");
      }

      elements.push(value);
      return createNumberValue(elements.length, 'int');
    },
    name: 'Array.push',
    type: 'native-function',
  });

  exports.set('pop', {
    call: ([array]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.pop', 1);
      const value = elements.pop();

      if (value === undefined) {
        throw createReferenceError("'Array.pop' cannot remove from an empty array");
      }

      return value;
    },
    name: 'Array.pop',
    type: 'native-function',
  });

  exports.set('slice', {
    call: ([array, start, end]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.slice', 1);
      const startIndex = Math.trunc(expectNumberArgument(start, 'Array.slice', 2));
      const endIndex = end === undefined ? undefined : Math.trunc(expectNumberArgument(end, 'Array.slice', 3));

      return {
        elements: elements.slice(startIndex, endIndex),
        type: 'array',
      };
    },
    name: 'Array.slice',
    type: 'native-function',
  });

  exports.set('includes', {
    call: ([array, value]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.includes', 1);
      return {
        type: 'boolean',
        value: value !== undefined && elements.some((element) => areBuiltinRuntimeValuesEqual(element, value)),
      };
    },
    name: 'Array.includes',
    type: 'native-function',
  });

  exports.set('indexOf', {
    call: ([array, value]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.indexOf', 1);
      return createNumberValue(
        value === undefined ? -1 : elements.findIndex((element) => areBuiltinRuntimeValuesEqual(element, value)),
        'int'
      );
    },
    name: 'Array.indexOf',
    type: 'native-function',
  });

  exports.set('clear', {
    call: ([array]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.clear', 1);
      elements.length = 0;
      return { type: 'null', value: null };
    },
    name: 'Array.clear',
    type: 'native-function',
  });

  exports.set('reverse', {
    call: ([array]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.reverse', 1);
      elements.reverse();
      return array ?? { elements, type: 'array' };
    },
    name: 'Array.reverse',
    type: 'native-function',
  });

  exports.set('join', {
    call: ([array, separator]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.join', 1);

      if (separator !== undefined && separator.type !== 'string') {
        throw createTypeError("'Array.join' expects string at argument 2");
      }

      return {
        type: 'string',
        value: elements.map((element) => runtimeValueToBuiltinString(element)).join(separator?.value ?? ','),
      };
    },
    name: 'Array.join',
    type: 'native-function',
  });

  exports.set('at', {
    call: ([array, index]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.at', 1);
      const requestedIndex = Math.trunc(expectNumberArgument(index, 'Array.at', 2));
      const normalizedIndex = requestedIndex >= 0 ? requestedIndex : elements.length + requestedIndex;

      return getArrayElementAt(elements, normalizedIndex, 'Array.at');
    },
    name: 'Array.at',
    type: 'native-function',
  });

  exports.set('shift', {
    call: ([array]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.shift', 1);
      const value = elements.shift();

      if (value === undefined) {
        throw createReferenceError("'Array.shift' cannot remove from an empty array");
      }

      return value;
    },
    name: 'Array.shift',
    type: 'native-function',
  });

  exports.set('unshift', {
    call: ([array, ...values]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.unshift', 1);
      elements.unshift(...values);
      return createNumberValue(elements.length, 'int');
    },
    name: 'Array.unshift',
    type: 'native-function',
  });

  exports.set('concat', {
    call: ([left, right]): RuntimeValue => ({
      elements: [...expectArrayArgument(left, 'Array.concat', 1), ...expectArrayArgument(right, 'Array.concat', 2)],
      type: 'array',
    }),
    name: 'Array.concat',
    type: 'native-function',
  });

  exports.set('fill', {
    call: ([array, value, start, end]): RuntimeValue => {
      const elements = expectArrayArgument(array, 'Array.fill', 1);

      if (value === undefined) {
        throw createTypeError("'Array.fill' expects value at argument 2");
      }

      const startIndex = start === undefined ? 0 : Math.trunc(expectNumberArgument(start, 'Array.fill', 3));
      const endIndex = end === undefined ? elements.length : Math.trunc(expectNumberArgument(end, 'Array.fill', 4));

      elements.fill(value, startIndex, endIndex);
      return array ?? { elements, type: 'array' };
    },
    name: 'Array.fill',
    type: 'native-function',
  });

  return exports;
}

function createArraySemanticExports(): SemanticModuleExports {
  const exports = new Map<string, SemanticSymbol>();

  exports.set('length', {
    ...createSemanticFunction('int', ['T[]'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'length',
  });
  exports.set('push', {
    ...createSemanticFunction('int', ['T[]', 'T'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'push',
  });
  exports.set('pop', {
    ...createSemanticFunction('T', ['T[]'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'pop',
  });
  exports.set('slice', {
    ...createSemanticFunction('T[]', ['T[]', 'int', 'int'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'slice',
  });
  exports.set('includes', {
    ...createSemanticFunction('boolean', ['T[]', 'T'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'includes',
  });
  exports.set('indexOf', {
    ...createSemanticFunction('int', ['T[]', 'T'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'indexOf',
  });
  exports.set('clear', {
    ...createSemanticFunction('void', ['T[]'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'clear',
  });
  exports.set('reverse', {
    ...createSemanticFunction('T[]', ['T[]'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'reverse',
  });
  exports.set('join', {
    ...createSemanticFunction('string', ['T[]', 'string'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'join',
  });
  exports.set('at', {
    ...createSemanticFunction('T', ['T[]', 'int'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'at',
  });
  exports.set('shift', {
    ...createSemanticFunction('T', ['T[]'], 1, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'shift',
  });
  exports.set('unshift', {
    ...createSemanticFunction('int', ['T[]', 'T[]'], 1, 'T[]', undefined, ARRAY_TYPE_PARAMETERS),
    name: 'unshift',
  });
  exports.set('concat', {
    ...createSemanticFunction('T[]', ['T[]', 'T[]'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'concat',
  });
  exports.set('fill', {
    ...createSemanticFunction('T[]', ['T[]', 'T', 'int', 'int'], 2, undefined, undefined, ARRAY_TYPE_PARAMETERS),
    name: 'fill',
  });

  return exports;
}

function createStringRuntimeExports(): RuntimeModuleExports {
  const exports = new Map<string, RuntimeValue>();

  exports.set('length', {
    call: ([value]): RuntimeValue => createNumberValue(expectStringArgument(value, 'String.length', 1).length, 'int'),
    name: 'String.length',
    type: 'native-function',
  });

  exports.set('slice', {
    call: ([value, start, end]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.slice', 1).slice(
        expectIntegerArgument(start, 'String.slice', 2),
        end === undefined ? undefined : expectIntegerArgument(end, 'String.slice', 3)
      ),
    }),
    name: 'String.slice',
    type: 'native-function',
  });

  exports.set('includes', {
    call: ([value, search]): RuntimeValue => ({
      type: 'boolean',
      value: expectStringArgument(value, 'String.includes', 1).includes(
        expectStringArgument(search, 'String.includes', 2)
      ),
    }),
    name: 'String.includes',
    type: 'native-function',
  });

  exports.set('indexOf', {
    call: ([value, search]): RuntimeValue =>
      createNumberValue(
        expectStringArgument(value, 'String.indexOf', 1).indexOf(expectStringArgument(search, 'String.indexOf', 2)),
        'int'
      ),
    name: 'String.indexOf',
    type: 'native-function',
  });

  exports.set('startsWith', {
    call: ([value, prefix]): RuntimeValue => ({
      type: 'boolean',
      value: expectStringArgument(value, 'String.startsWith', 1).startsWith(
        expectStringArgument(prefix, 'String.startsWith', 2)
      ),
    }),
    name: 'String.startsWith',
    type: 'native-function',
  });

  exports.set('endsWith', {
    call: ([value, suffix]): RuntimeValue => ({
      type: 'boolean',
      value: expectStringArgument(value, 'String.endsWith', 1).endsWith(
        expectStringArgument(suffix, 'String.endsWith', 2)
      ),
    }),
    name: 'String.endsWith',
    type: 'native-function',
  });

  exports.set('repeat', {
    call: ([value, count]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.repeat', 1).repeat(expectIntegerArgument(count, 'String.repeat', 2)),
    }),
    name: 'String.repeat',
    type: 'native-function',
  });

  exports.set('trim', {
    call: ([value]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.trim', 1).trim(),
    }),
    name: 'String.trim',
    type: 'native-function',
  });

  exports.set('trimStart', {
    call: ([value]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.trimStart', 1).trimStart(),
    }),
    name: 'String.trimStart',
    type: 'native-function',
  });

  exports.set('trimEnd', {
    call: ([value]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.trimEnd', 1).trimEnd(),
    }),
    name: 'String.trimEnd',
    type: 'native-function',
  });

  exports.set('toLowerCase', {
    call: ([value]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.toLowerCase', 1).toLowerCase(),
    }),
    name: 'String.toLowerCase',
    type: 'native-function',
  });

  exports.set('toUpperCase', {
    call: ([value]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.toUpperCase', 1).toUpperCase(),
    }),
    name: 'String.toUpperCase',
    type: 'native-function',
  });

  exports.set('at', {
    call: ([value, index]): RuntimeValue => ({
      type: 'string',
      value: getStringCharacterAt(
        expectStringArgument(value, 'String.at', 1),
        expectIntegerArgument(index, 'String.at', 2),
        'String.at'
      ),
    }),
    name: 'String.at',
    type: 'native-function',
  });

  exports.set('split', {
    call: ([value, separator]): RuntimeValue => ({
      elements: expectStringArgument(value, 'String.split', 1)
        .split(expectStringArgument(separator, 'String.split', 2))
        .map((element) => ({ type: 'string', value: element })),
      type: 'array',
    }),
    name: 'String.split',
    type: 'native-function',
  });

  exports.set('replace', {
    call: ([value, search, replacement]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.replace', 1).replace(
        expectStringArgument(search, 'String.replace', 2),
        expectStringArgument(replacement, 'String.replace', 3)
      ),
    }),
    name: 'String.replace',
    type: 'native-function',
  });

  exports.set('padStart', {
    call: ([value, maxLength, fillString]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.padStart', 1).padStart(
        expectIntegerArgument(maxLength, 'String.padStart', 2),
        fillString === undefined ? ' ' : expectStringArgument(fillString, 'String.padStart', 3)
      ),
    }),
    name: 'String.padStart',
    type: 'native-function',
  });

  exports.set('padEnd', {
    call: ([value, maxLength, fillString]): RuntimeValue => ({
      type: 'string',
      value: expectStringArgument(value, 'String.padEnd', 1).padEnd(
        expectIntegerArgument(maxLength, 'String.padEnd', 2),
        fillString === undefined ? ' ' : expectStringArgument(fillString, 'String.padEnd', 3)
      ),
    }),
    name: 'String.padEnd',
    type: 'native-function',
  });

  return exports;
}

function createStringSemanticExports(): SemanticModuleExports {
  const exports = new Map<string, SemanticSymbol>();

  exports.set('length', { ...createSemanticFunction('int', ['string'], 1), name: 'length' });
  exports.set('slice', { ...createSemanticFunction('string', ['string', 'int', 'int'], 2), name: 'slice' });
  exports.set('includes', { ...createSemanticFunction('boolean', ['string', 'string'], 2), name: 'includes' });
  exports.set('indexOf', { ...createSemanticFunction('int', ['string', 'string'], 2), name: 'indexOf' });
  exports.set('startsWith', { ...createSemanticFunction('boolean', ['string', 'string'], 2), name: 'startsWith' });
  exports.set('endsWith', { ...createSemanticFunction('boolean', ['string', 'string'], 2), name: 'endsWith' });
  exports.set('repeat', { ...createSemanticFunction('string', ['string', 'int'], 2), name: 'repeat' });
  exports.set('trim', { ...createSemanticFunction('string', ['string'], 1), name: 'trim' });
  exports.set('trimStart', { ...createSemanticFunction('string', ['string'], 1), name: 'trimStart' });
  exports.set('trimEnd', { ...createSemanticFunction('string', ['string'], 1), name: 'trimEnd' });
  exports.set('toLowerCase', { ...createSemanticFunction('string', ['string'], 1), name: 'toLowerCase' });
  exports.set('toUpperCase', { ...createSemanticFunction('string', ['string'], 1), name: 'toUpperCase' });
  exports.set('at', { ...createSemanticFunction('string', ['string', 'int'], 2), name: 'at' });
  exports.set('split', { ...createSemanticFunction('string[]', ['string', 'string'], 2), name: 'split' });
  exports.set('replace', {
    ...createSemanticFunction('string', ['string', 'string', 'string'], 3),
    name: 'replace',
  });
  exports.set('padStart', { ...createSemanticFunction('string', ['string', 'int', 'string'], 2), name: 'padStart' });
  exports.set('padEnd', { ...createSemanticFunction('string', ['string', 'int', 'string'], 2), name: 'padEnd' });

  return exports;
}

const BUILTIN_MODULES = new Map<
  string,
  {
    runtimeExports: RuntimeModuleExports;
    semanticExports: SemanticModuleExports;
  }
>([
  ['array', { runtimeExports: createArrayRuntimeExports(), semanticExports: createArraySemanticExports() }],
  ['math', { runtimeExports: createMathRuntimeExports(), semanticExports: createMathSemanticExports() }],
  ['string', { runtimeExports: createStringRuntimeExports(), semanticExports: createStringSemanticExports() }],
]);

export function getBuiltinModuleRuntimeExports(source: string): RuntimeModuleExports | undefined {
  return BUILTIN_MODULES.get(source)?.runtimeExports;
}

export function getBuiltinModuleSemanticExports(source: string): SemanticModuleExports | undefined {
  return BUILTIN_MODULES.get(source)?.semanticExports;
}

export function isBuiltinModule(source: string): boolean {
  return BUILTIN_MODULES.has(source);
}
