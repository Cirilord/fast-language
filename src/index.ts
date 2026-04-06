import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './runtime';

const filePath = resolve(process.cwd(), 'main.fast');
const source = readFileSync(filePath, 'utf-8');

const lexer = new Lexer(source);
const tokens = lexer.tokenize();
const parser = new Parser(tokens);
const program = parser.parseProgram();
const interpreter = new Interpreter();

interpreter.execute(program);
