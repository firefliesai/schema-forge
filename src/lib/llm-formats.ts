/**
 * LLM-specific formats for different providers
 */

import 'reflect-metadata';
import {
  OpenAIToolOptions,
  OpenAIToolFunction,
  OpenAIResponseFormatOptions,
  AnthropicToolOptions,
  AnthropicToolFunction,
  GeminiToolOptions,
  GeminiToolFunction,
  GeminiResponseSchemaOptions,
  JsonSchemaOptions
} from './types';
import { classToJsonSchema } from './core';

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
  options?: OpenAIToolOptions<T>
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
      description: classOptions.description || '',
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
  options?: OpenAIResponseFormatOptions<T>
): {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: any;
    strict: boolean;
  };
} {
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
      schema: jsonSchema,
      strict,
    },
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
  options?: GeminiToolOptions<T>
): GeminiToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, options);
  
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
  options?: AnthropicToolOptions<T>
): AnthropicToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};
  const jsonSchema = classToJsonSchema(target, options);
  
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
  options?: GeminiResponseSchemaOptions<T>
): any {
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