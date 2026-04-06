import type { SourceLocation } from './ast';

function formatErrorMessage(message: string, location?: SourceLocation): string {
  const suffix = location === undefined ? '' : ` at line ${location.line}, column ${location.column}`;

  return `${message}${suffix}.`;
}

export function createReferenceError(message: string, location?: SourceLocation): ReferenceError {
  return new ReferenceError(formatErrorMessage(message, location));
}

export function createSyntaxError(message: string, location?: SourceLocation): SyntaxError {
  return new SyntaxError(formatErrorMessage(message, location));
}

export function createTypeError(message: string, location?: SourceLocation): TypeError {
  return new TypeError(formatErrorMessage(message, location));
}
