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
 * Prepares a JSON Schema object for structured output compatibility with LLM APIs
 * by adding required fields and removing unsupported properties
 *
 * @public
 * @param obj The JSON Schema object to enhance
 * @param isTopLevel Whether this is the top level object (affects processing)
 * @returns Enhanced JSON Schema object ready for structured output
 *
 * @example
 * // Enhance a manually created JSON Schema
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' }
 *   }
 * };
 * const enhancedSchema = prepareForStructuredOutput(schema);
 */
export function prepareForStructuredOutput(obj: any, _isTopLevel = false): any {
  // If the input is not an object or is null, return the input value directly
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // If the input is an array, recursively call this function for each element
  if (Array.isArray(obj)) {
    return obj.map((item) => prepareForStructuredOutput(item));
  }

  // Create a new object to avoid modifying the original object
  const newObj: any = { ...obj };

  // Check if the "properties" property exists
  if ('properties' in newObj) {
    // Add "additionalProperties": false
    newObj.additionalProperties = false;

    // Get all keys of the properties object as the required property
    if (Object.keys(newObj.properties).length > 0) {
      newObj.required = Object.keys(newObj.properties);
    }
  }

  // Remove unsupported properties based on type
  if (newObj.type === 'string') {
    // Remove unsupported string properties
    ['minLength', 'maxLength', 'pattern', 'format'].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (newObj.type === 'number') {
    // Remove unsupported number properties
    ['minimum', 'maximum', 'multipleOf'].forEach((prop) => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (newObj.type === 'object') {
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
  } else if (newObj.type === 'array') {
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
      newObj[key] = prepareForStructuredOutput(newObj[key], false);
    }
  }

  return newObj;
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
    type !== Object
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
 * Gets the corresponding JSON Schema type for a TypeScript type
 */
export function getJsonSchemaType(type: any): string {
  if (isCustomClass(type)) {
    return 'object';
  }

  switch (type) {
    case String:
      return 'string';
    case Number:
      return 'number';
    case Boolean:
      return 'boolean';
    case Array:
      return 'array';
    case Object:
      return 'object';
    default:
      return 'string';
  }
}
