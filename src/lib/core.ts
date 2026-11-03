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
} from './resolve';
import {
  JSON_SCHEMA_METADATA_KEY,
  JSONSchemaDefinition,
  JsonSchemaOptions,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import { cloneMetadata, prepareForOpenAIStructuredOutput } from './utils';

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
 * Builds the schema of one class: its stored properties, the schemas of the classes nested in
 * them (recursively), deferred updates, then generation-time resolution. Problems are collected
 * into `problems` with their path from the root, so the root reports them all in one error.
 */
function buildClassSchema(
  target: ClassType,
  problems: string[],
  prefix: string,
  ancestors: readonly ClassType[],
  propertyOverrides?: Record<string, unknown>,
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

  // Nested classes: built now, for this root, so a class that no schema reaches is never checked
  for (const [name, schema] of Object.entries<any>(properties)) {
    const nested = Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, target.prototype, name);
    if (typeof nested !== 'function') continue;
    const isArray = schema.type === 'array';
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
    );
    if (isArray) {
      schema.items = nestedSchema;
    } else {
      schema.properties = nestedSchema.properties;
      if (nestedSchema.required) schema.required = nestedSchema.required;
    }
  }

  // Updates that reach into a nested class's properties: the base classes' first, each in the
  // order made, and only where the property still nests the class the update was made for
  for (const update of deferredUpdates(target)) {
    const firstProperty = update.kind === 'update' ? update.paths[0] : update.path.split('.')[0];
    if (
      Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, target.prototype, firstProperty) !==
      update.nestedClass
    ) {
      continue;
    }
    if (update.kind === 'update') {
      applyPropertyUpdates(properties, update.paths, update.updates, target, sources, properties);
    } else {
      addPropertyTo(properties, requiredProps, update.path, update.options);
    }
  }

  if (propertyOverrides) {
    const stored = cloneMetadata(properties);
    Object.entries(propertyOverrides).forEach(([overridePath, updates]) => {
      applyPropertyUpdates(
        properties,
        overridePath.split('.'),
        updates as any,
        target,
        sources,
        stored,
      );
    });
  }

  // class-validator inference, type checks and `nullable` (decorators have all run by now)
  resolveProperties(target, properties, sources, problems, prefix);

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
 * refers to itself, directly or through another class. A validated property without `@ToolProp`
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
  const schema = buildClassSchema(
    target,
    problems,
    '',
    [],
    options?.propertyOverrides as Record<string, unknown> | undefined,
  );

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
