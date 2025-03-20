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
export { ToolProp, ToolMeta, updateSchemaProperty, addSchemaProperty } from './decorators';

// Re-export LLM-specific functions
export {
  classToOpenAITool,
  classToOpenAIResponseFormatJsonSchema,
  classToGeminiTool,
  classToGeminiResponseSchema,
  classToAnthropicTool,
} from './llm-formats';

// Re-export utility functions
export { prepareForStructuredOutput } from './utils';

// Legacy import name for backwards compatibility
export { classToOpenAITool as classToLLMTool } from './llm-formats';

// Namespace for all exports (backwards compatibility)
import { ToolProp, ToolMeta, updateSchemaProperty, addSchemaProperty } from './decorators';
import { classToJsonSchema } from './core';
import {
  classToOpenAITool,
  classToOpenAIResponseFormatJsonSchema,
  classToGeminiTool,
  classToGeminiResponseSchema,
  classToAnthropicTool,
} from './llm-formats';
import { prepareForStructuredOutput } from './utils';

export const Schema = {
  // Decorators
  ToolMeta,
  ToolProp,

  // Core JSON Schema generation
  classToJsonSchema,
  prepareForStructuredOutput,

  // Schema modification
  updateSchemaProperty,
  addSchemaProperty,

  // LLM-specific formats
  classToOpenAITool,
  classToOpenAIResponseFormatJsonSchema,
  classToGeminiTool,
  classToGeminiResponseSchema,
  classToAnthropicTool,

  // Legacy name
  classToLLMTool: classToOpenAITool,
} as const;
