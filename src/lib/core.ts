/**
 * Core schema generation functionality
 */

import { addPropertyTo, applyPropertyUpdates } from './decorators';
import {
  closeObjects,
  DEFERRED_UPDATES_METADATA_KEY,
  DeferredUpdate,
  getPropertySources,
  NESTED_CLASS_METADATA_KEY,
  resolveProperties,
  typeIncludes,
} from './resolve';
import {
  JSON_SCHEMA_METADATA_KEY,
  JSONSchemaDefinition,
  JsonSchemaOptions,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import { prepareForOpenAIStructuredOutput } from './strict-schema';
import { cloneMetadata, isCustomClass } from './utils';

type ClassType = new (...args: any[]) => any;

const RECURSION_HINT =
  "Recursive classes are not supported; describe the field explicitly (e.g. type: 'object' or " +
  "items: { type: 'object' }).";

function deferredUpdates(target: ClassType): DeferredUpdate[] {
  const chain: DeferredUpdate[][] = [];
  for (
    let proto = target.prototype;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    chain.unshift(Reflect.getOwnMetadata(DEFERRED_UPDATES_METADATA_KEY, proto) || []);
  }
  return chain.flat();
}

/**
 * Whether an update of a class-typed property describes it as something other than that class's
 * object: another type, an enum, a const or a composition (for an array of the class: another type,
 * or items that are not a class).
 */
function describesOtherwise(updates: Record<string, any>, isArray: boolean): boolean {
  if (['enum', 'const', 'anyOf', 'oneOf', 'allOf'].some((key) => updates[key] !== undefined)) {
    return true;
  }
  if (isArray) {
    return (
      (updates.type !== undefined && !typeIncludes(updates.type, 'array')) ||
      (updates.items !== undefined && !isCustomClass(updates.items?.type))
    );
  }
  return updates.type !== undefined && !typeIncludes(updates.type, 'object');
}

/**
 * An update that changes a class's properties from outside the class: recorded on it or a base
 * class through a nested class (`updateSchemaProperty(Order, 'address.city', …)`), or passed down
 * from the class it is nested in. The path is relative to the class being built.
 */
type PathUpdate =
  | { kind: 'update'; paths: string[]; updates: Record<string, any> }
  | { kind: 'add'; paths: string[]; options: Record<string, any> };

/** A `propertyOverrides` entry, its path relative to the class being built */
type PathOverride = { paths: string[]; updates: Record<string, any> };

/** The updates and overrides whose path goes into `name`, relative to the class it nests */
function below<T extends { paths: string[] }>(entries: T[], name: string): T[] {
  return entries.flatMap((entry) =>
    entry.paths.length > 1 && entry.paths[0] === name
      ? [{ ...entry, paths: entry.paths.slice(1) }]
      : [],
  );
}

/**
 * Whether the property's nested class is replaced for this schema: by an update of the property
 * itself, or by an override for it. Its schema is then not built, so its properties and its
 * problems do not reach this schema.
 */
function nestedClassReplaced(
  name: string,
  isArray: boolean,
  updates: PathUpdate[],
  overrides: PathOverride[],
): boolean {
  const ofProperty = (paths: string[]) => paths.length === 1 && paths[0] === name;
  const own = [
    ...updates.flatMap((update) =>
      update.kind === 'update' && ofProperty(update.paths) ? [update.updates] : [],
    ),
    ...overrides.flatMap((override) => (ofProperty(override.paths) ? [override.updates] : [])),
  ];
  return own.some(
    (update) => !!update && typeof update === 'object' && describesOtherwise(update, isArray),
  );
}

/**
 * Properties declared on the class (or a base class) by another installed copy of this package.
 * Every copy creates its own `Symbol('jsonSchema')`, so what another copy's `@ToolProp` wrote is
 * invisible here: found by the symbol's name, not its identity.
 */
function foreignDeclaredProperties(target: ClassType): Set<string> {
  const names = new Set<string>();
  const ownKeyName = JSON_SCHEMA_METADATA_KEY.toString();
  for (
    let proto = target.prototype;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const key of Reflect.getOwnMetadataKeys(proto)) {
      if (
        typeof key !== 'symbol' ||
        key === JSON_SCHEMA_METADATA_KEY ||
        key.toString() !== ownKeyName
      ) {
        continue;
      }
      const properties = Reflect.getOwnMetadata(key, proto);
      if (properties && typeof properties === 'object') {
        Object.keys(properties).forEach((name) => names.add(name));
      }
    }
  }
  return names;
}

