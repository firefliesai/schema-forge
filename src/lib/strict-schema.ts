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
import { makeNullable } from './resolve';

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
}

const OPENAI_RULES: StrictRules = {
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
};

const ANTHROPIC_RULES: StrictRules = {
  rejected: [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
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
};

/** Keys whose value is one subschema. */
const SUBSCHEMA_KEYS = ['items', 'additionalItems', 'not', 'if', 'then', 'else', 'contains'];
/** Keys whose value is a list of subschemas. */
const SUBSCHEMA_LIST_KEYS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'];
/** Keys whose value maps names to subschemas. */
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions'];

function strictify(schema: any, rules: StrictRules, makeOptionalNullable: boolean): any {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
  const result: any = { ...schema };

  for (const key of SUBSCHEMA_KEYS) {
    if (result[key] !== undefined) {
      result[key] = strictify(result[key], rules, makeOptionalNullable);
    }
  }
  for (const key of SUBSCHEMA_LIST_KEYS) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((entry: any) => strictify(entry, rules, makeOptionalNullable));
    }
  }
  for (const key of SUBSCHEMA_MAP_KEYS) {
    if (result[key] && typeof result[key] === 'object') {
      result[key] = Object.fromEntries(
        Object.entries(result[key]).map(([name, entry]) => [
          name,
          strictify(entry, rules, makeOptionalNullable),
        ]),
      );
    }
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

  const moved: [string, unknown][] = [];
  for (const key of rules.rejected) {
    if (key in result) {
      moved.push([key, result[key]]);
      delete result[key];
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
  if (rules.enumWithoutTypeArray && Array.isArray(result.enum) && Array.isArray(result.type)) {
    // The enum values already carry their types (null included); the API rejects the pair
    delete result.type;
  }

  if (moved.length > 0) {
    const note = `{${moved.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')}}`;
    result.description = result.description ? `${result.description}\n\n${note}` : note;
  }
  return result;
}

/**
 * Prepares a JSON Schema for OpenAI structured outputs and strict function calling.
 *
 * - Every object that declares properties gets `additionalProperties: false`, and all of its
 *   properties are listed in `required`.
 * - With `handleOptionals`, a property that was not required becomes nullable instead
 *   (`type: ['string', 'null']`, `null` added to an `enum`, or a `null` branch for a composition),
 *   so the model can still leave it empty.
 * - Keywords OpenAI strict mode rejects are moved into the description: `uniqueItems`, `contains`,
 *   `minContains`, `maxContains`, `unevaluatedItems`, `minProperties`, `maxProperties`,
 *   `propertyNames`, `unevaluatedProperties`, and a `format` other than `date-time`, `time`,
 *   `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6` and `uuid`. Everything else is kept,
 *   including `minLength`, `maxLength`, `pattern`, number bounds, `multipleOf`, `minItems` and
 *   `maxItems`, which OpenAI enforces.
 *
 * Composition keywords OpenAI rejects (`allOf`, `oneOf`, `not`) are left as they are: they only
 * appear when you wrote them, and the API's error names them.
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
 *   `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `maxItems`, `minItems` other than 0 or
 *   1, `uniqueItems`, `contains`, `minContains`, `maxContains`, `minProperties`, `maxProperties`,
 *   `propertyNames`, `patternProperties`, `unevaluatedProperties`, and a `format` other than
 *   `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6` and `uuid`.
 * - An `enum` next to a `type` array (a nullable or mixed-type enum) loses the `type`: the API
 *   rejects the pair, and the enum's values already say which types are allowed.
 *
 * @public
 * @param schema The JSON Schema object to prepare
 * @returns A new JSON Schema object; the input is not changed
 */
export function prepareForAnthropicStrictTool(schema: any): any {
  return strictify(schema, ANTHROPIC_RULES, false);
}
