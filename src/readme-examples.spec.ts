/**
 * Keeps README.md honest: every ```typescript example must compile under `strict`, and every
 * example whose result is shown in a comment that starts with `// {` must produce that result.
 *
 * The examples are one story: a class defined in one example is used by later ones. So the class
 * and enum declarations of all examples are placed in one module, in README order, and the other
 * statements of each example run in a function of their own. Examples that call a provider API
 * (they contain `await`) are compiled but not run, so this spec needs no network or keys.
 *
 * In an expected-result comment, `{…}` and `'…'` match any value.
 */
import 'reflect-metadata';

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const README = path.join(__dirname, '..', 'README.md');
/** Not written to disk: the compiler host serves it, so imports resolve from `src/`. */
const MODULE_PATH = path.join(__dirname, '__readme_examples__.ts');
const ANY = '__readme_any__';

/** Provider clients the examples use without declaring them again after their first example. */
const CONTINUED = `declare const openai: OpenAI;
declare const anthropic: Anthropic;
declare const gemini: GoogleGenAI;
declare const prompt: string;
`;

interface Example {
  readmeLine: number;
  code: string;
}

interface ExpectedOutput {
  readmeLine: number;
  example: number;
  value: unknown;
}

interface ExampleModule {
  source: string;
  expected: ExpectedOutput[];
  /** Generated line → README line, for compiler messages */
  lineMap: { generatedLine: number; readmeLine: number }[];
  runnable: number[];
}

function extractExamples(markdown: string): Example[] {
  const examples: Example[] = [];
  const fence = /```typescript\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown))) {
    const readmeLine = markdown.slice(0, match.index).split('\n').length + 1;
    examples.push({ readmeLine, code: match[1] });
  }
  return examples;
}

/** Opening minus closing brackets on a line, outside quoted strings. */
function bracketBalance(line: string): number {
  let balance = 0;
  let quote: string | null = null;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '{' || char === '[') {
      balance++;
    } else if (char === '}' || char === ']') {
      balance--;
    }
  }
  return balance;
}

function parseExpected(lines: string[], readmeLine: number): unknown {
  const text = lines
    .map((line) => line.replace(/^\/\/ ?/, ''))
    .join('\n')
    .replace(/\{…\}/g, `'${ANY}'`)
    .replace(/'…'/g, `'${ANY}'`);
  try {
    return new Function(`return (${text});`)();
  } catch (error) {
    throw new Error(`README line ${readmeLine}: cannot read the expected result: ${error}`);
  }
}

function buildModule(examples: Example[]): ExampleModule {
  const schemaForgeNames = new Set<string>();
  const namedImports = new Map<string, Set<string>>();
  const otherImports = new Set<string>();
  const declarations: string[] = [];
  const functions: string[] = [];
  const expected: ExpectedOutput[] = [];
  const runnable: number[] = [];

  examples.forEach((example, index) => {
    const { code, readmeLine } = example;
    const file = ts.createSourceFile(`example-${index}.ts`, code, ts.ScriptTarget.ES2022, true);
    const lineOf = (pos: number) => readmeLine + file.getLineAndCharacterOfPosition(pos).line;

    // Expected results: `//` lines from one starting with `// {` until its brackets close
    const outputs: { start: number; lines: string[] }[] = [];
    const codeLines = code.split('\n');
    let offset = 0;
    for (let i = 0; i < codeLines.length; i++) {
      if (codeLines[i].startsWith('// {')) {
        const lines: string[] = [];
        const start = offset;
        let depth = 0;
        do {
          lines.push(codeLines[i]);
          depth += bracketBalance(codeLines[i]);
          offset += codeLines[i].length + 1;
          i++;
        } while (depth > 0 && i < codeLines.length && codeLines[i].startsWith('//'));
        outputs.push({ start, lines });
        i--;
        continue;
      }
      offset += codeLines[i].length + 1;
    }

    const body: string[] = [];
    for (const statement of file.statements) {
      const text = code.slice(statement.getFullStart(), statement.end);
      if (ts.isImportDeclaration(statement)) {
        const from = (statement.moduleSpecifier as ts.StringLiteral).text;
        const bindings = statement.importClause?.namedBindings;
        if (from === '@firefliesai/schema-forge' && bindings && ts.isNamedImports(bindings)) {
          bindings.elements.forEach((element) => schemaForgeNames.add(element.name.text));
        } else if (from === 'reflect-metadata') {
          // imported once, below
        } else if (bindings && ts.isNamedImports(bindings) && !statement.importClause?.name) {
          const names = namedImports.get(from) ?? new Set<string>();
          bindings.elements.forEach((element) => names.add(element.name.text));
          namedImports.set(from, names);
        } else {
          otherImports.add(text.trim());
        }
        continue;
      }
      if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
        declarations.push(`// README line ${lineOf(statement.getStart())}\n${text.trim()}`);
        continue;
      }
      const output = outputs.find(
        (candidate) =>
          candidate.start >= statement.end &&
          !file.statements.some(
            (other) => other.pos >= statement.end && other.end <= candidate.start,
          ),
      );
      if (!output) {
        body.push(text);
        continue;
      }
      const outputLine = lineOf(output.start);
      expected.push({
        readmeLine: outputLine,
        example: index,
        value: parseExpected(output.lines, outputLine),
      });
      if (
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.length === 1 &&
        ts.isIdentifier(statement.declarationList.declarations[0].name)
      ) {
        const name = statement.declarationList.declarations[0].name.text;
        body.push(`${text}\n__out.push([${outputLine}, ${name}]);`);
      } else if (ts.isExpressionStatement(statement)) {
        body.push(`\n__out.push([${outputLine}, (${statement.expression.getText()})]);`);
      } else {
        throw new Error(
          `README line ${outputLine}: a result comment must follow a const or an expression`,
        );
      }
    }
    const isAsync = /\bawait\b/.test(code);
    if (!isAsync) runnable.push(index);
    functions.push(
      `// README line ${readmeLine}\nexport ${isAsync ? 'async ' : ''}function __example_${index}(__out: unknown[][]) {${body.join('')}\n}`,
    );
  });

  const header = [
    "import 'reflect-metadata';",
    `import { ${[...schemaForgeNames].sort().join(', ')} } from './schema-forge';`,
    ...[...namedImports].map(
      ([from, names]) => `import { ${[...names].sort().join(', ')} } from '${from}';`,
    ),
    ...otherImports,
    CONTINUED,
  ];
  const parts = [...header, ...declarations, ...functions];
  const source = parts.join('\n');

  const lineMap: ExampleModule['lineMap'] = [];
  source.split('\n').forEach((line, index) => {
    const marker = /^\/\/ README line (\d+)$/.exec(line);
    if (marker) lineMap.push({ generatedLine: index + 1, readmeLine: Number(marker[1]) });
  });
  return { source, expected, lineMap, runnable };
}

