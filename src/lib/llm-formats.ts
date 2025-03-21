/**
 * LLM-specific formats for different providers
 */

import { classToJsonSchema } from './core';
import {
  AnthropicToolFunction,
  AnthropicToolOptions,
  GeminiResponseSchema,
  GeminiResponseSchemaOptions,
  GeminiToolFunction,
  GeminiToolOptions,
  JSONSchemaDefinition,
  JsonSchemaOptions,
  OpenAIResponseApiTextSchema,
  OpenAIResponseFormatJsonSchema,
  OpenAIResponseFormatOptions,
  OpenAIToolFunction,
  OpenAIToolFunctionInResponseAPI,
  OpenAIToolOptions,
} from './types';

/**
 * Converts a JSON Schema to OpenAI tool format for Chat Completions API
 * 
 * @example
 * // Convert a JSON schema to OpenAI tool format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const tool = jsonSchemaToOpenAITool(
 *   schema,
 *   { name: 'create_user', description: 'Creates a new user' },
 *   { strict: true }
 * );
 */
export function jsonSchemaToOpenAITool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
  options?: { strict?: boolean }
): OpenAIToolFunction {
  return {
    type: 'function',
    function: {
      name: metadata.name,
      description: metadata.description || '',
      parameters: schema,
      strict: options?.strict,
    },
  };
}

/**
 * Converts a JSON Schema to OpenAI tool format for Response API
 * 
 * @example
 * // Convert a JSON schema to OpenAI Response API tool format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const tool = jsonSchemaToOpenAIResponseApiTool(
 *   schema,
 *   { name: 'create_user', description: 'Creates a new user' },
 *   { strict: true }
 * );
 */
export function jsonSchemaToOpenAIResponseApiTool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
  options?: { strict?: boolean }
): OpenAIToolFunctionInResponseAPI {
  return {
    type: 'function',
    name: metadata.name,
    description: metadata.description,
    parameters: schema,
    strict: options?.strict ?? true,
  };
}

/**
 * Converts a JSON Schema to OpenAI response format for Chat Completions API
 * 
 * @example
 * // Convert a JSON schema to OpenAI response format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const format = jsonSchemaToOpenAIResponseFormat(
 *   schema,
 *   { name: 'user_profile', description: 'User profile information' },
 *   { strict: true }
 * );
 */
export function jsonSchemaToOpenAIResponseFormat(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
  options?: { strict?: boolean }
): OpenAIResponseFormatJsonSchema {
  return {
    type: 'json_schema',
    json_schema: {
      name: metadata.name,
      description: metadata.description,
      schema: schema,
      strict: options?.strict ?? true,
    },
  };
}

/**
 * Converts a JSON Schema to OpenAI text format for Response API
 * 
 * @example
 * // Convert a JSON schema to OpenAI Response API text format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const format = jsonSchemaToOpenAIResponseApiTextSchema(
 *   schema,
 *   { name: 'user_profile', description: 'User profile information' },
 *   { strict: true }
 * );
 */
export function jsonSchemaToOpenAIResponseApiTextSchema(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
  options?: { strict?: boolean }
): OpenAIResponseApiTextSchema {
  return {
    type: 'json_schema',
    name: metadata.name,
    description: metadata.description,
    schema: schema,
    strict: options?.strict ?? true,
  };
}

/**
 * Converts a JSON Schema to Anthropic tool format
 * 
 * @example
 * // Convert a JSON schema to Anthropic tool format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const tool = jsonSchemaToAnthropicTool(
 *   schema,
 *   { name: 'create_user', description: 'Creates a new user' }
 * );
 */
export function jsonSchemaToAnthropicTool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string }
): AnthropicToolFunction {
  return {
    name: metadata.name,
    description: metadata.description || '',
    input_schema: {
      type: 'object',
      properties: schema.properties,
      required: schema.required || [],
    },
  };
}

/**
 * Converts a JSON Schema to Gemini tool format
 * 
 * @example
 * // Convert a JSON schema to Gemini tool format
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const tool = jsonSchemaToGeminiTool(
 *   schema,
 *   { name: 'create_user', description: 'Creates a new user' }
 * );
 */
