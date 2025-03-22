# Schema Forge

[![npm version](https://img.shields.io/npm/v/schema-forge.svg)](https://www.npmjs.com/package/schema-forge)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Schema Forge is a powerful TypeScript library that transforms your TypeScript classes into JSON Schema definitions, with special support for LLM (Large Language Model) function calling formats including OpenAI, Anthropic Claude, and Google Gemini. It also provides direct converters to transform your existing JSON Schemas into LLM-compatible formats without requiring TypeScript classes.

## Features

- 🔄 Convert TypeScript classes to JSON Schema with a simple decorator API
- 🤖 Generate LLM-compatible function definitions for different AI platforms
- 🔨 Direct JSON Schema to LLM format converters (use your own JSON Schema without TypeScript classes)
- 🔄 Convert between LLM formats (e.g., OpenAI to Anthropic, Response API to Chat Completions)
- 🔧 Customize schemas with property overrides and metadata
- 🧩 Support for nested objects and complex property paths
- 📝 Built-in structured output formatting for various LLM providers
- 📦 TypeScript-first with full type safety and inference
- 🪶 Lightweight with minimal dependencies (only requires reflect-metadata)

## Installation

```bash
npm install schema-forge
```

### Required Dependency: reflect-metadata

Schema Forge relies on the `reflect-metadata` package to access metadata at runtime. This package is listed as a peer dependency:

- **npm 7+** will automatically install peer dependencies
- **npm <7**, **yarn**, and **pnpm** will not automatically install peer dependencies

If you're not using npm 7+, you'll need to manually install reflect-metadata:

```bash
npm install reflect-metadata
# or
yarn add reflect-metadata
# or
pnpm add reflect-metadata
```

You must also import reflect-metadata **once** at the entry point of your application before using Schema Forge:

```typescript
// Import this once at the beginning of your app
import 'reflect-metadata';

// Then import and use schema-forge
import { ToolMeta, ToolProp } from 'schema-forge';
```

### TypeScript Configuration

Make sure to enable experimental decorators in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true, // Required
    "emitDecoratorMetadata": true,  // Required for schema-forge to extract type information
    // ... other options
  }
}
```

## Quick Start

### Define a Class with Decorators

```typescript
import { ToolMeta, ToolProp } from 'schema-forge';

@ToolMeta({
  name: 'create_user',
  description: 'Create a new user in the system'
})
class UserInput {
  @ToolProp({
    description: 'The full name of the user'
  })
  name: string;

  @ToolProp({
    description: 'User email address',
  })
  email: string;

  @ToolProp({
    description: 'User age in years',
    isOptional: true
  })
  age?: number;

  @ToolProp({
    description: 'User role in the system',
    enum: ['admin', 'user', 'guest']
  })
  role: string;
}
```

### Generate JSON Schema

```typescript
import { classToJsonSchema } from 'schema-forge';

// Basic usage
const schema = classToJsonSchema(UserInput);
console.log(schema);
/*
{
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The full name of the user' },
    email: { type: 'string', description: 'User email address' },
    age: { type: 'number', description: 'User age in years' },
    role: { type: 'string', description: 'User role in the system', enum: ['admin', 'user', 'guest'] }
  },
  required: ['name', 'email', 'role']
}
*/

// Using the JSON Schema with OpenAI directly
const jsonSchema = classToJsonSchema(UserInput);
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [...messages],
  tools: [
    {
      type: 'function',
      function: {
        name: "create_user", // You need to manually provide name
        description: "Create a new user in the system", // You need to manually provide description
        parameters: jsonSchema,
      },
    }
  ]
});

// This is why classToOpenAITool() is more convenient as it handles the metadata for you
```

### Generate LLM Function Definitions

#### OpenAI

```typescript
import { classToOpenAITool } from 'schema-forge';

// Create an OpenAI tool definition
const openaiTool = classToOpenAITool(UserInput);

// Use in OpenAI API
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [...messages],
  tools: [openaiTool],
});

