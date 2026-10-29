/**
 * Generation-time resolution of property schemas.
 *
 * `@ToolProp` records what the author wrote and what TypeScript reported (`design:type`). The
 * class-validator decorators of a property are only complete once the whole class is defined, so
 * they are read here, when a schema is generated. That makes the result independent of decorator
 * order, and lets one rule decide precedence:
 *
 *   explicit @ToolProp options  >  class-validator inference  >  TypeScript design type
 *
 * A property whose type cannot be determined is an error instead of a silent `{ type: "object" }`.
 */
import {
  analyzeClassValidatorProperty,
  getClassValidatorPropertyNames,
} from './class-validator-integration';
import { enumSchemaType } from './utils';

export const PROPERTY_SOURCES_METADATA_KEY = Symbol('jsonSchema:propertySources');

export type DesignKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'class'
  | 'object'
  | 'unknown';

/**
 * What a property's stored schema was built from. Only `@ToolProp` writes one; a property added by
 * `addSchemaProperty` has none and is treated as fully explicit.
 */
export interface PropertySource {
  /** Option keys the author set (in `@ToolProp`, `updateSchemaProperty` or `propertyOverrides`) */
  explicit: string[];
  /** What `design:type` said */
  design: DesignKind;
  /** `nullable: true` was set */
  nullable?: boolean;
}

const CONSTRAINT_KEYS = [
  'format',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
] as const;

const ITEM_CONSTRAINT_KEYS = [
  'format',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
] as const;

/** Keys whose presence means the author described the type themselves */
const TYPE_DEFINING_KEYS = ['type', 'enum', 'items', 'anyOf', 'oneOf', 'allOf', 'const'];
const COMPOSITION_KEYS = ['anyOf', 'oneOf', 'allOf'];

const emittedWarnings = new Set<string>();

/**
 * Prints a warning once per process (schemas are often generated several times per class).
 */
export function warnOnce(message: string): void {
  if (emittedWarnings.has(message)) return;
  emittedWarnings.add(message);
  // eslint-disable-next-line no-console -- warnings are the library's only output channel
  console.warn(`[schema-forge] ${message}`);
}

export function getPropertySources(prototype: any): Record<string, PropertySource> {
  return Reflect.getMetadata(PROPERTY_SOURCES_METADATA_KEY, prototype) || {};
}

/**
 * Records the options of a property that were set explicitly after `@ToolProp` (by
 * `updateSchemaProperty` or `propertyOverrides`, which can change a stored property later).
 */
export function markExplicit(
  sources: Record<string, PropertySource>,
  propertyName: string,
  updates: Record<string, unknown>,
): void {
  const source = sources[propertyName];
  if (!source) return;
  source.explicit = [...new Set([...source.explicit, ...Object.keys(updates)])];
  if (updates.nullable !== undefined) source.nullable = updates.nullable === true;
}

const describeDesign = (design: DesignKind): string =>
  design === 'unknown'
    ? 'no design type (is emitDecoratorMetadata enabled?)'
    : 'design type Object (a union such as `T | null`, an interface, a generic, `any` or `unknown`)';

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const typeIncludes = (type: unknown, name: string): boolean =>
  type === name || (Array.isArray(type) && type.includes(name));

/**
 * Explicit `number` vs inferred `integer` and similar refinements are not conflicts worth a
 * warning when the explicit value is the narrower one.
 */
function isTypeConflict(explicitType: unknown, inferredType: string): boolean {
  if (typeIncludes(explicitType, inferredType)) return false;
  if (inferredType === 'number' && typeIncludes(explicitType, 'integer')) return false;
  return true;
}

const ANNOTATION_KEYS = ['description', 'title', 'default', 'examples', 'deprecated'];
const isNullBranch = (branch: any): boolean =>
  branch && typeof branch === 'object' && branch.type === 'null';

