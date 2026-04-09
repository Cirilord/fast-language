import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

import type { Program } from './ast';
import { getBuiltinModuleRuntimeExports, getBuiltinModuleSemanticExports, isBuiltinModule } from './builtin-modules';
import { createReferenceError } from './errors';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, type RuntimeModuleExports } from './runtime';
import { SemanticAnalyzer, type SemanticModuleExports } from './semantic';

export class ModuleLoader {
  private readonly analyzing = new Set<string>();
  private readonly executing = new Set<string>();
  private readonly programs = new Map<string, Program>();
  private readonly runtimeExports = new Map<string, RuntimeModuleExports>();
  private readonly semanticExports = new Map<string, SemanticModuleExports>();

  public executeEntry(filePath: string): void {
    this.executeFile(this.normalizeFilePath(filePath));
  }

  private analyzeFile(filePath: string): SemanticModuleExports {
    const cachedExports = this.semanticExports.get(filePath);

    if (cachedExports !== undefined) {
      return cachedExports;
    }

    if (this.analyzing.has(filePath)) {
      throw createReferenceError(`Circular import detected while analyzing '${filePath}'`);
    }

    this.analyzing.add(filePath);

    try {
      const program = this.parseFile(filePath);
      const analyzer = new SemanticAnalyzer(
        (source): SemanticModuleExports => this.resolveSemanticImport(source, filePath)
      );

      analyzer.analyze(program);
      const moduleExports = analyzer.getExports();
      this.semanticExports.set(filePath, moduleExports);

      return moduleExports;
    } finally {
      this.analyzing.delete(filePath);
    }
  }

  private executeFile(filePath: string): RuntimeModuleExports {
    const cachedExports = this.runtimeExports.get(filePath);

    if (cachedExports !== undefined) {
      return cachedExports;
    }

    if (this.executing.has(filePath)) {
      throw createReferenceError(`Circular import detected while executing '${filePath}'`);
    }

    this.analyzeFile(filePath);
    this.executing.add(filePath);

    try {
      const program = this.parseFile(filePath);
      const interpreter = new Interpreter(
        (source): RuntimeModuleExports => this.resolveRuntimeImport(source, filePath)
      );

      interpreter.execute(program);
      const moduleExports = interpreter.getExports();
      this.runtimeExports.set(filePath, moduleExports);

      return moduleExports;
    } finally {
      this.executing.delete(filePath);
    }
  }

  private normalizeFilePath(filePath: string): string {
    return resolve(filePath);
  }

  private parseFile(filePath: string): Program {
    const cachedProgram = this.programs.get(filePath);

    if (cachedProgram !== undefined) {
      return cachedProgram;
    }

    const source = readFileSync(filePath, 'utf-8');
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parseProgram();

    this.programs.set(filePath, program);
    return program;
  }

  private resolveModulePath(source: string, importerPath: string): string {
    if (isBuiltinModule(source)) {
      return source;
    }

    const rawPath = isAbsolute(source) ? source : resolve(dirname(importerPath), source);

    if (extname(rawPath) === '') {
      return `${rawPath}.fast`;
    }

    return rawPath;
  }

  private resolveRuntimeImport(source: string, importerPath: string): RuntimeModuleExports {
    const builtinExports = getBuiltinModuleRuntimeExports(source);

    if (builtinExports !== undefined) {
      return builtinExports;
    }

    return this.executeFile(this.resolveModulePath(source, importerPath));
  }

  private resolveSemanticImport(source: string, importerPath: string): SemanticModuleExports {
    const builtinExports = getBuiltinModuleSemanticExports(source);

    if (builtinExports !== undefined) {
      return builtinExports;
    }

    return this.analyzeFile(this.resolveModulePath(source, importerPath));
  }
}
