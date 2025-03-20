/* eslint complexity: ["error", 22]*/

import 'reflect-metadata';

// Metadata keys
const JSON_SCHEMA_METADATA_KEY = Symbol('jsonSchema');
const REQUIRED_PROPS_METADATA_KEY = Symbol('requiredProperties');

type Constructor<T> = new (...args: any[]) => T;

// Interfaces
interface SchemaItemType {
  type?: 'string' | 'number' | 'boolean' | Constructor<any>;
  enum?: (string | number)[];
}
interface BaseSchemaProperty {
  description?: string;
  enum?: string[] | number[] | object;
  items?: SchemaItemType | JSONSchemaDefinition;
  properties?: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

interface PropertyOptions extends BaseSchemaProperty {
  isOptional?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

interface JSONSchemaProperty extends BaseSchemaProperty {
  type: string;
  properties?: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

interface JSONSchemaDefinition extends Record<string, unknown> {
  type: 'object';
  properties: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

// OpenAI Tool Function format
interface OpenAIToolFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
    strict?: boolean;
  };
}

// Gemini Tool Function format
interface GeminiToolFunction {
  name: string;
  description?: string;
  parameters: {
    type: 'OBJECT';
    description?: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// Anthropic Tool Function format
interface AnthropicToolFunction {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Helper functions
function isCustomClass(type: any): boolean {
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

function extractEnumValues(enumType: any): any[] {
  if (Array.isArray(enumType)) {
    return enumType;
  }

  if (typeof enumType === 'object' && enumType !== null) {
    const enumKeys = Object.keys(enumType).filter((key) => isNaN(Number(key)));
    return enumKeys.map((key) => enumType[key]);
  }

  return [];
}

function getJsonSchemaType(type: any): string {
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

/* eslint complexity: ["error", 23]*/
function applyPropertyUpdates(
  properties: any,
  paths: string[],
  updates: Partial<PropertyOptions>,
  target: any,
) {
  const [current, ...rest] = paths;

  // Handle nested path
  if (rest.length > 0) {
    if (!properties[current]) {
      properties[current] = {};
    }

    // Get all metadata along the target property's full path
    const originalMetadata =
      Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

    let currentMetadata = originalMetadata;
    for (const path of paths) {
      currentMetadata =
        currentMetadata?.[path] ||
        currentMetadata?.items?.properties?.[path] ||
        currentMetadata?.properties?.[path] ||
        {};
    }

    // Handle enum update for nested property
    if (updates.enum) {
      const enumValues = extractEnumValues(updates.enum);
      const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';

      const targetProp = properties[current];
      if (targetProp.type === 'array') {
        // Update in items.properties
        if (!targetProp.items.properties) {
          targetProp.items.properties = {};
        }
        let current = targetProp.items.properties;
        for (let i = 0; i < rest.length - 1; i++) {
          const path = rest[i];
          if (!current[path]) {
            current[path] = { type: 'object', properties: {} };
          }
          // If this is an array type property
          if (current[path].type === 'array') {
            if (!current[path].items.properties) {
              current[path].items.properties = {};
            }
            current = current[path].items.properties;
          } else {
            // Object type property
            if (!current[path].properties) {
              current[path].properties = {};
            }
            current = current[path].properties;
          }
        }

        // Get the last path segment
        const lastPath = rest[rest.length - 1];
        
        // Check if the target property should be an array of enums or just an enum
        if (current[lastPath] && current[lastPath].type === 'array') {
          // Update items of an array property
          current[lastPath].items = {
            type: enumType,
            enum: enumValues,
          };
        } else {
          // Direct enum property
          current[lastPath] = {
            ...(current[lastPath] || {}),
            type: enumType,
            enum: enumValues,
            description: current[lastPath]?.description || currentMetadata.description,
          };
        }
      } else if (targetProp.type === 'object') {
        // Update in object properties
        if (!targetProp.properties) {
          targetProp.properties = {};
        }
        let current = targetProp.properties;
        for (let i = 0; i < rest.length - 1; i++) {
          const path = rest[i];
          if (!current[path]) {
            current[path] = { type: 'object', properties: {} };
          }
          // If this is an array type property
          if (current[path].type === 'array') {
            if (!current[path].items.properties) {
              current[path].items.properties = {};
            }
            current = current[path].items.properties;
          } else {
            // Object type property
            if (!current[path].properties) {
              current[path].properties = {};
            }
            current = current[path].properties;
          }
        }
        
        // Get the last path segment
        const lastPath = rest[rest.length - 1];
        
        // Update the enum property
        current[lastPath] = {
          ...(current[lastPath] || {}),
          type: enumType,
          enum: enumValues,
          description: current[lastPath]?.description || currentMetadata.description,
        };
      }
    } else {
      // Update general nested path
      if (properties[current].type === 'array') {
        if (!properties[current].items.properties) {
          properties[current].items.properties = {};
        }
        applyPropertyUpdates(
          properties[current].items.properties,
          rest,
          updates,
          target,
        );
      } 
      // Handle nested object properties
      else if (properties[current].type === 'object') {
        if (!properties[current].properties) {
          properties[current].properties = {};
        }
        applyPropertyUpdates(
          properties[current].properties,
          rest,
          updates,
          target,
        );
      }
    }
    return;
  }

  // Handle non-nested path
  const currentProperty = properties[current] || {};

  if (updates.enum) {
    const enumValues = extractEnumValues(updates.enum);
    const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';

    const type = Reflect.getMetadata('design:type', target.prototype, current);

    if (type === Array) {
      properties[current] = {
        ...currentProperty,
        type: 'array',
        items: {
          type: enumType,
          enum: enumValues,
        },
      };
    } else {
      properties[current] = {
        ...currentProperty,
        type: enumType,
        enum: enumValues,
      };
    }

    const { enum: _, ...remainingUpdates } = updates;
    Object.assign(properties[current], remainingUpdates);
  } else {
    properties[current] = {
      ...currentProperty,
      ...updates,
    };
  }
}

export function ToolProp(options: PropertyOptions = {}) {
  return function (target: any, propertyKey: string) {
    const type = Reflect.getMetadata('design:type', target, propertyKey);
    // Exclude isOptional, keep only other options
    const { isOptional, ...finalOptions } = options;

    const ownProperties =
      Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target) || {};
    const ownRequiredProps =
      Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target) || [];

    const parentTarget = Object.getPrototypeOf(target);
    let currentProperties = {};
    let currentRequiredProps: string[] = [];

    if (parentTarget && parentTarget !== Object.prototype) {
      const parentProperties = cloneMetadata(
        Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, parentTarget) || {},
      );
      const parentRequiredProps = [
        ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, parentTarget) ||
          []),
      ];

      currentProperties = { ...parentProperties };
      currentRequiredProps = [...parentRequiredProps];
    }

    currentProperties = { ...currentProperties, ...ownProperties };
    currentRequiredProps = [
      ...new Set([...currentRequiredProps, ...ownRequiredProps]),
    ];

    if (type === Array) {
      if (options.enum) {
        const enumValues = extractEnumValues(options.enum);
        const enumType =
          typeof enumValues[0] === 'string' ? 'string' : 'number';
        finalOptions.type = 'array';
        finalOptions.items = {
          type: enumType,
          enum: enumValues,
        };
        delete finalOptions.enum;
      } else if (!options.items) {
        throw new Error(
          `Array property "${propertyKey}" needs explicit type information.`,
        );
      } else if (isCustomClass(options.items.type)) {
        const nestedSchema = classToJsonSchema(
          options.items.type as Constructor<any>,
        );
        finalOptions.type = 'array';
        finalOptions.items = nestedSchema;
      } else {
        finalOptions.type = 'array';
        finalOptions.items = options.items;
      }
    } else if (options.enum) {
      const enumValues = extractEnumValues(options.enum);
      const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';
      finalOptions.type = enumType;
      finalOptions.enum = enumValues;
    } else if (isCustomClass(type)) {
      const nestedSchema = classToJsonSchema(type);
      finalOptions.type = 'object';
      finalOptions.properties = nestedSchema.properties;
      finalOptions.required = nestedSchema.required;
    }

    currentProperties[propertyKey] = {
      ...finalOptions,
      type: finalOptions.type || getJsonSchemaType(type),
    };

    // Handle required props only, don't store isOptional
    if (!options.isOptional) {
      if (!currentRequiredProps.includes(propertyKey)) {
        currentRequiredProps.push(propertyKey);
      }
    } else {
      currentRequiredProps = currentRequiredProps.filter(
        (prop) => prop !== propertyKey,
      );
    }

    Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, currentProperties, target);
    Reflect.defineMetadata(
      REQUIRED_PROPS_METADATA_KEY,
      currentRequiredProps,
      target,
    );
  };
}

export function ToolMeta(
  options: {
    name?: string;
    description?: string;
  } = {},
) {
  return function (target: any) {
    Reflect.defineMetadata('jsonSchema:options', options, target);
  };
}

export function updateSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: PropertyPath<T>,
  updates: Partial<PropertyOptions>,
): void {
  const paths = (propertyPath as string).split('.');
  const existingProperties =
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  applyPropertyUpdates(existingProperties, paths, updates, target);

  Reflect.defineMetadata(
    JSON_SCHEMA_METADATA_KEY,
    existingProperties,
    target.prototype,
  );
}

