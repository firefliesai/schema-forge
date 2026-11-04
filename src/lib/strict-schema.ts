/**
 * Adapting a JSON Schema to a provider's strict mode.
 *
 * Strict modes (OpenAI structured outputs and strict function calling, Anthropic strict tool use)
 * accept only part of JSON Schema and reject a request that uses anything else. The keyword lists
 * below are the ones each API rejected when sent in a strict tool, checked against the live APIs;
 * where a provider's documentation and its API disagreed, the API decided. A keyword that has to go
 * is not lost: it is added to the property's description, as `{keyword: value}`, which is how
 * Anthropic's own SDK keeps such rules visible to the model.
 */
import { makeNullable, noteInDescription, typeIncludes } from './resolve';

/** The largest `{n,m}` bound kept under Anthropic strict mode (see `unsupportedRegexConstruct`). */
const MAX_QUANTIFIER_BOUND = 256;

/**
 * The first regular-expression construct in a `pattern` that both strict modes cannot use, or
 * `undefined`. Checked against the live APIs (November 2026): Anthropic rejects these with a 400,
 * and OpenAI either rejects them (a named group) or returns an empty response that stops at the
 * token limit (lookahead, lookbehind, a backreference, `\b`, `\B`). They are a group that starts
 * with `(?` other than a non-capturing `(?:` (lookahead, lookbehind, a named group, inline flags),
 * a backreference (`\1` to `\9`, `\k<name>`), and a word boundary (`\b`, `\B`). Escaped characters
 * and character classes are skipped, so `\(?=` and `[(?=]` match literal characters and are
 * accepted.
 *
 * With `limitQuantifiers` (Anthropic), a `{n}`, `{n,}` or `{n,m}` quantifier is unsupported too
 * when it applies to a broad set, or when a bound is above `MAX_QUANTIFIER_BOUND`. Measured: a
 * quantifier on `.`, a negated class (`[^x]`), `\S`, `\D`, `\W`, or a class or group holding one,
 * answers `Cannot apply a range quantifier to this regex` even for `.{5}`, while `.+`,
 * `[a-z]{1,256}` and `\w{1,64}` pass; `{1,2000}` alone, or `{1,1000}` next to another quantifier,
 * answers
 * `pattern is too complex` / `Schema is too complex`, while bounds up to 500 passed. Anthropic's
 * guide lists large `{n,m}` ranges as unsupported without a number, so the bound is conservative.
 * OpenAI accepted all of these.
 */
export function unsupportedRegexConstruct(
  pattern: string,
  limitQuantifiers = false,
): string | undefined {
  let inClass = false;
  let classBroad = false;
  let lastAtomBroad = false;
  // For each open group: whether it holds a broad atom, so a quantifier on the group counts too
  const groups: boolean[] = [];
  const atom = (broad: boolean) => {
    lastAtomBroad = broad;
    if (broad && groups.length > 0) groups[groups.length - 1] = true;
  };
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      const next = pattern[i + 1] ?? '';
      if (inClass) {
        if ('SDW'.includes(next) && next) classBroad = true;
      } else {
        if (next === 'b' || next === 'B') return `\\${next}`;
        if ((next >= '1' && next <= '9') || (next === 'k' && pattern[i + 2] === '<')) {
          return 'a backreference';
        }
        atom(!!next && 'SDW'.includes(next));
      }
      i++;
      continue;
    }
    if (inClass) {
      if (char === ']') {
        inClass = false;
        atom(classBroad);
      }
      continue;
    }
    if (char === '[') {
      inClass = true;
      classBroad = pattern[i + 1] === '^';
    } else if (char === '(') {
      if (pattern[i + 1] === '?' && pattern[i + 2] !== ':') {
        return `a group starting with "(?${pattern[i + 2] ?? ''}"`;
      }
      groups.push(false);
      if (pattern[i + 1] === '?') i += 2;
      lastAtomBroad = false;
    } else if (char === ')') {
      atom(groups.pop() ?? false);
    } else if (char === '.') {
      atom(true);
    } else if (char === '{' && limitQuantifiers) {
      const quantifier = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(i));
      if (quantifier) {
        if (lastAtomBroad) {
          return 'a {…} quantifier on a broad set (., [^…], \\S, \\D or \\W)';
        }
        const bounds = [quantifier[1], quantifier[2]].filter(Boolean).map(Number);
        if (bounds.some((bound) => bound > MAX_QUANTIFIER_BOUND)) {
          return `a {…} quantifier above ${MAX_QUANTIFIER_BOUND}`;
        }
        i += quantifier[0].length - 1;
      } else {
        atom(false);
      }
    } else if (!'*+?'.includes(char)) {
      // A quantifier repeats the atom before it; anything else is a new atom
      atom(false);
    }
  }
  return undefined;
}

