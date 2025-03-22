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
    ['minimum', 'maximum', 'multipleOf'].forEach((prop) => {
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