// Parse the response directly to your TypeScript class type
const data: UserInput = JSON.parse(completion.choices[0].message.tool_calls[0].function.arguments);
```

Schema Forge is also compatible with OpenAI's newest Response API:

```typescript
import OpenAI from "openai";
const openai = new OpenAI();

// Create a tool using Schema Forge
const tool = classToOpenAIResponseApiTool(UserInput);

// Use it with the Response API
const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: "Create a user with name John Doe",
  tools: [tool]
});

if (response.output[0].type === 'function_call') {
  const data: UserInput = JSON.parse(response.output[0].arguments);
  expect(data.name).toBe(findCapitalToolName);
} 
```

#### Anthropic Claude

```typescript
import { classToAnthropicTool } from 'schema-forge';

// Create an Anthropic tool definition
const claudeTool = classToAnthropicTool(UserInput);

// Use with Anthropic API
const message = await anthropic.messages.create({
  model: "claude-3-7-sonnet-20250219",
  max_tokens: 1000,
  messages: [...messages],
  tools: [claudeTool],
});

if (message.content[0].type === 'tool_use') {
  const data = message.content[0].input as UserInput;
}
```

#### Google Gemini

```typescript
import { classToGeminiTool } from 'schema-forge';

// Create a Gemini tool definition
const geminiTool = classToGeminiTool(UserInput);

// Use with Google Generative AI
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  tools: { functionDeclarations: [geminiTool] },
});
```

## Advanced Usage

### Structured Output Formatting

When you need structured output from LLMs, Schema Forge can prepare JSON schemas for this purpose:

```typescript
import { classToOpenAIResponseFormatJsonSchema } from 'schema-forge';

/** chat completion api example **/
// Create a response format for OpenAI structured output
const responseFormat = classToOpenAIResponseFormatJsonSchema(UserOutput, {
  forStructuredOutput: true,
  strict: true
});

// Use with OpenAI
const result = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [...messages],
  response_format: responseFormat,
});

// Parse the response directly to your TypeScript class type
const data: UserInput = JSON.parse(result.choices[0].message.content);

/** new response api example **/
const responseFormat = classToOpenAIResponseApiTextSchema (CapitalTool, {
  forStructuredOutput: true,
});

const response = await openai.responses.create({
  model: 'gpt-4o-mini',
  /** it is equal to deprecated system role message */
  instructions: 'You are a helpful assistant',
  input: userMessage,
  text: {
    format: responseFormat,
  },
});

if (
  response.output[0].type === 'message' &&
  response.output[0].content[0].type === 'output_text'
) {
  const data: CapitalTool = JSON.parse(response.output[0].content[0].text);
  expect(data.name).toBeDefined();
}
```

For Gemini:

```typescript
import { classToGeminiResponseSchema } from 'schema-forge';

// Create a response schema for Gemini structured output
const geminiSchema = classToGeminiResponseSchema(UserOutput);

// Use with Gemini
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: geminiSchema,
  },
});
```

### Property Overrides

You can temporarily override properties when generating schemas:

```typescript
import { classToJsonSchema } from 'schema-forge';

const schema = classToJsonSchema(UserInput, {
  propertyOverrides: {
    'name': { description: 'Custom name description' },
    'role.permissions': { description: 'Nested property override' }
  }
});
```

### Nested Objects and Arrays

Schema Forge handles nested objects and arrays seamlessly:

```typescript
class Address {
  @ToolProp({ description: 'Street address' })
  street: string;

  @ToolProp({ description: 'City name' })
  city: string;
}

class User {
  @ToolProp({ description: 'User name' })
  name: string;

  @ToolProp({ description: 'User address' })
  address: Address;

  @ToolProp({ 
    description: 'Previous addresses',
    items: { type: Address }
  })
  previousAddresses: Address[];
  
  @ToolProp({
    description: 'List of tags',
    items: { type: 'string' }
  })
  tags: string[];
  
  @ToolProp({
    description: 'List of scores',
    items: { type: 'number' }
  })
  scores: number[];
}
```

### Using TypeScript Enums

Schema Forge works well with native TypeScript enums:

```typescript
enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