/** String formats OpenAI strict mode accepts (anything else, such as `uri`, is rejected). */
const OPENAI_STRICT_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
]);

/** String formats Anthropic strict tool use accepts. */
const ANTHROPIC_STRICT_FORMATS = new Set([...OPENAI_STRICT_FORMATS, 'uri']);

/** What one provider's strict mode rejects, and how it wants objects. */
interface StrictRules {
  /** The provider's name, for error messages. */
  provider: string;
  /** Keywords rejected wherever they appear. */
  rejected: string[];
  /** String formats accepted; any other `format` is moved to the description. */
  formats: Set<string>;
  /** Whether a `minItems` value is accepted (Anthropic accepts only 0 and 1). */
  minItemsAllowed: (value: unknown) => boolean;
  /** Every property of an object must be listed in `required` (OpenAI). */
  allRequired: boolean;
  /** An `enum` must not sit next to a `type` array (Anthropic); the enum alone is kept. */
  enumWithoutTypeArray: boolean;
  /** `{n,m}` on a broad set or with a large bound is not supported (Anthropic). */
  limitQuantifiers: boolean;
}

const OPENAI_RULES: StrictRules = {
  provider: 'OpenAI',
  rejected: [
    'uniqueItems',
    'contains',
    'minContains',
    'maxContains',
    'unevaluatedItems',
    'minProperties',
    'maxProperties',
    'propertyNames',
    'unevaluatedProperties',
  ],
  formats: OPENAI_STRICT_FORMATS,
  minItemsAllowed: () => true,
  allRequired: true,
  enumWithoutTypeArray: false,
  limitQuantifiers: false,
};

const ANTHROPIC_RULES: StrictRules = {
  provider: 'Anthropic',
  rejected: [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    // Anthropic's JSON Schema limitations list string lengths as unsupported. The API accepted
    // them in November 2026, but following the documented rule keeps a tool working if that
    // changes, and matches what Anthropic's own SDK does.
    'minLength',
    'maxLength',
    'maxItems',
    'uniqueItems',
    'contains',
    'minContains',
    'maxContains',
    'minProperties',
    'maxProperties',
    'propertyNames',
    'patternProperties',
    'unevaluatedProperties',
  ],
  formats: ANTHROPIC_STRICT_FORMATS,
  minItemsAllowed: (value) => value === 0 || value === 1,
  allRequired: false,
  enumWithoutTypeArray: true,
  limitQuantifiers: true,
};

/** Keys whose value is one subschema. */
const SUBSCHEMA_KEYS = ['items', 'additionalItems', 'not', 'if', 'then', 'else', 'contains'];
/** Keys whose value is a list of subschemas. */
const SUBSCHEMA_LIST_KEYS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'];
/** Keys whose value maps names to subschemas. */
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions'];

/** The JSON Schema type name of an enum value (`number` for every number). */
function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

/** Where a subschema is, for error messages: `address.city`, `tags[]`, `value.anyOf[0]` */
function childPath(path: string, step: string): string {
  if (step === '[]') return `${path}[]`;
  return path ? `${path}.${step}` : step;
}

