/**
 * Helper functions for schema-forge
 */

/**
 * Clones metadata using JSON serialization/deserialization
 */
export function cloneMetadata(metadata: any): any {
  return JSON.parse(JSON.stringify(metadata));
}

/**
 * Prepares a JSON Schema object for OpenAI structured output compatibility.
 *
 * This function:
 * - Adds additionalProperties:false to enforce strict schema validation
 * - Makes all properties required (adds them to the required array)
 * - Removes JSON Schema features not supported by OpenAI
 * - Optionally converts optional properties to use ["type", "null"] format
 *
 * @public
 * @param schema The JSON Schema object to enhance
 * @param handleOptionals Whether to convert optional properties to ["type", "null"] format
 * @returns Enhanced JSON Schema object ready for OpenAI structured output
 *
 * @example
 * // Enhance a JSON Schema for OpenAI structured output
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' }
 *   },
 *   required: ['name']
 * };
 * const enhancedSchema = prepareForOpenAIStructuredOutput(schema, true);
 * // age will be transformed to { type: ["number", "null"] }
 */
export function prepareForOpenAIStructuredOutput(obj: any, handleOptionals = false): any {
  // If the input is not an object or is null, return the input value directly
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // If the input is an array, recursively call this function for each element
  if (Array.isArray(obj)) {
    return obj.map((item) => prepareForOpenAIStructuredOutput(item, handleOptionals));
  }

  // Create a new object to avoid modifying the original object
  const newObj: any = { ...obj };

  // Check if the "properties" property exists
  if ('properties' in newObj) {
    // Add "additionalProperties": false
    newObj.additionalProperties = false;

    // Store original required properties before making all properties required
    const originalRequired = newObj.required || [];

    // Get all keys of the properties object as the required property
    if (Object.keys(newObj.properties).length > 0) {
      newObj.required = Object.keys(newObj.properties);
    }

    // Handle optional properties if enabled
    if (handleOptionals) {
      // Process each property
      for (const propName in newObj.properties) {
        const isOptional = !originalRequired.includes(propName);

        if (isOptional && newObj.properties[propName].type) {
          // Apply OpenAI's format for optional properties
          const prop = newObj.properties[propName];

          // Convert to ["type", "null"] format for optional properties
          newObj.properties[propName].type = Array.isArray(prop.type)
            ? prop.type.includes('null')
              ? prop.type
              : [...prop.type, 'null']
            : [prop.type, 'null'];
        }
      }
    }
  }

  // Remove unsupported properties based on type
  if (newObj.type === 'string' || (Array.isArray(newObj.type) && newObj.type.includes('string'))) {
    // Remove unsupported string properties
    ['minLength', 'maxLength', 'pattern', 'format'].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (
    newObj.type === 'number' ||
    (Array.isArray(newObj.type) && newObj.type.includes('number'))
  ) {
    // Remove unsupported number properties
    ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (
    newObj.type === 'object' ||
    (Array.isArray(newObj.type) && newObj.type.includes('object'))
  ) {
    // Remove unsupported object properties
    [
      'patternProperties',
      'unevaluatedProperties',
      'propertyNames',
      'minProperties',
      'maxProperties',
    ].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (
    newObj.type === 'array' ||
    (Array.isArray(newObj.type) && newObj.type.includes('array'))
  ) {
    // Remove unsupported array properties
    [
      'unevaluatedItems',
      'contains',
      'minContains',
      'maxContains',
      'minItems',
      'maxItems',
      'uniqueItems',
    ].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  }

  // Recursively process all object properties
  for (const key in newObj) {
    if (typeof newObj[key] === 'object' && newObj[key] !== null) {
      newObj[key] = prepareForOpenAIStructuredOutput(newObj[key], handleOptionals);
    }
  }

  return newObj;
}

/**
 * Throws when a property path given by a caller (`updateSchemaProperty`, `addSchemaProperty`,
 * `propertyOverrides`) has a segment that, used as an object key, would reach an object's
 * prototype instead of a property schema.
 */
export function assertSafePropertyPath(paths: readonly string[]): void {
  for (const segment of paths) {
    if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
      throw new Error(
        `schema-forge: "${segment}" cannot be used as a property name or path segment ` +
          `(in "${paths.join('.')}").`,
      );
    }
  }
}

/**
 * Throws when an update (`updateSchemaProperty`, `addSchemaProperty`, a `propertyOverrides`
 * entry) names a class in `type` or `items.type`. Only `@ToolProp` declares a nested class, and
 * its schema is built from that declaration; a class an update names would be left in the schema
 * unbuilt (it serializes to nothing), so the result would silently lose the property's shape.
 */
export function assertNoClassInUpdate(updates: any, where: string): void {
  const named = [updates?.type, updates?.items?.type].find(isCustomClass);
  if (!named) return;
  throw new Error(
    `schema-forge: ${where} names the class ${named.name || 'anonymous class'}, which an update ` +
      'cannot add: only @ToolProp declares a nested class and builds its schema. Declare the ' +
      `property with @ToolProp (items: { type: ${named.name || 'TheClass'} } for an array, or ` +
      'the class as its TypeScript type), for example in a subclass.',
  );
}

/**
 * Type inference helper
 */
export function inferType<T>(_target: new (...args: any[]) => any): T {
  return null as any;
}

/**
 * Checks if a type is a custom class
 */
export function isCustomClass(type: any): boolean {
  return (
    typeof type === 'function' &&
    type.prototype &&
    type !== String &&
    type !== Number &&
    type !== Boolean &&
    type !== Array &&
    type !== Object &&
    type !== Date
  );
}

/**
 * Extracts values from an enum type
 */
export function extractEnumValues(enumType: any): any[] {
  if (Array.isArray(enumType)) {
    return enumType;
  }

  if (typeof enumType === 'object' && enumType !== null) {
    const enumKeys = Object.keys(enumType).filter((key) => isNaN(Number(key)));
    return enumKeys.map((key) => enumType[key]);
  }

  return [];
}

/**
 * The JSON Schema type of an enum, from all of its values: `string`, `number` or `boolean`, or a
 * type array when the values mix types (`null` values are ignored).
 */
export function enumSchemaType(values: unknown[]): any {
  const types: string[] = [];
  for (const value of values) {
    if (value === null) continue;
    const type =
      typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'boolean' : 'number';
    if (!types.includes(type)) types.push(type);
  }
  if (types.length === 0) return 'string';
  return types.length === 1 ? types[0] : types;
}

/**
 * Checks if a type is a Date type
 */
export function isDateType(type: any): boolean {
  return type === Date;
}

/**
 * Normalizes array items type, converting constructors to string literals
 * Date -> { type: 'string', format: 'date-time' }
 * String -> { type: 'string' }
 * Number -> { type: 'number' }
 * Boolean -> { type: 'boolean' }
 */
export function normalizeItemsType(items: any): any {
  if (!items || typeof items !== 'object') {
    return items;
  }

  // If items has a type property that's a constructor, normalize it
  if (items.type) {
    const normalizedItems = { ...items };

    if (items.type === Date) {
      normalizedItems.type = 'string';
      if (!normalizedItems.format) {
        normalizedItems.format = 'date-time';
      }
      return normalizedItems;
    } else if (items.type === String) {
      normalizedItems.type = 'string';
      return normalizedItems;
    } else if (items.type === Number) {
      normalizedItems.type = 'number';
      return normalizedItems;
    } else if (items.type === Boolean) {
      normalizedItems.type = 'boolean';
      return normalizedItems;
    }
  }

  return items;
}