export function addSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: string,
  options: PropertyOptions,
): void {
  const finalOptions = { ...options };
  if (options.enum) {
    const enumValues = extractEnumValues(options.enum);
    const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';
    finalOptions.type = enumType;
  } else if (!options.type) {
    throw new Error('Either type or enum must be specified');
  }

  const paths = propertyPath.split('.');
  const existingProperties =
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  let current = existingProperties;
  for (let i = 0; i < paths.length - 1; i++) {
    const path = paths[i];
    if (current[path]?.type === 'array') {
      if (!current[path].items.properties) {
        current[path].items.properties = {};
      }
      current = current[path].items.properties;
    } else {
      if (!current[path]?.properties) {
        current[path] = {
          type: 'object',
          properties: {},
        };
      }
      current = current[path].properties;
    }
  }

  const propertyKey = paths[paths.length - 1];
  current[propertyKey] = {
    type: finalOptions.type,
    description: finalOptions.description,
  };

  if (finalOptions.enum) {
    const enumValues = extractEnumValues(finalOptions.enum);
    current[propertyKey].enum = enumValues;
  }

  if (finalOptions.items) {
    current[propertyKey] = {
      type: 'array',
      description: finalOptions.description,
      items: finalOptions.items,
    };
  }

  Reflect.defineMetadata(
    JSON_SCHEMA_METADATA_KEY,
    existingProperties,
    target.prototype,
  );

  if (!finalOptions.isOptional) {
    const requiredProps =
      Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || [];
    if (!requiredProps.includes(propertyKey)) {
      requiredProps.push(propertyKey);
      Reflect.defineMetadata(
        REQUIRED_PROPS_METADATA_KEY,
        requiredProps,
        target.prototype,
      );
    }
  }
}