class User {
  @ToolProp({ description: 'User name' })
  name: string;

  @ToolProp({ 
    description: 'User primary role',
    enum: UserRole
  })
  role: UserRole;
  
  @ToolProp({ 
    description: 'User secondary roles',
    enum: UserRole
  })
  secondaryRoles: UserRole[];
}
```

### Dynamic Schema Updates

You can update schemas programmatically. Note that these changes are permanent and will affect all future schema generations for the class:

```typescript
import { updateSchemaProperty, addSchemaProperty } from 'schema-forge';

// Update an existing property (permanent change)
updateSchemaProperty(User, 'name', {
  description: 'Updated description'
});

// Add a new property (permanent change)
addSchemaProperty(User, 'metadata.tags', {
  type: 'array',
  items: { type: 'string' },
  description: 'User tags'
});
```

### Using Direct JSON Schema Converters

If you already have a JSON Schema definition (perhaps from another source or manually created), you can convert it directly to LLM-specific formats:

```typescript
import { 
  jsonSchemaToOpenAITool, 
  jsonSchemaToOpenAIResponseApiTool 
} from 'schema-forge';

// Custom JSON Schema
const myJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'User name' },
    age: { type: 'number', description: 'Age in years' }
  },
  required: ['name']
};

// Convert to OpenAI Chat Completions API tool format
const openaiTool = jsonSchemaToOpenAITool(
  myJsonSchema,
  { name: 'user_info', description: 'Get user information' },
  { strict: true }
);

// Use with OpenAI Chat Completions API
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [...messages],
  tools: [openaiTool],
});

// Convert to OpenAI Response API tool format
// Note: strict is required for Response API and defaults to true
const responseApiTool = jsonSchemaToOpenAIResponseApiTool(
  myJsonSchema,
  { name: 'user_info', description: 'Get user information' },
  { strict: true }
);

// Use with OpenAI Response API
const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: "What's the user information?",
  tools: [responseApiTool]
});
```

This approach is particularly useful when:
- You have existing JSON Schemas that you want to use with LLMs
- You're migrating from another schema system
- You need to manually craft complex schemas that are difficult to express with decorators

### Converting Between LLM Formats

You can easily migrate between different LLM formats by extracting the JSON Schema and then converting it to another format:

```typescript
import { 
  openAIToolToJsonSchema,
  jsonSchemaToAnthropicTool,
  classToOpenAITool
} from 'schema-forge';

// First, create or get an OpenAI tool format
const openaiTool = classToOpenAITool(MyClass);
// Or you might already have an existing openAITool from another source

// Extract JSON Schema and metadata from OpenAI tool
const { schema, metadata } = openAIToolToJsonSchema(openaiTool);

// Convert to Anthropic Claude format
const anthropicTool = jsonSchemaToAnthropicTool(schema, metadata);

// Use with Anthropic
const message = await anthropic.messages.create({
  model: "claude-3-7-sonnet-20250219",
  messages: [...],
  tools: [anthropicTool],
});
```

This is especially useful for:
- Migrating from one LLM provider to another
- Testing the same tool definition across multiple LLMs
- Supporting multiple LLM providers with a single codebase

### Common Options Pattern

All schema generation functions accept a consistent options pattern, though some options are provider-specific:

```typescript
// For OpenAI (with structured output)
const openaiOptions = {
  propertyOverrides: {
    'property': { description: 'Override' }
  },
  forStructuredOutput: true  // OpenAI-specific, sets strict automatically
};

// For Gemini (no structured output flag needed)
const geminiOptions = {
  propertyOverrides: {
    'property': { description: 'Override' }
  }
  // No forStructuredOutput or strict needed for Gemini
};

