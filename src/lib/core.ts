/**
 * Core schema generation functionality
 */

import { inferClassValidatorProperties } from './class-validator-integration';
import {
  JSON_SCHEMA_METADATA_KEY,
  JSONSchemaDefinition,
  JsonSchemaOptions,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import { cloneMetadata, prepareForOpenAIStructuredOutput } from './utils';

/**
 * Enriches schema properties with class-validator inferred constraints.
 * Called at schema generation time when all decorators have run and metadata is available.
 */
function enrichWithClassValidatorMetadata(
  properties: Record<string, any>,
  target: new (...args: any[]) => any,
): void {
  for (const propName of Object.keys(properties)) {
    const inferred = inferClassValidatorProperties(target.prototype, propName);
    const prop = properties[propName];
    if (!prop || Object.keys(inferred).length === 0) continue;

    if (inferred.maxItems !== undefined && prop.maxItems === undefined) {
      prop.maxItems = inferred.maxItems;
    }
    if (inferred.minItems !== undefined && prop.minItems === undefined) {
      prop.minItems = inferred.minItems;
    }
    if (inferred.uniqueItems !== undefined && prop.uniqueItems === undefined) {
      prop.uniqueItems = inferred.uniqueItems;
    }
    if (inferred.maximum !== undefined && prop.maximum === undefined) {
      prop.maximum = inferred.maximum;
    }
    if (inferred.minimum !== undefined && prop.minimum === undefined) {
      prop.minimum = inferred.minimum;
    }
    if (inferred.minLength !== undefined && prop.minLength === undefined) {
      prop.minLength = inferred.minLength;
    }
    if (inferred.maxLength !== undefined && prop.maxLength === undefined) {
      prop.maxLength = inferred.maxLength;
    }
    if (inferred.format !== undefined && prop.format === undefined) {
      prop.format = inferred.format;
    }
    if (inferred.type !== undefined && prop.type === undefined) {
      prop.type = inferred.type;
    }
    // Merge inferred items into array items (e.g. from each: true decorators)
    if (
      prop.type === 'array' &&
      prop.items &&
      inferred.items &&
      Object.keys(inferred.items).length > 0
    ) {
      // Merge inferred items into existing items
      // preserving explicit properties but filling in missing ones
      const mergedItems = { ...prop.items };
      // Only add inferred properties that don't exist in explicit items
      if (inferred.items.format !== undefined && mergedItems.format === undefined) {
        mergedItems.format = inferred.items.format;
      }
      if (inferred.items.type !== undefined && mergedItems.type === undefined) {
        mergedItems.type = inferred.items.type;
      }
      if (inferred.items.minimum !== undefined && mergedItems.minimum === undefined) {
        mergedItems.minimum = inferred.items.minimum;
      }
      if (inferred.items.maximum !== undefined && mergedItems.maximum === undefined) {
        mergedItems.maximum = inferred.items.maximum;
      }
      if (inferred.items.minLength !== undefined && mergedItems.minLength === undefined) {
        mergedItems.minLength = inferred.items.minLength;
      }
      if (inferred.items.maxLength !== undefined && mergedItems.maxLength === undefined) {
        mergedItems.maxLength = inferred.items.maxLength;
      }
      if (inferred.items.enum !== undefined && mergedItems.enum === undefined) {
        mergedItems.enum = inferred.items.enum;
      }
      prop.items = mergedItems;
    }
  }
}

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
 *   },
 *   structuredOutputFormat: 'openai', // unused
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

  // Enrich with class-validator metadata (decorators have all run by schema generation time)
  enrichWithClassValidatorMetadata(properties, target);

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

  // Handle structured output formatting based on provider
  if (options?.forStructuredOutput) {
    // For backward compatibility, use OpenAI format
    return prepareForOpenAIStructuredOutput(schema, true);
  }

  return schema;
}

// Import here to handle circular dependencies
import { applyPropertyUpdates } from './decorators';