// Type utilities to get all possible property paths
type Primitive = string | number | boolean;

type ArrayElement<T> = T extends (infer U)[] ? U : never;

type PathImpl<T, Key extends keyof T> = Key extends string
  ? T[Key] extends Primitive
    ? `${Key}`
    : T[Key] extends Array<any>
    ?
        | `${Key}`
        | `${Key}.${PathImpl<ArrayElement<T[Key]>, keyof ArrayElement<T[Key]>>}`
    : T[Key] extends object
    ? `${Key}` | `${Key}.${PathImpl<T[Key], keyof T[Key]>}`
    : never
  : never;

type PropertyPath<T> = PathImpl<T, keyof T>;

function cloneMetadata(metadata: any): any {
  return JSON.parse(JSON.stringify(metadata));
}

/**
 * Enhances a JSON Schema object for structured output compatibility with LLM APIs
 * by adding required fields and removing unsupported properties
 */
function enhanceSchemaForStructuredOutput(
  obj: any,
  isTopLevel = false,
): any {
  // If the input is not an object or is null, return the input value directly
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // If the input is an array, recursively call this function for each element
  if (Array.isArray(obj)) {
    return obj.map((item) => enhanceSchemaForStructuredOutput(item));
  }

  // Create a new object to avoid modifying the original object
  const newObj: any = { ...obj };

  // If it's the top level object, add 'strict: true'
  // since the strict is not supported in the json schema itself, and it is a LLM specific property
  // if (isTopLevel) {
  //   newObj.strict = true;
  // }

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
    ['minLength', 'maxLength', 'pattern', 'format'].forEach(prop => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (newObj.type === 'number') {
    // Remove unsupported number properties
    ['minimum', 'maximum', 'multipleOf'].forEach(prop => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (newObj.type === 'object') {
    // Remove unsupported object properties
    ['patternProperties', 'unevaluatedProperties', 'propertyNames', 
     'minProperties', 'maxProperties'].forEach(prop => {
      if (prop in newObj) delete newObj[prop];
    });
  } else if (newObj.type === 'array') {
    // Remove unsupported array properties
    ['unevaluatedItems', 'contains', 'minContains', 'maxContains',
     'minItems', 'maxItems', 'uniqueItems'].forEach(prop => {
      if (prop in newObj) delete newObj[prop];
    });
  }

  // Recursively process all object properties
  for (const key in newObj) {
    if (typeof newObj[key] === 'object' && newObj[key] !== null) {
      newObj[key] = enhanceSchemaForStructuredOutput(newObj[key], false);
    }
  }

  return newObj;
}

// Type inference helper
function inferType<T>(target: new (...args: any[]) => any): T {
  return null as any;
}

export type InferSchema<T> = T extends new (...args: any[]) => any
  ? ReturnType<typeof inferType<T>>
  : never;

export function classToJsonSchema<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
  enhanceForStructuredOutput = false,
): JSONSchemaDefinition {
  const properties = cloneMetadata(
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {},
  );
  const requiredProps = [
    ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) ||
      []),
  ];

  if (temporaryUpdates) {
    Object.entries(temporaryUpdates).forEach(([path, updates]) => {
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

  // If enhanceForStructuredOutput is true, enhance the schema
  if (enhanceForStructuredOutput) {
    return enhanceSchemaForStructuredOutput(schema, false);
  }

  return schema;
}

/**
 * Creates an OpenAI-compatible tool function from a class
 * 
 * @example
 * const tool = classToOpenAITool(UserClass, undefined, true);
 * // Use with OpenAI API:
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4-turbo",
 *   messages: [...],
 *   tools: [tool]
 * });
 */
export function classToOpenAITool<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
  enhanceForStructuredOutput = false,
): OpenAIToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, temporaryUpdates, enhanceForStructuredOutput);

  const toolFunction: OpenAIToolFunction = {
    type: 'function',
    function: {
      name: classOptions.name || '',
      description: classOptions.description || '',
      parameters: jsonSchema,
    },
  };

  // Add strict property at the function level if needed
  if (enhanceForStructuredOutput) {
    toolFunction.function.strict = true;
  }

  return toolFunction;
}

