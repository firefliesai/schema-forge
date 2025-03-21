# Schema Forge

[![npm version](https://img.shields.io/npm/v/schema-forge.svg)](https://www.npmjs.com/package/schema-forge)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Schema Forge is a powerful TypeScript library that transforms your TypeScript classes into JSON Schema definitions, with special support for LLM (Large Language Model) function calling formats including OpenAI, Anthropic Claude, and Google Gemini. It also provides direct converters to transform your existing JSON Schemas into LLM-compatible formats without requiring TypeScript classes.

## Features

- 🔄 Convert TypeScript classes to JSON Schema with a simple decorator API
- 🤖 Generate LLM-compatible function definitions for different AI platforms
- 🔨 Direct JSON Schema to LLM format converters (use your own JSON Schema without TypeScript classes)
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
  model: "gpt-4-turbo",
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
  model: "gpt-4o",
  input: "What's the user information?",
  tools: [responseApiTool]
});
```

This approach is particularly useful when:
- You have existing JSON Schemas that you want to use with LLMs
- You're migrating from another schema system
- You need to manually craft complex schemas that are difficult to express with decorators

### Common Options Pattern

All schema generation functions accept a consistent options pattern:

```typescript
const options = {
  propertyOverrides: {
    'property': { description: 'Override' }
  },
  forStructuredOutput: true
};

// Use the same options across different LLM formats
const jsonSchema = classToJsonSchema(MyClass, options);
const openaiTool = classToOpenAITool(MyClass, { ...options, strict: true });
const responseApiTool = classToOpenAIResponseApiTool(MyClass, { ...options, strict: true });
const anthropicTool = classToAnthropicTool(MyClass, options);
const geminiTool = classToGeminiTool(MyClass, options);

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
- `classToGeminiTool(target, options?)`: Generates Google Gemini tool format
- `classToGeminiResponseSchema(target, options?)`: Generates Gemini response schema

#### JSON Schema to LLM Format Converters

- `jsonSchemaToOpenAITool(schema, metadata, options?)`: Converts JSON Schema to OpenAI tool format for Chat Completions API
- `jsonSchemaToOpenAIResponseApiTool(schema, metadata, options)`: Converts JSON Schema to OpenAI tool format for Response API (note: `strict` parameter is required)
- `jsonSchemaToOpenAIResponseFormat(schema, metadata, options?)`: Converts JSON Schema to OpenAI response format for Chat Completions API
- `jsonSchemaToOpenAIResponseApiTextSchema(schema, metadata, options?)`: Converts JSON Schema to OpenAI text format for Response API
- `jsonSchemaToAnthropicTool(schema, metadata)`: Converts JSON Schema to Anthropic Claude tool format
- `jsonSchemaToGeminiTool(schema, metadata)`: Converts JSON Schema to Google Gemini tool format
- `jsonSchemaToGeminiResponseSchema(schema, metadata)`: Converts JSON Schema to Gemini response schema format

### Schema Modification

- `updateSchemaProperty(target, propertyPath, updates)`: Updates a property in a schema
- `addSchemaProperty(target, propertyPath, options)`: Adds a new property to a schema

## License

ISC

## OpenAI API Differences

### Response API vs Chat Completions API

When using OpenAI's Response API, note that there are some key differences from the Chat Completions API:

- In Response API, the `strict` parameter is **required** for tool functions and defaults to `true`, whereas in Chat Completions API it's optional
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