/**
 * Builds the schema of one class: its stored properties, the schemas of the classes nested in
 * them (recursively, each with the updates and overrides whose path goes into it), the remaining
 * updates and overrides, then generation-time resolution. Problems are collected into `problems`
 * with their path from the root, so the root reports them all in one error.
 */
function buildClassSchema(
  target: ClassType,
  problems: string[],
  prefix: string,
  ancestors: readonly ClassType[],
  overrides: PathOverride[] = [],
  inherited: PathUpdate[] = [],
): JSONSchemaDefinition {
  const properties = cloneMetadata(
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {},
  );
  const requiredProps: string[] = [
    ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || []),
  ];
  const sources = cloneMetadata(getPropertySources(target.prototype));
  const className = target.name || 'anonymous class';
  const path = [...ancestors, target];

  // Properties only another copy of the package declared would silently be missing
  const foreignOnly = [...foreignDeclaredProperties(target)].filter(
    (name) => !Object.prototype.hasOwnProperty.call(properties, name),
  );
  if (foreignOnly.length > 0) {
    problems.push(
      `${prefix}${className}: ${foreignOnly.join(', ')} ${foreignOnly.length === 1 ? 'was' : 'were'} ` +
        'declared by another installed copy of @firefliesai/schema-forge, whose metadata this copy ' +
        'cannot read, so the schema would leave ' +
        `${foreignOnly.length === 1 ? 'it' : 'them'} out. Install a single copy (deduplicate, or ` +
        "force one version with your package manager's overrides), or declare " +
        `${foreignOnly.length === 1 ? 'it' : 'them'} with this copy's @ToolProp.`,
    );
  }

  // Updates from outside the class, in the order they apply: those recorded on the class and its
  // base classes (the base classes' first, each in the order made, and only where the property
  // still nests the class the update was made for), then those passed down from the class this
  // one is nested in. `propertyOverrides` apply after all of them.
  const updates: PathUpdate[] = [
    ...deferredUpdates(target).flatMap((update): PathUpdate[] => {
      const paths = update.kind === 'update' ? update.paths : update.path.split('.');
      if (
        Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, target.prototype, paths[0]) !==
        update.nestedClass
      ) {
        return [];
      }
      return update.kind === 'update'
        ? [{ kind: 'update', paths, updates: update.updates }]
        : [{ kind: 'add', paths, options: update.options }];
    }),
    ...inherited,
  ];

  // Nested classes: built now, for this root, so a class that no schema reaches is never checked.
  // The updates and overrides whose path goes into a nested class's properties are applied while
  // that class is built, before its properties are checked, exactly like updates of the class's
  // own properties: so an update that gives a nested property its type repairs it.
  const built = new Set<string>();
  for (const [name, schema] of Object.entries<any>(properties)) {
    const nested = Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, target.prototype, name);
    if (typeof nested !== 'function') continue;
    const isArray = schema.type === 'array';
    if (nestedClassReplaced(name, isArray, updates, overrides)) continue;
    if (path.includes(nested)) {
      // An explicit `type: 'object'` on the property that closes the loop describes it as a
      // free-form object (for an array, `items: { type: 'object' }` records no class at all)
      if (!isArray && sources[name]?.explicit.includes('type')) continue;
      problems.push(
        nested === target
          ? `${prefix}${className}.${name} refers to its own class. ${RECURSION_HINT}`
          : `${prefix}${className}.${name} refers back to ${nested.name}, which contains it. ` +
              RECURSION_HINT,
      );
      if (isArray) schema.items = { type: 'object' };
      continue;
    }
    const nestedSchema = buildClassSchema(
      nested,
      problems,
      `${prefix}${className}.${name} → `,
      path,
      below(overrides, name),
      below(updates, name),
    );
    built.add(name);
    if (isArray) {
      schema.items = nestedSchema;
    } else {
      schema.properties = nestedSchema.properties;
      if (nestedSchema.required) schema.required = nestedSchema.required;
    }
  }

  // The rest apply here: updates of this class's own properties, and paths into a property whose
  // nested class was not built (replaced, or closing a loop) or that holds no class
  const intoBuilt = (paths: string[]) => paths.length > 1 && built.has(paths[0]);
  for (const update of updates) {
    if (intoBuilt(update.paths)) continue;
    if (update.kind === 'update') {
      applyPropertyUpdates(properties, update.paths, update.updates, target, sources, properties);
    } else {
      addPropertyTo(properties, requiredProps, update.paths.join('.'), update.options);
    }
  }

  const ownOverrides = overrides.filter((override) => !intoBuilt(override.paths));
  if (ownOverrides.length > 0) {
    const stored = cloneMetadata(properties);
    for (const override of ownOverrides) {
      applyPropertyUpdates(properties, override.paths, override.updates, target, sources, stored);
    }
  }

  // class-validator inference, type checks and `nullable` (decorators have all run by now)
  resolveProperties(target, properties, sources, problems, prefix, new Set(foreignOnly));

  const schema: JSONSchemaDefinition = {
    type: 'object',
    properties,
  };
  if (requiredProps.length > 0) {
    schema.required = requiredProps;
  }
  return schema;
}

