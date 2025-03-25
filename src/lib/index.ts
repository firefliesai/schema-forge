/**
 * Schema Forge - TypeScript to JSON Schema conversion
 *
 * Main exports for schema-forge library
 */

// Re-export all public types
export * from './types';

// Re-export core functionality
export { classToJsonSchema } from './core';

// Re-export decorator functions
export { addSchemaProperty, ToolMeta, ToolProp, updateSchemaProperty } from './decorators';

// Re-export LLM-specific functions
export {
  classToAnthropicTool,
  classToGeminiOldResponseSchema,
  classToGeminiOldTool,
  classToGeminiResponseSchema,
  classToGeminiTool,
  classToGeminiVertexResponseSchema,
  classToGeminiVertexTool,
  classToOpenAIResponseApiTextSchema,
  classToOpenAIResponseApiTool,
  classToOpenAIResponseFormatJsonSchema,
  classToOpenAITool,
  // Direct JSON Schema converters
  jsonSchemaToAnthropicTool,
  jsonSchemaToGeminiResponseSchema,
  jsonSchemaToGeminiTool,
  jsonSchemaToOpenAIResponseApiTextSchema,
  jsonSchemaToOpenAIResponseApiTool,
  jsonSchemaToOpenAIResponseFormat,
  jsonSchemaToOpenAITool,
  openAIResponseApiToolToJsonSchema,
  // Extract JSON Schema from LLM formats
  openAIToolToJsonSchema,
} from './llm-formats';

// Re-export utility functions
export { prepareForOpenAIStructuredOutput } from './utils';

// Legacy import name for backwards compatibility
export { classToOpenAITool as classToLLMTool } from './llm-formats';

// Namespace for all exports (backwards compatibility)
import { classToJsonSchema } from './core';
import { addSchemaProperty, ToolMeta, ToolProp, updateSchemaProperty } from './decorators';
import {
  classToAnthropicTool,
  classToGeminiResponseSchema,
  classToGeminiTool,
  classToOpenAIResponseApiTextSchema,
  classToOpenAIResponseApiTool,
  classToOpenAIResponseFormatJsonSchema,
  classToOpenAITool,
  jsonSchemaToAnthropicTool,
  jsonSchemaToGeminiResponseSchema,
  jsonSchemaToGeminiTool,
  jsonSchemaToOpenAIResponseApiTextSchema,
  jsonSchemaToOpenAIResponseApiTool,
  jsonSchemaToOpenAIResponseFormat,
  jsonSchemaToOpenAITool,
  openAIResponseApiToolToJsonSchema,
  openAIToolToJsonSchema,
} from './llm-formats';
import { prepareForOpenAIStructuredOutput } from './utils';

export const Schema = {
  // Decorators
  ToolMeta,
  ToolProp,

  // Core JSON Schema generation
  classToJsonSchema,
  prepareForOpenAIStructuredOutput,

  // Schema modification
  updateSchemaProperty,
  addSchemaProperty,

  // LLM-specific class converter functions
  classToOpenAITool,
  classToOpenAIResponseFormatJsonSchema,
  classToOpenAIResponseApiTool,
  classToOpenAIResponseApiTextSchema,
  classToGeminiTool,
  classToGeminiResponseSchema,
  classToAnthropicTool,

  // Direct JSON Schema converter functions
  jsonSchemaToOpenAITool,
  jsonSchemaToOpenAIResponseFormat,
  jsonSchemaToOpenAIResponseApiTool,
  jsonSchemaToOpenAIResponseApiTextSchema,
  jsonSchemaToGeminiTool,
  jsonSchemaToGeminiResponseSchema,
  jsonSchemaToAnthropicTool,

  // Extract JSON Schema from LLM formats
  openAIToolToJsonSchema,
  openAIResponseApiToolToJsonSchema,

  // Legacy name
  classToLLMTool: classToOpenAITool,
} as const;
