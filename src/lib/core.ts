/**
 * Core schema generation functionality
 */

import { closeObjects, getPropertySources, resolveProperties } from './resolve';
import {
  JSON_SCHEMA_METADATA_KEY,
  JSONSchemaDefinition,
  JsonSchemaOptions,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import { cloneMetadata, prepareForOpenAIStructuredOutput } from './utils';

/**
 * Converts a TypeScript class to a JSON Schema
 *
 * Throws when a property's type cannot be determined (for example `x?: string | null` with no
 * explicit `type`), when an array property has no item type, or when a class has
 * class-validator decorated properties but no `@ToolProp` at all. A validated property without
 * `@ToolProp` in a class that does declare others is left out: only `@ToolProp` declares
 * properties (see `findUndeclaredValidatedProperties`).
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
  const properties = cloneMetadata(
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {},
  );
  const requiredProps = [
    ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || []),
  ];
  const sources = cloneMetadata(getPropertySources(target.prototype));

  if (options?.propertyOverrides) {
    Object.entries(options.propertyOverrides).forEach(([path, updates]) => {
      const paths = path.split('.');
      applyPropertyUpdates(properties, paths, updates as any, target, sources);
    });
  }

  // class-validator inference, type checks and `nullable` (decorators have all run by now)
  resolveProperties(target, properties, sources);

  const schema: JSONSchemaDefinition = {
    type: 'object',
    properties,
  };

  if (requiredProps.length > 0) {
    schema.required = requiredProps;
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

// Import here to handle circular dependencies
import { applyPropertyUpdates } from './decorators';
