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
import { JSON_SCHEMA_METADATA_KEY } from './types';
import { enumSchemaType } from './utils';

export const PROPERTY_SOURCES_METADATA_KEY = Symbol('jsonSchema:propertySources');
/**
 * Per property: the class whose schema is nested there (`null` when none). The nested schema
 * itself is built when a schema is generated, not when the decorator runs.
 */
export const NESTED_CLASS_METADATA_KEY = Symbol('jsonSchema:nestedClass');
/**
 * Per class (own metadata only): `updateSchemaProperty` / `addSchemaProperty` calls that reach into
 * a nested class's properties. They are replayed, in order and for subclasses too, after the
 * nested schemas are built.
 */
export const DEFERRED_UPDATES_METADATA_KEY = Symbol('jsonSchema:deferredUpdates');

/** A recorded `updateSchemaProperty` / `addSchemaProperty` call (DEFERRED_UPDATES_METADATA_KEY) */
export type DeferredUpdate = (
  | { kind: 'update'; paths: string[]; updates: Record<string, any> }
  | { kind: 'add'; path: string; options: Record<string, any> }
) & {
  /** The nested class the path's first property had when the call was made */
  nestedClass: unknown;
};

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

/**
 * Item keywords that class-validator only sets with rules that accept one type: its numeric rules
 * (`@Min`, `@Max`, `@IsPositive`, `@IsNegative`, `@IsDivisibleBy`) reject anything but a number,
 * and its string rules (`@MinLength`, `@MaxLength`, `@Length`, `@Matches`, `@IsEmail`, …) reject
 * anything but a string.
 */
const NUMBER_ONLY_ITEM_KEYS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
];
const STRING_ONLY_ITEM_KEYS = ['minLength', 'maxLength', 'pattern', 'format'];

/**
 * The item type implied by class-validator item rules that carry no type of their own, or
 * undefined when they imply none (no rules, or rules of both families, which no value satisfies).
 */
function impliedItemType(items: Record<string, unknown>): 'number' | 'string' | undefined {
  const keys = Object.keys(items);
  if (keys.length === 0) return undefined;
  if (keys.every((key) => NUMBER_ONLY_ITEM_KEYS.includes(key))) return 'number';
  if (keys.every((key) => STRING_ONLY_ITEM_KEYS.includes(key))) return 'string';
  return undefined;
}

/**
 * `@IsNotEmpty()` on a string: `minLength` becomes at least 1, the stricter of the two bounds,
 * like other class-validator bounds. A lower `minLength` the author wrote is kept, with a warning.
 */
function applyNotEmpty(schema: Record<string, any>, explicitMinLength: boolean, where: string) {
  if (schema.minLength === undefined) {
    schema.minLength = 1;
  } else if (schema.minLength < 1) {
    if (explicitMinLength) {
      warnOnce(`${where} ${schema.minLength} from @ToolProp is kept; class-validator says 1.`);
    } else {
      schema.minLength = 1;
    }
  }
}

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
 * Whether some keyword of a schema rejects null. JSON Schema applies sibling keywords together, so
 * any one of them is enough: a `type`, `enum` or `const` without null, an `anyOf` / `oneOf` with no
 * branch that leaves null in, or an `allOf` branch that rejects it. A `$ref` or `not` is not looked
 * into, so it counts as rejecting null. A boolean schema is a whole schema: `false` rejects every
 * value, null included, and `true` accepts every value.
 */
function rejectsNull(schema: unknown): boolean {
  if (typeof schema === 'boolean') return !schema;
  if (!schema || typeof schema !== 'object') return false;
  const value = schema as Record<string, any>;
  if (value.$ref !== undefined || value.not !== undefined) return true;
  if (value.const !== undefined && value.const !== null) return true;
  if (value.type !== undefined && !typeIncludes(value.type, 'null')) return true;
  if (Array.isArray(value.enum) && !value.enum.includes(null)) return true;
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(value[key]) && value[key].every(rejectsNull)) return true;
  }
  return Array.isArray(value.allOf) && value.allOf.some(rejectsNull);
}

/**
 * Whether a schema accepts null and says so: no keyword rejects null (`rejectsNull`), and a null
 * `const`, a `type` or `enum` with null, or an `anyOf` / `oneOf` branch that accepts null allows
 * it. A schema with no such keyword at all (`{}`) does not count: nothing says null was meant.
 */
export function allowsNull(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object' || rejectsNull(schema)) return false;
  const value = schema as Record<string, any>;
  return (
    value.const === null ||
    value.type !== undefined ||
    Array.isArray(value.enum) ||
    ['anyOf', 'oneOf'].some((key) => Array.isArray(value[key]) && value[key].some(allowsNull))
  );
}