// Use appropriate options for different LLM formats
const jsonSchema = classToJsonSchema(MyClass, openaiOptions);
const openaiTool = classToOpenAITool(MyClass, openaiOptions);
const responseApiTool = classToOpenAIResponseApiTool(MyClass, openaiOptions);
const anthropicTool = classToAnthropicTool(MyClass, { propertyOverrides: openaiOptions.propertyOverrides });
const geminiTool = classToGeminiTool(MyClass, geminiOptions);

// You can also use the JSON Schema directly with converter functions
const directOpenAITool = jsonSchemaToOpenAITool(
  jsonSchema, 
  { name: 'my_function', description: 'Function description' },
  { strict: true }
);
```

## API Reference

### Decorators

#### `@ToolMeta(options)`

Class decorator for adding metadata to a class. This decorator is required when using `classToOpenAITool`, `classToAnthropicTool`, or `classToGeminiTool`, but is optional when using just `classToJsonSchema`.

```typescript
options = {
  name?: string;       // Function name (optional but recommended)
  description?: string; // Function description (optional but recommended for most LLM providers)
}
```

#### `@ToolProp(options)`

Property decorator for defining schema properties.

```typescript
options = {
  description?: string;   // Property description (optional but recommended)
  type?: string;          // Property type ('string', 'number', etc.) - inferred if not provided
  enum?: any[] | object;  // Enum values - can be a TS enum or array of values
  items?: object;         // For array properties - required for arrays of primitives or custom types
  isOptional?: boolean;   // If true, property won't be in required array
  // ...other JSON Schema properties
}
```

**Note:** For arrays of primitive types (strings/numbers), you must explicitly set the items property:

```typescript
@ToolProp({
  description: 'List of tags',
  items: { type: 'string' }
})
tags: string[];
```

For enum arrays, you only need to set the enum property:

```typescript
@ToolProp({
  description: 'List of roles',
  enum: ['admin', 'user', 'guest']
})
roles: string[];
```

### Core Functions

- `classToJsonSchema(target, options?)`: Converts a class to JSON Schema
- `prepareForStructuredOutput(schema)`: Enhances a schema for LLM structured output

### LLM Format Functions

#### Class to LLM Format Converters

- `classToOpenAITool(target, options?)`: Generates OpenAI function calling format for Chat Completions API
- `classToOpenAIResponseApiTool(target, options?)`: Generates OpenAI tool format for Response API (note: `strict` parameter is required and defaults to `true`)
- `classToOpenAIResponseFormatJsonSchema(target, options?)`: Generates OpenAI response format for Chat Completions API
- `classToOpenAIResponseApiTextSchema(target, options?)`: Generates OpenAI text format for Response API
- `classToAnthropicTool(target, options?)`: Generates Anthropic Claude tool format
- `classToGeminiTool(target, options?)`: Generates Google Gemini tool format for new `@google/genai` API
- `classToGeminiResponseSchema(target, options?)`: Generates Gemini response schema for new `@google/genai` API
- `classToGeminiOldTool(target, options?)`: Generates Google Gemini tool format for legacy `@google/generative-ai` API
- `classToGeminiOldResponseSchema(target, options?)`: Generates Gemini response schema for legacy `@google/generative-ai` API

#### JSON Schema to LLM Format Converters

- `jsonSchemaToOpenAITool(schema, metadata, options?)`: Converts JSON Schema to OpenAI tool format for Chat Completions API
- `jsonSchemaToOpenAIResponseApiTool(schema, metadata, options)`: Converts JSON Schema to OpenAI tool format for Response API (note: `strict` parameter is required)
- `jsonSchemaToOpenAIResponseFormat(schema, metadata, options?)`: Converts JSON Schema to OpenAI response format for Chat Completions API
- `jsonSchemaToOpenAIResponseApiTextSchema(schema, metadata, options?)`: Converts JSON Schema to OpenAI text format for Response API
- `jsonSchemaToAnthropicTool(schema, metadata)`: Converts JSON Schema to Anthropic Claude tool format
- `jsonSchemaToGeminiTool(schema, metadata)`: Converts JSON Schema to Google Gemini tool format
- `jsonSchemaToGeminiResponseSchema(schema, metadata)`: Converts JSON Schema to Gemini response schema format

#### LLM Format to JSON Schema Converters

- `openAIToolToJsonSchema(openAITool)`: Extracts JSON Schema and metadata from an OpenAI Chat Completions API tool
- `openAIResponseApiToolToJsonSchema(openAITool)`: Extracts JSON Schema and metadata from an OpenAI Response API tool

### Schema Modification

- `updateSchemaProperty(target, propertyPath, updates)`: Updates a property in a schema
- `addSchemaProperty(target, propertyPath, options)`: Adds a new property to a schema

## License

ISC

## Structured Output & API Differences

### Structured Output in Different LLM Providers

Schema Forge supports structured output formats for various LLM providers, but each has different requirements and limitations:

#### OpenAI Structured Output

OpenAI supports two main methods for structured output:

1. **Response Format Method (Recommended)**
   - Uses `response_format` in Chat Completions API or `text.format` in Response API
   - Requires `additionalProperties: false` and all properties must be in `required` array
   - Requires schema enforcement (handled automatically)
   - Many JSON Schema features are not supported (minimum, maximum, minItems, etc.)
   - Example:
     ```typescript
     // Chat Completions API
     const responseFormat = classToOpenAIResponseFormatJsonSchema(MyClass, { 
       forStructuredOutput: true
       // strict is set automatically when forStructuredOutput is true
     });
     
     // Response API
     const textFormat = classToOpenAIResponseApiTextSchema(MyClass, {
       forStructuredOutput: true
       // strict is set automatically when forStructuredOutput is true
     });
     ```

2. **Function Calling Method**
   - Uses `tools` with schema enforcement (handled by schema-forge's forStructuredOutput) and `parallel_tool_calls: false` (that people need to specify in OpenAI top level request body)
   - Has the same JSON Schema limitations as above
   - Less recommended by OpenAI but still works for structured output
   - Example:
     ```typescript
     const tool = classToOpenAITool(MyClass, { forStructuredOutput: true });
     // Use with parallel_tool_calls: false
     ```

**Important**: Schema Forge's `prepareForStructuredOutput` utility is specifically designed for OpenAI's structured output requirements only. It adds `additionalProperties: false`, handles `required` fields, and removes unsupported schema properties. This function is not needed and should not be used for Gemini structured output, which has broader JSON Schema support.

**Current Limitation**: Schema Forge has these limitations for structured output:

1. **OpenAI Optional Properties**: Schema Forge doesn't yet automatically convert `isOptional: true` properties to the `"type": ["string", "null"]` format that OpenAI recommends for optional fields in structured output. This requires manual modification after schema generation for now.

2. **Gemini Nullable Properties**: For Gemini, optional properties should use the `nullable: true` property (instead of OpenAI's array type approach). This also requires manual modification after schema generation.

#### Google Gemini Structured Output

Gemini has simpler structured output requirements:

- Uses `responseMimeType: "application/json"` + `responseSchema`
- Doesn't require special handling of `required` fields or `additionalProperties`
- Supports more JSON Schema features than OpenAI (including `minimum`, `maximum`, etc.)
- Properties can be marked nullable with `nullable: true` property
- **IMPORTANT**: Unlike OpenAI, Gemini doesn't require `forStructuredOutput` flag or schema modifications
- Example:
  ```typescript
  // Gemini structured output - no forStructuredOutput needed
  const schema = classToGeminiResponseSchema(MyClass);
  
  // Use with Gemini API
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      responseMimeType: "application/json", // This enables structured output
      responseSchema: schema,
    },
  });
  ```

#### Google API Options

Google provides multiple API packages for working with Gemini models. Schema Forge supports all of them:

1. **New Google AI Studio API (Recommended)**: `@google/genai`
   - Latest API that supports both Google AI Studio and Vertex AI
   - Use `classToGeminiTool` and `classToGeminiResponseSchema`
   - Example: 
     ```typescript
     import { GoogleGenAI } from '@google/genai';
     const genAI = new GoogleGenAI(apiKey);
     const tool = classToGeminiTool(MyClass);
     ```

2. **Legacy Google AI Studio API**: `@google/generative-ai` 
   - Older API being phased out, use only if needed
   - Use `classToGeminiOldTool` and `classToGeminiOldResponseSchema`
   - Example:
     ```typescript
     import { GoogleGenerativeAI } from '@google/generative-ai';
     const genAI = new GoogleGenerativeAI(apiKey);
     const tool = classToGeminiOldTool(MyClass);
     ```

3. **Google Vertex AI**: `@google-cloud/vertexai`
   - Enterprise API for Google Cloud Platform
   - Requires GCP project and location settings
   - Uses the same formats as the new `@google/genai` library
   - Example:
     ```typescript
     import { VertexAI } from '@google-cloud/vertexai';
     const vertexAI = new VertexAI({project, location});
     // Same format which is supposed to works, but not verified yet. 
     const tool = classToGeminiTool(MyClass); 
     ```

#### Anthropic Claude

Claude doesn't have specific structured output support beyond tool calling.

### OpenAI Response API vs Chat Completions API

When using OpenAI's Response API, note that there are some key differences from the Chat Completions API:

- In Response API, the `strict` parameter is **required** for tool functions 
- Schema-forge uses `forStructuredOutput` to control the `strict` parameter - if `forStructuredOutput` is set, `strict` will be true; otherwise it defaults to true for the Response API (forge-schema sets it default as true, as Response API comment says it is default true but it is a TypeScript required property in API and no default value set)
- The structure of tool functions differs between APIs:
  - Chat Completions: `{ type: 'function', function: { name, description, parameters, strict? } }`
  - Response API: `{ type: 'function', name, description, parameters, strict }`

These differences are automatically handled by schema-forge's corresponding functions:

```typescript
// Chat Completions API - strict is optional
const chatTool = classToOpenAITool(MyClass, { strict: true });