/**
 * Applies `nullable: true`.
 * - A plain typed schema: `type` gains `"null"` and `enum` gains `null`.
 * - Only `anyOf` / `oneOf`: a `{ type: "null" }` branch is added.
 * - Anything else that `"null"` in `type` cannot open up (`const`, `allOf`, a composition beside
 *   a `type`): the whole schema becomes one branch of `anyOf: [schema, { type: "null" }]`, with
 *   the annotations kept outside.
 */
export function makeNullable(schema: Record<string, any>): void {
  const compositions = COMPOSITION_KEYS.filter((key) => schema[key]);
  const onlyBranching =
    schema.type === undefined &&
    schema.const === undefined &&
    schema.enum === undefined &&
    compositions.length === 1 &&
    compositions[0] !== 'allOf';
  if (onlyBranching) {
    const key = compositions[0];
    if (!schema[key].some(isNullBranch)) schema[key] = [...schema[key], { type: 'null' }];
    return;
  }
  if (compositions.length > 0 || schema.const !== undefined) {
    const branch: Record<string, any> = {};
    for (const key of Object.keys(schema)) {
      if (ANNOTATION_KEYS.includes(key)) continue;
      branch[key] = schema[key];
      delete schema[key];
    }
    schema.anyOf = [branch, { type: 'null' }];
    return;
  }
  if (schema.type !== undefined && !typeIncludes(schema.type, 'null')) {
    schema.type = Array.isArray(schema.type) ? [...schema.type, 'null'] : [schema.type, 'null'];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) {
    schema.enum = [...schema.enum, null];
  }
}

/**
 * Adds `additionalProperties: false` to every object schema that declares `properties`, at every
 * level (nested objects, array items, composition branches). An object with no declared
 * properties (a free-form `Record`) is left open: closing it would accept only `{}`.
 */
export function closeObjects(schema: any): void {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach(closeObjects);
    return;
  }
  if (schema.properties && typeof schema.properties === 'object') {
    schema.additionalProperties = false;
    Object.values(schema.properties).forEach(closeObjects);
  }
  closeObjects(schema.items);
  for (const key of COMPOSITION_KEYS) closeObjects(schema[key]);
}

/**
 * Resolves the stored property schemas of a class in place: class-validator inference, type
 * checks, `nullable`. Throws when a property's type cannot be determined, when an array has no
 * item type, and when a class-validator decorated property has no `@ToolProp`.
 */
