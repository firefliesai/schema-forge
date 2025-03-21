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
  JsonSchemaOptions,
  OpenAIResponseFormatJsonSchema,
  OpenAIResponseFormatOptions,
  OpenAIResponseFormatTextJsonSchemaInResponseAPI,
  OpenAIToolFunction,
  OpenAIToolFunctionInResponseAPI,
  OpenAIToolOptions,
} from './types';

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

  const toolFunction: OpenAIToolFunction = {
    type: 'function',
    function: {
      name: classOptions.name || '',
      description: classOptions.description || undefined,
      parameters: jsonSchema,
    },
  };

  // Add strict property if specified or if we're preparing for structured output
  if (options?.strict || options?.forStructuredOutput) {
    toolFunction.function.strict = true;
  }

  return toolFunction;
}

/**
 * Creates an OpenAI-compatible tool function for the Response API from a class
 * 
 * Note: This is for use with OpenAI's newer Response API, which has a slightly
 * different format than the Chat Completions API.
 *
 * @example
 * // Create a tool for OpenAI Response API
 * const tool = classToOpenAIToolInResponseAPI(UserClass, {
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
export function classToOpenAIToolInResponseAPI<T extends object>(
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

  const toolFunction: OpenAIToolFunctionInResponseAPI = {
    type: 'function',
    name: classOptions.name || '',
    description: classOptions.description || undefined,
    parameters: jsonSchema,
    strict: options?.strict ?? null,
  };

  // Add strict property if specified or if we're preparing for structured output
  if (options?.strict || options?.forStructuredOutput) {
    toolFunction.strict = true;
  }

  return toolFunction;
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

  return {
    type: 'json_schema',
    json_schema: {
      name: classOptions.name || '',
      description: classOptions.description || undefined,
      schema: jsonSchema,
      strict,
    },
  };
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
 * const responseFormat = classToOpenAIResponseFormatTextJsonSchemaInResponseAPI(UserOutput, {
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
export function classToOpenAIResponseFormatTextJsonSchemaInResponseAPI<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIResponseFormatOptions<T>,
): OpenAIResponseFormatTextJsonSchemaInResponseAPI {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Create a modified options object where forStructuredOutput is set if strict is true
  const jsonSchemaOptions: JsonSchemaOptions<T> = { ...options };
  if (options?.strict && !options.forStructuredOutput) {
    jsonSchemaOptions.forStructuredOutput = true;
  }

  const jsonSchema = classToJsonSchema(target, jsonSchemaOptions);

  // Default to options.strict if provided, otherwise use forStructuredOutput value
  const strict = options?.strict !== undefined ? options.strict : !!options?.forStructuredOutput;

  return {
    type: 'json_schema',
    name: classOptions.name || '',
    description: classOptions.description || undefined,
    schema: jsonSchema,
    strict,
  };
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

  // Convert properties to Gemini format
  return {
    name: classOptions.name || '',
    description: classOptions.description || undefined,
    parameters: {
      type: 'OBJECT',
      description: classOptions.description || undefined,
      properties: jsonSchema.properties,
      required: jsonSchema.required || [],
    },
  };
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

  return {
    name: classOptions.name || '',
    description: classOptions.description || undefined,
    input_schema: {
      type: 'object',
      properties: jsonSchema.properties,
      required: jsonSchema.required || [],
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

  // For Gemini, we convert to their format with uppercase type names
  return {
    description: classOptions.description || '',
    type: 'OBJECT',
    properties: jsonSchema.properties,
    required: jsonSchema.required || [],
  };
}