export function jsonSchemaToGeminiTool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string }
): GeminiToolFunction {
  return {
    name: metadata.name,
    description: metadata.description,
    parameters: {
      type: 'OBJECT',
      description: metadata.description,
      properties: schema.properties,
      required: schema.required || [],
    },
  };
}

/**
 * Converts a JSON Schema to Gemini response schema format
 * 
 * @example
 * // Convert a JSON schema to Gemini response schema
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * 
 * const responseSchema = jsonSchemaToGeminiResponseSchema(
 *   schema,
 *   { description: 'User profile information' }
 * );
 */
export function jsonSchemaToGeminiResponseSchema(
  schema: JSONSchemaDefinition,
  metadata: { description?: string }
): GeminiResponseSchema {
  return {
    type: 'OBJECT',
    description: metadata.description || '',
    properties: schema.properties,
    required: schema.required || [],
  };
}

/**
 * Creates an OpenAI-compatible tool function from a class
 *
 * @example
 * // Using options object
 * const tool = classToOpenAITool(UserClass, {
 *   forStructuredOutput: true,
 *   strict: true,
 *   propertyOverrides: {
 *     'username': { description: 'Override description' }
 *   }
 * });
 *
 * // Use with OpenAI API:
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4-turbo",
 *   messages: [...],
 *   tools: [tool]
 * });
 */
export function classToOpenAITool<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIToolOptions<T>,
): OpenAIToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Create a modified options object where forStructuredOutput is set if strict is true
  const jsonSchemaOptions: JsonSchemaOptions<T> = { ...options };
  if (options?.strict && !options.forStructuredOutput) {
    jsonSchemaOptions.forStructuredOutput = true;
  }

  const jsonSchema = classToJsonSchema(target, jsonSchemaOptions);
  
  // Use the helper function to convert JSON schema to OpenAI tool
  return jsonSchemaToOpenAITool(
    jsonSchema,
    { 
      name: classOptions.name || '', 
      description: classOptions.description 
    },
    { 
      strict: options?.strict || options?.forStructuredOutput 
    }
  );
}

/**
 * Creates an OpenAI-compatible tool function for the Response API from a class
 *
 * Note: This is for use with OpenAI's newer Response API, which has a slightly
 * different format than the Chat Completions API.
 *
 * @example
 * // Create a tool for OpenAI Response API
 * const tool = classToOpenAIResponseApiTool(UserClass, {
 *   forStructuredOutput: true,
 *   strict: true
 * });
 *
 * // Use with OpenAI Response API:
 * const response = await openai.responses.create({
 *   model: "gpt-4o",
 *   input: "Create a user with name John Doe",
 *   tools: [tool]
 * });
 */
export function classToOpenAIResponseApiTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIToolOptions<T>,
): OpenAIToolFunctionInResponseAPI {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Create a modified options object where forStructuredOutput is set if strict is true
  const jsonSchemaOptions: JsonSchemaOptions<T> = { ...options };
  if (options?.strict && !options.forStructuredOutput) {
    jsonSchemaOptions.forStructuredOutput = true;
  }

  const jsonSchema = classToJsonSchema(target, jsonSchemaOptions);

  // Use the helper function to convert JSON schema to OpenAI Response API tool
  return jsonSchemaToOpenAIResponseApiTool(
    jsonSchema,
    { 
      name: classOptions.name || '', 
      description: classOptions.description 
    },
    { 
      strict: options?.strict || options?.forStructuredOutput 
    }
  );
}

/**
 * Creates an OpenAI response_format compatible JSON schema from a class.
 * Can be used for both normal and structured outputs with OpenAI chat completions.
 *
 * @example
 * // For structured output (common case):
 * const responseFormat = classToOpenAIResponseFormatJsonSchema(UserClass, {
 *   forStructuredOutput: true,
 *   strict: true
 * });
 *
 * // Use with OpenAI API:
 * const completion = await openai.chat.completions.create({
 *   model: "gpt-4-turbo",
 *   messages: [...],
 *   response_format: responseFormat,
 * });
 */
export function classToOpenAIResponseFormatJsonSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIResponseFormatOptions<T>,
): OpenAIResponseFormatJsonSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Create a modified options object where forStructuredOutput is set if strict is true
  const jsonSchemaOptions: JsonSchemaOptions<T> = { ...options };
  if (options?.strict && !options.forStructuredOutput) {
    jsonSchemaOptions.forStructuredOutput = true;
  }

  const jsonSchema = classToJsonSchema(target, jsonSchemaOptions);

  // Default to options.strict if provided, otherwise use forStructuredOutput value
  const strict = options?.strict !== undefined ? options.strict : !!options?.forStructuredOutput;

  // Use the helper function to convert JSON schema to OpenAI response format
  return jsonSchemaToOpenAIResponseFormat(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description
    },
    {
      strict: strict
    }
  );
}

/**
 * Creates a JSON schema for structured output with OpenAI's Response API
 *
 * This function is specifically designed for OpenAI's new Response API, which has
 * a slightly different format for JSON schema structured output compared to
 * the Chat Completions API.
 *
 * @example
 * // Create a response format for OpenAI Response API
 * const responseFormat = classToOpenAIResponseApiTextSchema (UserOutput, {
 *   forStructuredOutput: true
 * });
 *
 * // Use with OpenAI Response API:
 * const result = await openai.responses.create({
 *   model: "gpt-4o",
 *   input: "Give me user information for John Doe",
 *   text: {
 *     format: responseFormat
 *   }
 * });
 *
 * // Parse the response
 * const data = JSON.parse(result.output[0].content[0].text);
 */
export function classToOpenAIResponseApiTextSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIResponseFormatOptions<T>,
): OpenAIResponseApiTextSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Create a modified options object where forStructuredOutput is set if strict is true
  const jsonSchemaOptions: JsonSchemaOptions<T> = { ...options };
  if (options?.strict && !options.forStructuredOutput) {
    jsonSchemaOptions.forStructuredOutput = true;
  }

  const jsonSchema = classToJsonSchema(target, jsonSchemaOptions);

  // Default to options.strict if provided, otherwise use forStructuredOutput value
  const strict = options?.strict !== undefined ? options.strict : !!options?.forStructuredOutput;

  // Use the helper function to convert JSON schema to OpenAI Response API text format
  return jsonSchemaToOpenAIResponseApiTextSchema(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description
    },
    {
      strict: strict
    }
  );
}

/**
 * Creates a Gemini-compatible tool function from a class
 *
 * @example
 * const toolDeclaration = classToGeminiTool(UserClass, {
 *   propertyOverrides: {
 *     'username': { description: 'Custom description' }
 *   }
 * });
 *
 * // Use with Google Generative AI:
 * const model = genAI.getGenerativeModel({
 *   model: "gemini-1.5-flash",
 *   tools: { functionDeclarations: [toolDeclaration] },
 * });
 */
export function classToGeminiTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiToolOptions<T>,
): GeminiToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, options);

  // Use the helper function to convert JSON schema to Gemini tool format
  return jsonSchemaToGeminiTool(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description
    }
  );
}

/**
 * Creates an Anthropic-compatible tool function from a class
 *
 * @example
 * const tool = classToAnthropicTool(UserClass, {
 *   propertyOverrides: {
 *     'username': { description: 'Custom description' }
 *   }
 * });
 *
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
  options?: AnthropicToolOptions<T>,
): AnthropicToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, options);

  // Use the helper function to convert JSON schema to Anthropic tool format
  return jsonSchemaToAnthropicTool(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description
    }
  );
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
 * const schema = classToGeminiResponseSchema(RecipeClass, {
 *   propertyOverrides: {
 *     'ingredients': { description: 'List of recipe ingredients' }
 *   }
 * });
 *
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
  options?: GeminiResponseSchemaOptions<T>,
): GeminiResponseSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, options);

  // Use the helper function to convert JSON schema to Gemini response schema format
  return jsonSchemaToGeminiResponseSchema(
    jsonSchema,
    {
      description: classOptions.description
    }
  );
}
