/**
 * LLM-specific formats for different providers
 */
import { classToJsonSchema } from './core';
import {
  AnthropicToolFunction,
  AnthropicToolOptions,
  GeminiOldResponseSchema,
  GeminiOldToolFunction,
  GeminiResponseSchema,
  GeminiResponseSchemaOptions,
  GeminiToolFunction,
  GeminiToolOptions,
  GeminiVertexResponseSchema,
  GeminiVertexToolFunction,
  JSONSchemaDefinition,
  OpenAIResponseApiTextSchema,
  OpenAIResponseApiToolFunction,
  OpenAIResponseFormatJsonSchema,
  OpenAIResponseFormatOptions,
  OpenAIToolFunction,
  OpenAIToolOptions,
  SchemaType,
  Type,
} from './types';
import { prepareForOpenAIStructuredOutput } from './utils';

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
  options?: { strict?: boolean },
): OpenAIToolFunction {
  return {
    type: 'function',
    function: {
      name: metadata.name,
      ...(metadata.description && { description: metadata.description }),
      parameters: schema,
      ...(options?.strict && { strict: options.strict }),
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
  options: { strict: boolean },
): OpenAIResponseApiToolFunction {
  return {
    type: 'function',
    name: metadata.name,
    ...(metadata.description && { description: metadata.description }),
    parameters: schema,
    strict: options.strict,
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
  options?: { strict?: boolean },
): OpenAIResponseFormatJsonSchema {
  return {
    type: 'json_schema',
    json_schema: {
      name: metadata.name,
      ...(metadata.description && { description: metadata.description }),
      schema: schema,
      ...(options?.strict && { strict: options.strict }),
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
  options?: { strict?: boolean },
): OpenAIResponseApiTextSchema {
  return {
    type: 'json_schema',
    name: metadata.name,
    ...(metadata.description && { description: metadata.description }),
    schema: schema,
    ...(options?.strict && { strict: options.strict }),
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
  metadata: { name: string; description?: string },
): AnthropicToolFunction {
  return {
    name: metadata.name,
    ...(metadata.description && { description: metadata.description }),
    input_schema: {
      type: 'object',
      properties: schema.properties,
      required: schema.required || [],
    },
  };
}

/**
 * Converts a JSON Schema to Gemini tool format (@google/genai)
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
  metadata: { name: string; description?: string },
): GeminiToolFunction {
  return {
    name: metadata.name,
    ...(metadata.description && { description: metadata.description }),
    parameters: {
      type: Type.OBJECT, //'OBJECT',
      ...(metadata.description && { description: metadata.description }),
      properties: schema.properties,
      required: schema.required || [],
    },
  };
}

/** @google/generative-ai */
export function jsonSchemaToGeminiOldTool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
): GeminiOldToolFunction {
  return {
    name: metadata.name,
    ...(metadata.description && { description: metadata.description }),
    parameters: {
      type: SchemaType.OBJECT,
      ...(metadata.description && { description: metadata.description }),
      properties: schema.properties,
      required: schema.required || [],
    },
  };
}

/** @google-cloud/vertexai */
export function jsonSchemaToGeminiVertexTool(
  schema: JSONSchemaDefinition,
  metadata: { name: string; description?: string },
): GeminiVertexToolFunction {
  return jsonSchemaToGeminiTool(schema, metadata) as unknown as GeminiVertexToolFunction;
}

/**
 * Converts a JSON Schema to Gemini response schema format (@google/genai)
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
  metadata: { description?: string },
): GeminiResponseSchema {
  return {
    type: Type.OBJECT,
    ...(metadata.description && { description: metadata.description }),
    properties: schema.properties,
    required: schema.required || [],
  };
}

/** @google/generative-ai */
export function jsonSchemaToGeminiOldResponseSchema(
  schema: JSONSchemaDefinition,
  metadata: { description?: string },
): GeminiOldResponseSchema {
  return {
    type: SchemaType.OBJECT,
    ...(metadata.description && { description: metadata.description }),
    properties: schema.properties,
    required: schema.required || [],
  };
}

// @google-cloud/vertexai
export function jsonSchemaToGeminiVertexResponseSchema(
  schema: JSONSchemaDefinition,
  metadata: { description?: string },
): GeminiVertexResponseSchema {
  return jsonSchemaToGeminiResponseSchema(
    schema,
    metadata,
  ) as unknown as GeminiVertexResponseSchema;
}

/**
 * Creates an OpenAI-compatible tool function from a class
 *
 * @example
 * // Using options object
 * const tool = classToOpenAITool(UserClass, {
 *   forStructuredOutput: true,
 *   propertyOverrides: {
 *     'username': { description: 'Override description' }
 *   }
 * });
 *
 * // Use with OpenAI API:
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o-mini",
 *   messages: [...],
 *   tools: [tool]
 * });
 */
export function classToOpenAITool<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIToolOptions<T>,
): OpenAIToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema without OpenAI-specific processing
  let jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Apply OpenAI structured output processing if requested
  if (options?.forStructuredOutput) {
    jsonSchema = prepareForOpenAIStructuredOutput(jsonSchema, true);
  }

  // Use the helper function to convert JSON schema to OpenAI tool
  return jsonSchemaToOpenAITool(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description,
    },
    {
      strict: !!options?.forStructuredOutput,
    },
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
 * });
 *
 * // Use with OpenAI Response API:
 * const response = await openai.responses.create({
 *   model: "gpt-4o-mini",
 *   input: "Create a user with name John Doe",
 *   tools: [tool]
 * });
 */
export function classToOpenAIResponseApiTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIToolOptions<T>,
): OpenAIResponseApiToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // For Response API, use forStructuredOutput if provided, otherwise default to true
  const strict = options?.forStructuredOutput ?? true;

  // Get basic JSON schema
  let jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Always apply OpenAI structured output processing for Response API
  // with handling of optional properties if strict is true
  jsonSchema = prepareForOpenAIStructuredOutput(jsonSchema, strict);

  // Use the helper function to convert JSON schema to OpenAI Response API tool
  return jsonSchemaToOpenAIResponseApiTool(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description,
    },
    {
      strict,
    },
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
 * });
 *
 * // Use with OpenAI API:
 * const completion = await openai.chat.completions.create({
 *   model: "gpt-4o-mini",
 *   messages: [...],
 *   response_format: responseFormat,
 * });
 */
export function classToOpenAIResponseFormatJsonSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: OpenAIResponseFormatOptions<T>,
): OpenAIResponseFormatJsonSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema
  let jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Apply OpenAI structured output processing if requested
  if (options?.forStructuredOutput) {
    jsonSchema = prepareForOpenAIStructuredOutput(jsonSchema, true);
  }

  // Use forStructuredOutput to determine if strict should be true
  const strict = !!options?.forStructuredOutput;

  // Use the helper function to convert JSON schema to OpenAI response format
  return jsonSchemaToOpenAIResponseFormat(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description,
    },
    {
      strict,
    },
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
 *   model: "gpt-4o-mini",
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

  // Get basic JSON schema
  let jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Apply OpenAI structured output processing if requested
  if (options?.forStructuredOutput) {
    jsonSchema = prepareForOpenAIStructuredOutput(jsonSchema, true);
  }

  // Use forStructuredOutput to determine if strict should be true
  const strict = !!options?.forStructuredOutput;

  // Use the helper function to convert JSON schema to OpenAI Response API text format
  return jsonSchemaToOpenAIResponseApiTextSchema(
    jsonSchema,
    {
      name: classOptions.name || '',
      description: classOptions.description,
    },
    {
      strict,
    },
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
 * // Use with Google @google/genai:
 * const model = genAI.getGenerativeModel({
 *   model: "gemini-2.0-flash-001",
 *   tools: { functionDeclarations: [toolDeclaration] },
 * });
 */
export function classToGeminiTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiToolOptions<T>,
): GeminiToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema
  const jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Note: Gemini has broader JSON Schema support and doesn't require special processing
  // for structured output like OpenAI does

  // Use the helper function to convert JSON schema to Gemini tool format
  return jsonSchemaToGeminiTool(jsonSchema, {
    name: classOptions.name || '',
    description: classOptions.description,
  });
}

/** @google/generative-ai */
export function classToGeminiOldTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiToolOptions<T>,
): GeminiOldToolFunction {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema
  const jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Note: Gemini has broader JSON Schema support and doesn't require special processing
  // for structured output like OpenAI does

  // Use the helper function to convert JSON schema to Gemini tool format
  return jsonSchemaToGeminiOldTool(jsonSchema, {
    name: classOptions.name || '',
    description: classOptions.description,
  });
}

