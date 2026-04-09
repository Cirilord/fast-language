import type { NumberLiteralType, TypeParameter } from './ast';
import { createTypeError } from './errors';
import type { RuntimeModuleExports, RuntimeValue } from './runtime';
import type { CallableSignature, SemanticModuleExports, SemanticSymbol } from './semantic';

const EMPTY_TYPE_PARAMETERS: TypeParameter[] = [];

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
  overloadSignatures?: CallableSignature[]
): SemanticSymbol {
  const symbol: SemanticSymbol = {
    callable: true,
    minArity,
    mutable: false,
    name: '',
    parameterTypes,
    returnType,
    type: 'function',
    typeParameters: EMPTY_TYPE_PARAMETERS,
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
  const numberTypes: NumberLiteralType[] = ['int', 'float', 'double'];
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

const BUILTIN_MODULES = new Map<
  string,
  {
    runtimeExports: RuntimeModuleExports;
    semanticExports: SemanticModuleExports;
  }
>([['math', { runtimeExports: createMathRuntimeExports(), semanticExports: createMathSemanticExports() }]]);

export function getBuiltinModuleRuntimeExports(source: string): RuntimeModuleExports | undefined {
  return BUILTIN_MODULES.get(source)?.runtimeExports;
}

export function getBuiltinModuleSemanticExports(source: string): SemanticModuleExports | undefined {
  return BUILTIN_MODULES.get(source)?.semanticExports;
}

export function isBuiltinModule(source: string): boolean {
  return BUILTIN_MODULES.has(source);
}
