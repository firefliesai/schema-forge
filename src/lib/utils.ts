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
 * Handles optional properties for OpenAI structured output
 *
 * Converts isOptional properties to type arrays with null (["string", "null"])
 * This is the format recommended by OpenAI for optional properties
 *
 * @param property The JSON Schema property to process
 * @param isOptional Whether the property is marked as optional
 * @returns Processed property with correct optional representation
 */
export function handleOptionalProperty(property: any, isOptional: boolean): any {
  // If not optional or no type is defined, return property as is
  if (!isOptional || !property.type) {
    return property;
  }

  // Clone the property to avoid modifying the original
  const result = { ...property };

  // OpenAI: Convert type to array with null for optional properties
  result.type = Array.isArray(result.type)
    ? result.type.includes('null')
      ? result.type
      : [...result.type, 'null']
    : [result.type, 'null'];

  return result;
}

/**
 * Recursively processes a schema to handle optional properties for OpenAI
 *
 * @param schema The schema object to process
 * @param requiredProps Array of required property names (properties not in this array are optional)
 * @returns Processed schema with correct optional property representation
 */
export function processOptionalProperties(schema: any, requiredProps?: string[]): any {
  // If not an object or null, return as is
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  // If it's an array, process each item
  if (Array.isArray(schema)) {
    return schema.map((item) => processOptionalProperties(item));
  }

  // Create a clone to avoid modifying the original
  const result: any = { ...schema };

  // If it's an object with properties, process each property
  if (schema.properties && typeof schema.properties === 'object') {
    result.properties = { ...schema.properties };

    // Get the array of required properties, defaulting to an empty array
    const required = schema.required || [];

    // Process each property
    for (const propName in result.properties) {
      const isOptional = !required.includes(propName);

      // First process any nested objects/arrays in the property
      result.properties[propName] = processOptionalProperties(result.properties[propName]);

      // Then handle the optional status
      result.properties[propName] = handleOptionalProperty(result.properties[propName], isOptional);
    }
  }

  // Recursively process all other object properties
  for (const key in result) {
    if (key !== 'properties' && typeof result[key] === 'object' && result[key] !== null) {
      result[key] = processOptionalProperties(result[key]);
    }
  }

  return result;
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
 * Prepares a JSON Schema object specifically for OpenAI structured output compatibility
 * by adding required fields and removing unsupported properties.
 *
 * @deprecated Use prepareForOpenAIStructuredOutput instead for new code
 * @public
 * @param obj The JSON Schema object to enhance
 * @param _isTopLevel Whether this is the top level object (affects processing)
 * @param handleOptionals Whether to convert optional properties to ["type", "null"] format
 * @returns Enhanced JSON Schema object ready for OpenAI structured output
 */
export function prepareForStructuredOutput(
  obj: any,
  _isTopLevel = false,
  handleOptionals = false,
): any {
  return prepareForOpenAIStructuredOutput(obj, handleOptionals);
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