// @google-cloud/vertexai
export function classToGeminiVertexTool<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiToolOptions<T>,
): GeminiVertexToolFunction {
  return classToGeminiTool(target, options) as unknown as GeminiVertexToolFunction;
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
 *   model: "claude-3-7-sonnet-20250219",
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
  return jsonSchemaToAnthropicTool(jsonSchema, {
    name: classOptions.name || '',
    description: classOptions.description,
  });
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
 * const responseSchema = classToGeminiResponseSchema(RecipeClass, {
 *   propertyOverrides: {
 *     'ingredients': { description: 'List of recipe ingredients' }
 *   }
 * });
 *
 * // Use with Google @google/genai:
 *  const response = await gemini.models.generateContent({
 *    model: 'gemini-2.0-flash-001',
 *    contents: userMessage,
 *    config: {
 *      responseMimeType: 'application/json',
 *      responseSchema: responseSchema,
 *    },
 *  });
 */
export function classToGeminiResponseSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiResponseSchemaOptions<T>,
): GeminiResponseSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema
  const jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Note: Gemini has broader JSON Schema support and doesn't require special processing
  // for structured output like OpenAI does

  // Use the helper function to convert JSON schema to Gemini response schema format
  return jsonSchemaToGeminiResponseSchema(jsonSchema, {
    description: classOptions.description,
  });
}

// @google/generative-ai
export function classToGeminiOldResponseSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiResponseSchemaOptions<T>,
): GeminiOldResponseSchema {
  const classOptions = Reflect.getMetadata('jsonSchema:options', target) || {};

  // Get basic JSON schema
  const jsonSchema = classToJsonSchema(target, {
    propertyOverrides: options?.propertyOverrides,
  });

  // Note: Gemini has broader JSON Schema support and doesn't require special processing
  // for structured output like OpenAI does

  // Use the helper function to convert JSON schema to Gemini response schema format
  return jsonSchemaToGeminiOldResponseSchema(jsonSchema, {
    description: classOptions.description,
  });
}

/** @google-cloud/vertexai */
export function classToGeminiVertexResponseSchema<T extends object>(
  target: new (...args: any[]) => T,
  options?: GeminiResponseSchemaOptions<T>,
): GeminiVertexResponseSchema {
  return classToGeminiResponseSchema(target, options) as unknown as GeminiVertexResponseSchema;
}

/**
 * Extracts JSON Schema and metadata from an OpenAI Chat Completions API tool format
 *
 * This function is useful when you want to convert an existing OpenAI tool definition
 * to another LLM format (e.g., Anthropic or Gemini) or when you need to extract
 * the JSON Schema for other purposes.
 *
 * @example
 * // Extract JSON Schema from an OpenAI tool
 * const openaiTool = {
 *   type: 'function',
 *   function: {
 *     name: 'get_user',
 *     description: 'Get user information',
 *     parameters: {
 *       type: 'object',
 *       properties: { id: { type: 'string' } },
 *       required: ['id']
 *     }
 *   }
 * };
 *
 * const { schema, metadata } = openAIToolToJsonSchema(openaiTool);
 *
 * // Convert to Anthropic format
 * const anthropicTool = jsonSchemaToAnthropicTool(schema, metadata);
 */
export function openAIToolToJsonSchema(openAITool: OpenAIToolFunction): {
  schema: JSONSchemaDefinition;
  metadata: { name: string; description?: string };
} {
  return {
    schema: openAITool.function.parameters,
    metadata: {
      name: openAITool.function.name,
      ...(openAITool.function.description && { description: openAITool.function.description }),
    },
  };
}

/**
 * Extracts JSON Schema and metadata from an OpenAI Response API tool format
 *
 * This function is useful when you want to convert an existing OpenAI Response API tool
 * definition to another LLM format (e.g., Anthropic or Gemini) or when you need to extract
 * the JSON Schema for other purposes.
 *
 * @example
 * // Extract JSON Schema from an OpenAI Response API tool
 * const responseApiTool = {
 *   type: 'function',
 *   name: 'get_user',
 *   description: 'Get user information',
 *   parameters: {
 *     type: 'object',
 *     properties: { id: { type: 'string' } },
 *     required: ['id']
 *   },
 *   strict: true
 * };
 *
 * const { schema, metadata } = openAIResponseApiToolToJsonSchema(responseApiTool);
 *
 * // Convert to Gemini format
 * const geminiTool = jsonSchemaToGeminiTool(schema, metadata);
 */
export function openAIResponseApiToolToJsonSchema(openAITool: OpenAIResponseApiToolFunction): {
  schema: JSONSchemaDefinition;
  metadata: { name: string; description?: string };
} {
  return {
    schema: openAITool.parameters,
    metadata: {
      name: openAITool.name,
      ...(openAITool.description && { description: openAITool.description }),
    },
  };
}