function compile(source: string): { diagnostics: ts.Diagnostic[]; js: string } {
  const options: ts.CompilerOptions = {
    strict: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ['jest', 'node'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    path.resolve(fileName) === MODULE_PATH
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : getSourceFile(fileName, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => path.resolve(fileName) === MODULE_PATH || fileExists(fileName);
  const program = ts.createProgram([MODULE_PATH], options, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) => !diagnostic.file || path.resolve(diagnostic.file.fileName) === MODULE_PATH,
    );
  let js = '';
  program.emit(program.getSourceFile(MODULE_PATH), (fileName, text) => {
    if (fileName.endsWith('.js')) js = text;
  });
  return { diagnostics, js };
}

function matches(actual: unknown, expected: unknown): boolean {
  if (expected === ANY) return true;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matches(actual[index], item))
    );
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const keys = Object.keys(expected);
    return (
      keys.length === Object.keys(actual).length &&
      keys.every((key) => matches((actual as any)[key], (expected as any)[key]))
    );
  }
  return actual === expected;
}

describe('README examples', () => {
  const examples = extractExamples(fs.readFileSync(README, 'utf8'));
  const built = buildModule(examples);
  let compiled: ReturnType<typeof compile>;

  beforeAll(() => {
    compiled = compile(built.source);
  });

  it('has examples and expected results to check', () => {
    expect(examples.length).toBeGreaterThan(5);
    expect(built.expected.length).toBeGreaterThan(3);
  });

  it('compile under strict', () => {
    const messages = compiled.diagnostics.map((diagnostic) => {
      const line = diagnostic.file
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1
        : 0;
      const nearest = [...built.lineMap].reverse().find((entry) => entry.generatedLine <= line);
      return `README near line ${nearest?.readmeLine ?? '?'}: ${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      )}`;
    });
    expect(messages).toEqual([]);
  });

  it('print the results their comments show', () => {
    const module = { exports: {} as Record<string, (out: unknown[][]) => void> };
    // Jest's own require, so the examples share this spec's instance of the package
    const load = (id: string) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      id === './schema-forge' ? require('./schema-forge') : require(id);
    new Function('require', 'module', 'exports', 'expect', compiled.js)(
      load,
      module,
      module.exports,
      expect,
    );
    const actual = new Map<number, unknown>();
    for (const index of built.runnable) {
      const out: unknown[][] = [];
      module.exports[`__example_${index}`](out);
      out.forEach(([line, value]) => actual.set(line as number, value));
    }
    const mismatches = built.expected
      .filter(
        (output) =>
          !actual.has(output.readmeLine) || !matches(actual.get(output.readmeLine), output.value),
      )
      .map(
        (output) =>
          `README line ${output.readmeLine}: expected ${JSON.stringify(output.value)}, got ${JSON.stringify(
            actual.get(output.readmeLine),
          )}`,
      );
    expect(mismatches).toEqual([]);
  });
});
