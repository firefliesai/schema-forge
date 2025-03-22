/**
 * Types for schema-forge
 */

import type { Type } from '@google/genai';
import type { SchemaType } from '@google/generative-ai';

// Metadata keys
export const JSON_SCHEMA_METADATA_KEY = Symbol('jsonSchema');
export const REQUIRED_PROPS_METADATA_KEY = Symbol('requiredProperties');

export type Constructor<T> = new (...args: any[]) => T;

// Schema types
export interface SchemaItemType {
  type?: 'string' | 'number' | 'boolean' | Constructor<any>;
  enum?: (string | number)[];
}

export interface BaseSchemaProperty {
  description?: string;
  enum?: string[] | number[] | object;
  items?: SchemaItemType | JSONSchemaDefinition;
  properties?: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

export interface PropertyOptions extends BaseSchemaProperty {
  isOptional?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

export interface JSONSchemaProperty extends BaseSchemaProperty {
  type: string;
  properties?: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

// The common first layer of the JSON schema used by LLM
// Theoretically, it can have description field as well.
// Practically, description is not used in LLM for the first layer.
export interface JSONSchemaDefinition extends Record<string, unknown> {
  type: 'object';
  properties: {
    [key: string]: JSONSchemaProperty;
  };
  required?: string[];
}

// LLM-specific formats

// OpenAI Tool Function format
export interface OpenAIToolFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: any; // json schema
    strict?: boolean;
  };
}

/** for chat completion api */
export interface OpenAIResponseFormatJsonSchema {
  type: 'json_schema';
  json_schema: {
    name: string;
    description?: string;
    schema: any;
    strict: boolean;
  };
}

/** for new response API, equivalent to OpenAIResponseFormatJsonSchema */
export interface OpenAIResponseApiTextSchema {
  type: 'json_schema';
  name?: string;
  description?: string;
  schema: any;
  strict?: boolean | null;
}

/** strict becomes required in new response api */
export interface OpenAIResponseApiToolFunction {
  type: 'function';
  name: string;
  description?: string;
  parameters: any; // json schema
  strict: boolean;
}

// Gemini Tool Function format
export interface GeminiToolFunction {
  name: string;
  description?: string;
  parameters: {
    // json schema like structure,
    // GoogleGenAI (new gemini api) prefer capital 'OBJECT' instead of 'object'
    // but 'object' is also accepted by Gemini API
    type: Type.OBJECT;
    description?: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface GeminiOldToolFunction {
  name: string;
  description?: string;
  parameters: {
    // json schema structure,
    type: SchemaType.OBJECT;
    description?: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/** json schema like, except object becoming capital 'OBJECT  */
export interface GeminiResponseSchema {
  description?: string;
  type: Type.OBJECT;
  properties: Record<string, any>;
  required?: string[];
}

export interface GeminiOldResponseSchema {
  description?: string;
  type: SchemaType.OBJECT;
  properties: Record<string, any>;
  required?: string[];
}

// Anthropic Tool Function format
export interface AnthropicToolFunction {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Options for classToJsonSchema function
export interface JsonSchemaOptions<T> {
  /**
   * Property overrides to apply to the schema
   */
  propertyOverrides?: Partial<{
    [P in PropertyPath<T>]: Partial<PropertyOptions>;
  }>;

  /**
   * Whether to prepare the schema for structured output
   */
  forStructuredOutput?: boolean;
}

// Options for OpenAI tool functions
export interface OpenAIToolOptions<T> extends JsonSchemaOptions<T> {
  /**
   * Whether to add strict:true to the function object
   */
  strict?: boolean;
}

// Options for OpenAI response format
export interface OpenAIResponseFormatOptions<T> extends JsonSchemaOptions<T> {
  /**
   * Whether to set strict:true on the json_schema
   * Usually you want this to be true when using structured output
   */
  strict?: boolean;
}

// Options for Gemini tool functions
export type GeminiToolOptions<T> = JsonSchemaOptions<T>;

// Options for Anthropic tool functions
export type AnthropicToolOptions<T> = JsonSchemaOptions<T>;

// Options for Gemini response schema
export type GeminiResponseSchemaOptions<T> = JsonSchemaOptions<T>;

// Type utilities to get all possible property paths
export type Primitive = string | number | boolean;

export type ArrayElement<T> = T extends (infer U)[] ? U : never;

export type PathImpl<T, Key extends keyof T> = Key extends string
  ? T[Key] extends Primitive
    ? `${Key}`
    : T[Key] extends Array<any>
      ? `${Key}` | `${Key}.${PathImpl<ArrayElement<T[Key]>, keyof ArrayElement<T[Key]>>}`
      : T[Key] extends object
        ? `${Key}` | `${Key}.${PathImpl<T[Key], keyof T[Key]>}`
        : never
  : never;

export type PropertyPath<T> = PathImpl<T, keyof T>;

export type InferSchema<T> = T extends new (...args: any[]) => any
  ? ReturnType<typeof import('./utils').inferType<T>>
  : never;
