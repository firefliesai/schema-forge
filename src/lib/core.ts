/**
 * Core schema generation functionality
 */

import {
  JSONSchemaDefinition,
  JsonSchemaOptions,
  JSON_SCHEMA_METADATA_KEY,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import { cloneMetadata } from './utils';
import { prepareForStructuredOutput } from './utils';

/**
 * Converts a TypeScript class to a JSON Schema
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
 *   }
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

  if (options?.propertyOverrides) {
    Object.entries(options.propertyOverrides).forEach(([path, updates]) => {
      const paths = path.split('.');
      applyPropertyUpdates(properties, paths, updates, target);
    });
  }

  const schema: JSONSchemaDefinition = {
    type: 'object',
    properties,
  };

  if (requiredProps.length > 0) {
    schema.required = requiredProps;
  }

  // If forStructuredOutput is true, prepare the schema
  if (options?.forStructuredOutput) {
    return prepareForStructuredOutput(schema, false);
  }

  return schema;
}

// Import here to handle circular dependencies
import { applyPropertyUpdates } from './decorators';