/**
 * Creates a Gemini-compatible tool function from a class
 * 
 * @example
 * const toolDeclaration = classToGeminiTool(UserClass);
 * // Use with Google Generative AI:
 * const model = genAI.getGenerativeModel({
 *   model: "gemini-1.5-flash",
 *   tools: { functionDeclarations: [toolDeclaration] },
 * });
 */
export function classToGeminiTool<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
): GeminiToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, temporaryUpdates);
  
  // Convert properties to Gemini format
  return {
    name: classOptions.name || '',
    description: classOptions.description || '',
    parameters: {
      type: 'OBJECT',
      description: classOptions.description || '',
      properties: jsonSchema.properties,
      required: jsonSchema.required || [],
    },
  };
}

/**
 * Creates an Anthropic-compatible tool function from a class
 * 
 * @example
 * const tool = classToAnthropicTool(UserClass);
 * // Use with Anthropic API:
 * const message = await anthropic.messages.create({
 *   model: "claude-3-opus-20240229",
 *   max_tokens: 1000,
 *   messages: [...],
 *   tools: [tool],
 * });
 */
export function classToAnthropicTool<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
): AnthropicToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, temporaryUpdates);
  
  return {
    name: classOptions.name || '',
    description: classOptions.description || '',
    input_schema: {
      type: 'object',
      properties: jsonSchema.properties,
      required: jsonSchema.required || [],
    },
  };
}