// Response API - strict is required (defaults to true if not specified)
const responseTool = classToOpenAIResponseApiTool(MyClass);
```

## JSON Schema Support

Schema Forge is aligned with JSON Schema Draft 2020-12, but does not output the `$schema` field in generated schemas to maintain consistency with LLM API examples and to minimize payload size.

### Supported JSON Schema Properties

The `@ToolProp` decorator currently supports these JSON Schema properties:

```typescript
@ToolProp({
  description: string,       // Provides description for the property
  type: string,              // Explicit type (usually inferred)
  enum: string[] | number[], // Enumeration values
  items: object,             // For array properties
  isOptional: boolean,       // Controls if property is in required array
  // ...other basic JSON Schema properties
})
```

#### Current Limitations

Some JSON Schema properties are not yet directly supported through decorators, including:

- Array constraints: `minItems`, `maxItems`, `uniqueItems`
- String constraints: `minLength`, `maxLength`, `pattern`, `format`
- Number constraints: `minimum`, `maximum`, `multipleOf`
- Object constraints: `minProperties`, `maxProperties`

For these properties, you can either:
1. Use `updateSchemaProperty` to add them to schemas after generation
2. Use `classToJsonSchema` to get the basic schema and then manually enhance it

## Common Issues and Solutions

### Property has no initializer and is not definitely assigned

If you're using TypeScript with strict property initialization checks (`--strict` or `--strictPropertyInitialization`), you might encounter this kind of error:

```
Property 'sum' has no initializer and is not definitely assigned in the constructor.ts(2564)
```

**Solution**: Use the definite assignment assertion operator (`!:`) on your properties:

```typescript
class MathToolDto {
  @ToolProp()
  sum!: number; // Use the ! operator to tell TypeScript this will be assigned
}
```

### Optional Properties

For optional properties, use both the `isOptional` decorator option and TypeScript's optional property syntax:

```typescript
class UserData {
  @ToolProp()
  name!: string; // Required property with definite assignment
  
  @ToolProp({ isOptional: true })
  age?: number; // Optional property using both ? syntax and isOptional
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