export function resolveProperties(
  target: new (...args: any[]) => any,
  properties: Record<string, any>,
  sources: Record<string, PropertySource>,
): void {
  const className = target.name || 'anonymous class';
  const problems: string[] = [];

  for (const [name, schema] of Object.entries(properties)) {
    const source = sources[name];
    const explicit = new Set(source ? source.explicit : Object.keys(schema));
    const explicitType = TYPE_DEFINING_KEYS.some((key) => explicit.has(key));
    const where = `${className}.${name}`;
    const { inferred, untranslated } = analyzeClassValidatorProperty(target.prototype, name);

    // Arrays: design type Array, an explicit `items`, or a class-validator array decorator
    const isArray =
      typeIncludes(schema.type, 'array') ||
      (schema.type === undefined && schema.items !== undefined) ||
      (!explicitType && (source?.design === 'array' || inferred.isArray === true));
    if (isArray) {
      schema.type = schema.type ?? 'array';
      if (!explicitType && !typeIncludes(schema.type, 'array')) schema.type = 'array';
      if (!schema.items) {
        if (inferred.items && Object.keys(inferred.items).length > 0) {
          schema.items = { ...inferred.items };
        } else {
          problems.push(
            `${name}: an array needs an item type. Set \`items\` in @ToolProp ` +
              "(e.g. items: { type: 'string' }), or add a class-validator decorator with { each: true }.",
          );
          continue;
        }
      } else if (inferred.items && !schema.items.properties) {
        for (const key of [...ITEM_CONSTRAINT_KEYS, 'type', 'enum'] as const) {
          const value = (inferred.items as Record<string, unknown>)[key];
          if (value === undefined) continue;
          if (schema.items[key] === undefined) {
            schema.items[key] = value;
          } else if (
            !sameValue(schema.items[key], value) &&
            !(key === 'type' && !isTypeConflict(schema.items.type, value as string))
          ) {
            warnOnce(
              `${where}: items.${key} ${JSON.stringify(schema.items[key])} from @ToolProp is kept; ` +
                `class-validator says ${JSON.stringify(value)}.`,
            );
          }
        }
      }
      if (schema.items && Array.isArray(schema.items.enum) && schema.items.type === undefined) {
        schema.items.type = enumSchemaType(schema.items.enum);
      }
    }

    // Type: explicit > class-validator > design type
    if (!isArray && inferred.type && inferred.type !== 'array') {
      if (!explicitType) {
        if (!schema.properties) schema.type = inferred.type;
      } else if (schema.type !== undefined && isTypeConflict(schema.type, inferred.type)) {
        warnOnce(
          `${where}: type ${JSON.stringify(schema.type)} from @ToolProp is kept; ` +
            `class-validator says "${inferred.type}".`,
        );
      }
    }

    // Enum
    if (inferred.enum) {
      if (schema.enum === undefined && !isArray) {
        schema.enum = inferred.enum;
        if (!explicit.has('type')) schema.type = enumSchemaType(inferred.enum);
      } else if (
        schema.enum !== undefined &&
        !sameValue([...schema.enum].sort(), [...inferred.enum].sort())
      ) {
        warnOnce(
          `${where}: enum ${JSON.stringify(schema.enum)} from @ToolProp is kept; ` +
            `class-validator allows ${JSON.stringify(inferred.enum)}.`,
        );
      }
    }

    // Constraints: fill gaps, warn on conflicts
    for (const key of CONSTRAINT_KEYS) {
      const value = (inferred as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (schema[key] === undefined) {
        schema[key] = value;
      } else if (!sameValue(schema[key], value)) {
        warnOnce(
          `${where}: ${key} ${JSON.stringify(schema[key])} from @ToolProp is kept; ` +
            `class-validator says ${JSON.stringify(value)}.`,
        );
      }
    }
    if (
      inferred.notEmpty &&
      typeIncludes(schema.type, 'string') &&
      schema.minLength === undefined
    ) {
      schema.minLength = 1;
    }

    // Decorators with no JSON Schema equivalent. An explicit format, pattern or enum means the
    // author has described the value themselves.
    if (!['format', 'pattern', 'enum'].some((key) => explicit.has(key))) {
      for (const decorator of untranslated) {
        warnOnce(
          `${where}: class-validator rule "${decorator}" has no JSON Schema equivalent and is ` +
            'not in the schema. Describe it with `format`, `pattern` or `description` in @ToolProp.',
        );
      }
    }

    // The type must be known by now
    if (schema.type === undefined) {
      if (Array.isArray(schema.enum)) {
        schema.type = enumSchemaType(schema.enum);
      } else if (!COMPOSITION_KEYS.some((key) => schema[key]) && schema.const === undefined) {
        problems.push(
          `${name}: cannot determine the JSON Schema type; TypeScript reports ` +
            `${describeDesign(source?.design ?? 'unknown')}. Set \`type\`, \`items\` or \`enum\` in ` +
            '@ToolProp (and `nullable: true` if null is allowed), or add a class-validator type ' +
            'decorator such as @IsString().',
        );
        continue;
      }
    }

    if (source?.nullable) makeNullable(schema);
  }

  const missing = getClassValidatorPropertyNames(target).filter((name) => !(name in properties));
  for (const name of missing) {
    problems.push(
      `${name}: has class-validator decorators but no @ToolProp, so it would be missing from the ` +
        'schema. Add @ToolProp.',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `schema-forge: cannot generate a JSON Schema for ${className}:\n` +
        problems.map((problem) => `  - ${className}.${problem}`).join('\n'),
    );
  }
}