/**
 * Creates an OpenAI response_format compatible JSON schema from a class.
 * Can be used for both normal and structured outputs with OpenAI chat completions.
 * 
 * @param target - The class to convert to JSON schema
 * @param temporaryUpdates - Optional temporary property updates
 * @param enhanceForStructuredOutput - Whether to enhance the schema for structured outputs
 *                                    Set to true when using with OpenAI's structured output.
 *                                    This affects both the schema format and the 'strict' flag.
 * 
 * @example
 * // For structured output (common case):
 * const responseFormat = classToOpenAIResponseFormatJsonSchema(UserResponseClass, undefined, true);
 * // Use with OpenAI API:
 * const completion = await openai.chat.completions.create({
 *   model: "gpt-4-turbo",
 *   messages: [...],
 *   response_format: responseFormat,
 * });
 */
export function classToOpenAIResponseFormatJsonSchema<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
  enhanceForStructuredOutput = false,
): {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: any;
    strict: boolean;
  };
} {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, temporaryUpdates, enhanceForStructuredOutput);

  return {
    type: 'json_schema',
    json_schema: {
      name: classOptions.name || '',
      schema: jsonSchema,
      strict: enhanceForStructuredOutput,
    },
  };
}

/**
 * Creates a Gemini response schema for structured output
 * 
 * Note: Gemini's structured output supports top-level arrays unlike OpenAI.
 * This function always generates an object-type schema (from a class),
 * but Gemini also supports array schemas like:
 * ```
 * {
 *   type: "ARRAY",
 *   items: {
 *     type: "OBJECT",
 *     properties: {...}
 *   }
 * }
 * ```
 * If you need an array schema, you would need to manually wrap the result
 * or create a dedicated helper function.
 * 
 * @example
 * const schema = classToGeminiResponseSchema(RecipeClass);
 * // Use with Google Generative AI:
 * const model = genAI.getGenerativeModel({
 *   model: "gemini-1.5-pro",
 *   generationConfig: {
 *     responseMimeType: "application/json",
 *     responseSchema: schema,
 *   },
 * });
 */
export function classToGeminiResponseSchema<T extends object>(
  target: new (...args: any[]) => T,
  temporaryUpdates?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>,
): any {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, temporaryUpdates);
  
  // For Gemini, we convert to their format with uppercase type names
  return {
    description: classOptions.description || '',
    type: 'OBJECT',
    properties: jsonSchema.properties,
    required: jsonSchema.required || [],
  };
}

export const Schema = {
  ToolMeta,
  ToolProp,
  classToJsonSchema,
  classToOpenAITool,
  classToOpenAIResponseFormatJsonSchema,
  classToGeminiTool,
  classToGeminiResponseSchema,
  classToAnthropicTool,
  updateSchemaProperty,
  addSchemaProperty,
} as const;