function strictify(schema: any, rules: StrictRules, makeOptionalNullable: boolean, path = ''): any {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
  const result: any = { ...schema };

  // Keywords the provider rejects go into the description first, as they were written: what is
  // inside them is never sent as a schema, so it is neither changed nor checked
  const moved: [string, unknown][] = [];
  for (const key of rules.rejected) {
    if (key in result) {
      moved.push([key, result[key]]);
      delete result[key];
    }
  }

  for (const key of SUBSCHEMA_KEYS) {
    if (key === 'items' && Array.isArray(result.items)) {
      // The tuple form of `items` (draft 7 and earlier): one schema per position
      result.items = result.items.map((entry: any, index: number) =>
        strictify(entry, rules, makeOptionalNullable, `${path}[${index}]`),
      );
    } else if (result[key] !== undefined) {
      const step = key === 'items' ? '[]' : key;
      result[key] = strictify(result[key], rules, makeOptionalNullable, childPath(path, step));
    }
  }
  for (const key of SUBSCHEMA_LIST_KEYS) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((entry: any, index: number) =>
        strictify(entry, rules, makeOptionalNullable, childPath(path, `${key}[${index}]`)),
      );
    }
  }
  for (const key of SUBSCHEMA_MAP_KEYS) {
    if (result[key] && typeof result[key] === 'object') {
      result[key] = Object.fromEntries(
        Object.entries(result[key]).map(([name, entry]) => [
          name,
          strictify(
            entry,
            rules,
            makeOptionalNullable,
            childPath(path, key === 'properties' ? name : `${key}.${name}`),
          ),
        ]),
      );
    }
  }

  // Strict modes need every object closed, and an object with no declared properties cannot be
  // closed without accepting only `{}`; the API would reject it (`additionalProperties` must be
  // false), so it fails here, where the property can be named.
  if (
    typeIncludes(result.type, 'object') &&
    !(result.properties && typeof result.properties === 'object') &&
    result.additionalProperties !== false
  ) {
    throw new Error(
      `schema-forge: ${rules.provider} strict mode cannot express ${path ? `"${path}"` : 'the root'}: ` +
        'it is an object with no declared properties (a free-form object, such as a Record), ' +
        'and strict mode needs every object closed. Declare its properties (for example with a ' +
        'class), or describe it as a string that holds JSON.',
    );
  }

  if (result.properties && typeof result.properties === 'object') {
    result.additionalProperties = false;
    if (rules.allRequired) {
      const declaredRequired: string[] = result.required || [];
      const names = Object.keys(result.properties);
      if (makeOptionalNullable) {
        for (const name of names) {
          if (!declaredRequired.includes(name)) makeNullable(result.properties[name]);
        }
      }
      if (names.length > 0) result.required = names;
    }
  }

  if (result.minItems !== undefined && !rules.minItemsAllowed(result.minItems)) {
    moved.push(['minItems', result.minItems]);
    delete result.minItems;
  }
  if (typeof result.format === 'string' && !rules.formats.has(result.format)) {
    moved.push(['format', result.format]);
    delete result.format;
  }
  if (
    typeof result.pattern === 'string' &&
    unsupportedRegexConstruct(result.pattern, rules.limitQuantifiers)
  ) {
    moved.push(['pattern', result.pattern]);
    delete result.pattern;
  }
  if (rules.enumWithoutTypeArray && Array.isArray(result.enum) && Array.isArray(result.type)) {
    // The API rejects the pair. The enum alone says which types are allowed once it keeps only
    // the values the type array accepted (so `integer` still excludes 1.5)
    const types: string[] = result.type;
    result.enum = result.enum.filter(
      (value: unknown) =>
        types.includes(jsonTypeOf(value)) ||
        (typeof value === 'number' && Number.isInteger(value) && types.includes('integer')),
    );
    delete result.type;
  }

  noteInDescription(result, moved);
  return result;
}

