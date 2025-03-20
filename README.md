# Schema Forge

[![npm version](https://img.shields.io/npm/v/schema-forge.svg)](https://www.npmjs.com/package/schema-forge)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Schema Forge is a powerful TypeScript library that transforms your TypeScript classes into JSON Schema definitions, with special support for LLM (Large Language Model) function calling formats including OpenAI, Anthropic Claude, and Google Gemini.

## Features

- 🔄 Convert TypeScript classes to JSON Schema with a simple decorator API
- 🤖 Generate LLM-compatible function definitions for different AI platforms
- 🔧 Customize schemas with property overrides and metadata
- 🧩 Support for nested objects and complex property paths
- 📝 Built-in structured output formatting for various LLM providers
- 📦 TypeScript-first with full type safety and inference
- 🪶 Lightweight with minimal dependencies (only requires reflect-metadata)

## Installation

```bash
npm install schema-forge
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
  model: "gpt-4-turbo",
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
  model: "gpt-4-turbo",
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
const tool = classToOpenAITool(UserInput);

// Use it with the Response API
const response = await openai.responses.create({
  model: "gpt-4o",
  input: "Create a user with name John Doe",
  tools: [tool]
});
```

#### Anthropic Claude

```typescript
import { classToAnthropicTool } from 'schema-forge';

// Create an Anthropic tool definition
const claudeTool = classToAnthropicTool(UserInput);

// Use with Anthropic API
const message = await anthropic.messages.create({
  model: "claude-3-opus-20240229",
  max_tokens: 1000,
  messages: [...messages],
  tools: [claudeTool],
});
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

// Create a response format for OpenAI structured output
const responseFormat = classToOpenAIResponseFormatJsonSchema(UserOutput, {
  forStructuredOutput: true,
  strict: true
});

// Use with OpenAI
const result = await openai.chat.completions.create({
  model: "gpt-4-turbo",
  messages: [...messages],
  response_format: responseFormat,
});
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
const geminiTool = classToGeminiTool(MyClass, options);
```

## API Reference

**Note:** Currently, Schema Forge fully supports OpenAI's tools functionality in both Chat Completions and the new Response API. Support for the Response API's `text.format: "json_schema"` option will be added in a future update.

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

- `classToOpenAITool(target, options?)`: Generates OpenAI function calling format
- `classToAnthropicTool(target, options?)`: Generates Anthropic Claude tool format
- `classToGeminiTool(target, options?)`: Generates Google Gemini tool format
- `classToOpenAIResponseFormatJsonSchema(target, options?)`: Generates OpenAI response format
- `classToGeminiResponseSchema(target, options?)`: Generates Gemini response schema

### Schema Modification

- `updateSchemaProperty(target, propertyPath, updates)`: Updates a property in a schema
- `addSchemaProperty(target, propertyPath, options)`: Adds a new property to a schema

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