/**
 * Converts a TypeScript class to a JSON Schema
 *
 * The schemas of nested classes are built here, for the class passed in, and every check runs
 * here too: defining or decorating a class never throws. Throws, listing every problem with its
 * path from this class, when a property's type cannot be determined (for example
 * `x?: string | null` with no explicit `type`), when an array property has no item type, when a
 * class has class-validator decorated properties but no `@ToolProp` at all, and when a class
 * refers to itself, directly or through another class, and when another installed copy of this
 * package declared properties this copy cannot read. A validated property without `@ToolProp`
 * in a class that does declare others is left out: only `@ToolProp` declares properties (see
 * `findUndeclaredValidatedProperties`).
 *
 * @param target The class to convert
 * @param options Options for schema generation
 * @returns JSON Schema representation of the class
 *
 * @example
 * // Basic usage
 * const schema = classToJsonSchema(User);
 *
 * // With options
 * const schema = classToJsonSchema(User, {
 *   forStructuredOutput: true,
 *   propertyOverrides: {
 *     'username': { description: 'Custom description' }
 *   },
 *   additionalProperties: false, // closed objects at every level
 * });
 */
export function classToJsonSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: JsonSchemaOptions<T>,
): JSONSchemaDefinition {
  const problems: string[] = [];
  const overrides = Object.entries(
    (options?.propertyOverrides ?? {}) as Record<string, Record<string, any>>,
  ).map(([path, updates]) => ({ paths: path.split('.'), updates }));
  const schema = buildClassSchema(target, problems, '', [], overrides);

  if (problems.length > 0) {
    throw new Error(
      `schema-forge: cannot generate a JSON Schema for ${target.name || 'anonymous class'}:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }

  if (options?.additionalProperties === false) {
    closeObjects(schema);
  }

  // Handle structured output formatting based on provider
  if (options?.forStructuredOutput) {
    // For backward compatibility, use OpenAI format
    return prepareForOpenAIStructuredOutput(schema, true);
  }

  return schema;
}