/**
 * Applies `nullable: true`. A schema that no keyword makes reject null (`rejectsNull`) already
 * accepts it and is left as it is: for a `oneOf` with a branch such as `type: ["string", "null"]`,
 * another branch accepting null would make null match two branches, which `oneOf` rejects.
 * - A plain typed schema: `type` gains `"null"` and `enum` gains `null`.
 * - Only `anyOf` / `oneOf`: a `{ type: "null" }` branch is added.
 * - Anything else that `"null"` in `type` cannot open up (`const`, `allOf`, a composition beside
 *   a `type` or another composition, a `$ref` or `not`): the whole schema becomes one branch of
 *   `anyOf: [schema, { type: "null" }]`, with the annotations kept outside.
 */
export function makeNullable(schema: Record<string, any>): void {
  if (!rejectsNull(schema)) return;
  const compositions = COMPOSITION_KEYS.filter((key) => schema[key]);
  const onlyBranching =
    schema.type === undefined &&
    schema.const === undefined &&
    schema.enum === undefined &&
    schema.$ref === undefined &&
    schema.not === undefined &&
    compositions.length === 1 &&
    compositions[0] !== 'allOf';
  if (onlyBranching) {
    if (schema.anyOf) schema.anyOf = [...schema.anyOf, { type: 'null' }];
    else schema.oneOf = [...schema.oneOf, { type: 'null' }];
    return;
  }
  if (
    compositions.length > 0 ||
    schema.const !== undefined ||
    schema.$ref !== undefined ||
    schema.not !== undefined
  ) {
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
 * Adds keywords a provider rejects to a schema's description, as `{keyword: value, …}` after a
 * blank line, so the model still sees the rule. The keywords themselves are removed by the caller.
 */
export function noteInDescription(schema: Record<string, any>, moved: [string, unknown][]): void {
  if (moved.length === 0) return;
  const note = `{${moved.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')}}`;
  schema.description = schema.description ? `${schema.description}\n\n${note}` : note;
}

/**
 * The part of a schema that describes its value, seen through the null wrapper `makeNullable`
 * may add: for a schema with no `type` of its own whose `anyOf` (or `oneOf`) is one value branch
 * plus `{ type: "null" }` branches, that value branch; otherwise the schema itself. It is returned
 * by reference, so a caller can read or extend its `items` and `properties` in place.
 */
export function valueSchemaOf(schema: any): any {
  return nullWrapperOf(schema)?.value ?? schema;
}

/**
 * A copy of a schema without the null wrapper `valueSchemaOf` sees through: the value branch's
 * keys merged with the keys kept outside it (the annotations). For an update that replaces the
 * value of a schema that may already accept null; the caller puts `null` back when it should
 * stay accepted.
 */
export function withoutNullWrapper(schema: Record<string, any>): Record<string, any> {
  const wrapper = nullWrapperOf(schema);
  if (!wrapper) return { ...schema };
  const { [wrapper.key]: _wrapper, ...outside } = schema;
  return { ...outside, ...wrapper.value };
}

/** The `anyOf` / `oneOf` key holding a null wrapper and its value branch, if there is one */
function nullWrapperOf(schema: any): { key: string; value: Record<string, any> } | undefined {
  if (!schema || typeof schema !== 'object' || schema.type !== undefined) return undefined;
  for (const key of ['anyOf', 'oneOf']) {
    const branches = schema[key];
    if (!Array.isArray(branches) || !branches.some(isNullBranch)) continue;
    const values = branches.filter((branch: any) => !isNullBranch(branch));
    if (values.length === 1 && values[0] && typeof values[0] === 'object') {
      return { key, value: values[0] };
    }
  }
  return undefined;
}

/**
 * Reverses `makeNullable` (for `nullable: false` on a property whose schema already allows null,
 * such as a property of a nested class).
 */
export function removeNullable(schema: Record<string, any>): void {
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    const types = schema.type.filter((type: string) => type !== 'null');
    schema.type = types.length === 1 ? types[0] : types;
  }
  if (Array.isArray(schema.enum))
    schema.enum = schema.enum.filter((value: unknown) => value !== null);
  for (const key of ['anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key]) || !schema[key].some(isNullBranch)) continue;
    const rest = schema[key].filter((branch: any) => !isNullBranch(branch));
    if (key === 'anyOf' && rest.length === 1 && schema.type === undefined) {
      delete schema.anyOf;
      Object.assign(schema, rest[0]);
    } else {
      schema[key] = rest;
    }
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
 * checks, `nullable`. Adds a line to `problems` when a property's type cannot be determined, when
 * an array has no item type, and when the class has class-validator decorated properties but no
 * `@ToolProp` at all. `prefix` is the path from the root class (`Outer.profile → `), empty for
 * the root. `foreignDeclared` holds the properties another copy of the package declared, already
 * reported by the caller.
 */
export function resolveProperties(
  target: new (...args: any[]) => any,
  properties: Record<string, any>,
  sources: Record<string, PropertySource>,
  problems: string[],
  prefix = '',
  foreignDeclared: ReadonlySet<string> = new Set(),
): void {
  const className = target.name || 'anonymous class';

  for (const [name, schema] of Object.entries(properties)) {
    const source = sources[name];
    const explicit = new Set(source ? source.explicit : Object.keys(schema));
    const explicitType = TYPE_DEFINING_KEYS.some((key) => explicit.has(key));
    const where = `${prefix}${className}.${name}`;
    const { inferred, untranslated } = analyzeClassValidatorProperty(target.prototype, name);

    // Arrays: design type Array, an explicit `items`, or a class-validator array decorator
    const isArray =
      typeIncludes(schema.type, 'array') ||
      (schema.type === undefined && schema.items !== undefined) ||
      (!explicitType && (source?.design === 'array' || inferred.isArray === true));
    if (isArray) {
      schema.type = schema.type ?? 'array';
      if (!explicitType && !typeIncludes(schema.type, 'array')) schema.type = 'array';
      // An item minLength the author wrote is kept over @IsNotEmpty({ each: true }), with a warning
      const explicitItemMinLength = explicit.has('items') && schema.items?.minLength !== undefined;
      if (!schema.items) {
        const { notEmpty: _notEmpty, ...inferredItems } = inferred.items ?? {};
        const itemSchema: Record<string, unknown> = inferredItems;
        const itemType =
          itemSchema.type !== undefined || itemSchema.enum !== undefined
            ? undefined
            : impliedItemType(itemSchema);
        if (itemSchema.type !== undefined || itemSchema.enum !== undefined || itemType) {
          // Rules such as @Min(1, { each: true }) carry no type; the one class-validator accepts
          if (itemType) itemSchema.type = itemType;
          schema.items = itemSchema;
        } else {
          problems.push(
            `${where}: an array needs an item type. Set \`items\` in @ToolProp ` +
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
      if (inferred.items?.notEmpty && schema.items && typeIncludes(schema.items.type, 'string')) {
        applyNotEmpty(schema.items, explicitItemMinLength, `${where}: items.minLength`);
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
        if (!explicit.has('type') && !inferred.type) schema.type = enumSchemaType(inferred.enum);
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
    if (inferred.notEmpty && typeIncludes(schema.type, 'string')) {
      applyNotEmpty(schema, explicit.has('minLength'), `${where}: minLength`);
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
          `${where}: cannot determine the JSON Schema type; TypeScript reports ` +
            `${describeDesign(source?.design ?? 'unknown')}. Set \`type\`, \`items\` or \`enum\` in ` +
            '@ToolProp (and `nullable: true` if null is allowed), or add a class-validator type ' +
            'decorator such as @IsString().',
        );
        continue;
      }
    }

    if (source?.nullable) makeNullable(schema);
  }

  // Only @ToolProp declares properties; class-validator adds to them. A property with
  // class-validator decorators and no @ToolProp is, by that contract, not part of the schema (an
  // API-only field of a DTO shared with REST). A class with such properties and no @ToolProp at
  // all is a mistake, though: typically a PickType / OmitType / PartialType copy, which keeps
  // class-validator metadata but not @ToolProp.
  if (Object.keys(properties).length === 0) {
    // Properties another copy of the package declared are reported as that, not as undeclared
    const validated = getClassValidatorPropertyNames(target).filter(
      (name) => !foreignDeclared.has(name),
    );
    if (validated.length > 0) {
      problems.push(
        `${prefix}${className}: ${validated.join(', ')} ${validated.length === 1 ? 'has' : 'have'} class-validator ` +
          'decorators, but the class declares no property with @ToolProp, so its schema would be ' +
          'empty. Add @ToolProp to the properties the schema should contain. (A class built with ' +
          "PickType / OmitType / PartialType keeps class-validator metadata but not @ToolProp's.)",
      );
    }
  }
}

/**
 * A property that has class-validator decorators but no `@ToolProp`, and so is not in the schema
 */
export interface UndeclaredValidatedProperty {
  /** Dotted path from the class passed in, as `propertyOverrides` writes it (`booking.ownerId`) */
  path: string;
  /** The class that holds the property */
  className: string;
  property: string;
}

/**
 * Lists the properties that have class-validator decorators but no `@ToolProp`, in the class and
 * in every class nested in its schema. Such properties are left out of the schema by design (only
 * `@ToolProp` declares properties); this is for callers that want to be told, for example a test
 * asserting that a tool's input class exposes every validated field. It reports and never changes
 * a schema.
 */
export function findUndeclaredValidatedProperties(
  target: new (...args: any[]) => any,
): UndeclaredValidatedProperty[] {
  const found: UndeclaredValidatedProperty[] = [];
  const visit = (
    cls: new (...args: any[]) => any,
    prefix: string,
    ancestors: ReadonlySet<unknown>,
  ): void => {
    if (ancestors.has(cls)) return;
    const path = new Set([...ancestors, cls]);
    const declared = Object.keys(
      Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, cls.prototype) || {},
    );
    for (const property of getClassValidatorPropertyNames(cls)) {
      if (!declared.includes(property)) {
        found.push({ path: `${prefix}${property}`, className: cls.name, property });
      }
    }
    for (const property of declared) {
      const nested = Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, cls.prototype, property);
      if (typeof nested === 'function') visit(nested, `${prefix}${property}.`, path);
    }
  };
  visit(target, '', new Set());
  return found;
}