/**
 * Prepares a JSON Schema for OpenAI structured outputs and strict function calling.
 *
 * - Every object that declares properties gets `additionalProperties: false`, and all of its
 *   properties are listed in `required`.
 * - With `handleOptionals`, a property that was not required becomes nullable instead
 *   (`type: ['string', 'null']`, `null` added to an `enum`, or a `null` branch for a composition),
 *   so the model can still leave it empty. Without it (the default, as in 2.x), such a property
 *   is required like the others and the model has to give it a value, even an invented one. Pass
 *   `true` when the schema's `required` lists exactly the properties that must have a value; the
 *   `classTo…` functions do. The default stays `false` because a hand-written schema often has no
 *   `required` at all, and every one of its properties would then become nullable.
 * - Keywords OpenAI strict mode rejects are moved into the description: `uniqueItems`, `contains`,
 *   `minContains`, `maxContains`, `unevaluatedItems`, `minProperties`, `maxProperties`,
 *   `propertyNames`, `unevaluatedProperties`, a `format` other than `date-time`, `time`,
 *   `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6` and `uuid`, and a `pattern` that uses
 *   a construct strict mode cannot run (lookahead, lookbehind, a named group, a backreference,
 *   `\b`, `\B`; OpenAI rejects some and answers the others with an empty response). Everything
 *   else is kept,
 *   including `minLength`, `maxLength`, other patterns, number bounds, `multipleOf`, `minItems`
 *   and `maxItems`, which OpenAI enforces.
 * - Throws for an object with no declared properties (a free-form object, such as a Record): it
 *   cannot be closed, and OpenAI rejects an object that is not.
 *
 * Composition keywords OpenAI rejects (`allOf`, `oneOf`, `not`, at any depth) are left as they
 * are: they only appear when you wrote them, and the API's error names them.
 *
 * @public
 * @param schema The JSON Schema object to prepare
 * @param handleOptionals Whether properties that were not required become nullable
 * @returns A new JSON Schema object; the input is not changed
 *
 * @example
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' }, age: { type: 'number' } },
 *   required: ['name'],
 * };
 * prepareForOpenAIStructuredOutput(schema, true);
 * // { type: 'object', properties: { name: { type: 'string' }, age: { type: ['number', 'null'] } },
 * //   required: ['name', 'age'], additionalProperties: false }
 */
export function prepareForOpenAIStructuredOutput(schema: any, handleOptionals = false): any {
  return strictify(schema, OPENAI_RULES, handleOptionals);
}

/**
 * Prepares a JSON Schema for Anthropic strict tool use (`strict: true` on the tool).
 *
 * - Every object that declares properties gets `additionalProperties: false`. `required` is kept
 *   as declared: Anthropic strict mode allows optional properties.
 * - Keywords Anthropic strict mode rejects are moved into the description: `minimum`, `maximum`,
 *   `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `maxItems`,
 *   `minItems` other than 0 or 1, `uniqueItems`, `contains`, `minContains`, `maxContains`,
 *   `minProperties`, `maxProperties`, `propertyNames`, `patternProperties`,
 *   `unevaluatedProperties`, a `format` other than
 *   `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6` and `uuid`,
 *   and a `pattern` that uses a construct Anthropic rejects (lookahead, lookbehind, a named
 *   group, a backreference, `\b`, `\B`, a `{…}` quantifier on a broad set such as `.`, or a
 *   quantifier bound above 256).
 * - An `enum` next to a `type` array (a nullable or mixed-type enum) loses the `type`: the API
 *   rejects the pair, and the enum's values already say which types are allowed.
 * - Throws for an object with no declared properties (a free-form object, such as a Record): it
 *   cannot be closed, and Anthropic rejects an object that is not.
 *
 * `oneOf` and `not`, which Anthropic strict mode rejects, are left as they are: they only appear
 * when you wrote them, and the API's error names them. `allOf` and `anyOf` are accepted (the guide
 * excludes `allOf` combined with `$ref`, which Schema Forge never emits).
 *
 * @public
 * @param schema The JSON Schema object to prepare
 * @returns A new JSON Schema object; the input is not changed
 */
export function prepareForAnthropicStrictTool(schema: any): any {
  return strictify(schema, ANTHROPIC_RULES, false);
}
