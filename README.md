# Schema Forge

[![npm version](https://img.shields.io/npm/v/@firefliesai/schema-forge.svg)](https://www.npmjs.com/package/@firefliesai/schema-forge)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/license/Apache-2.0)

Schema Forge turns a TypeScript class into a [JSON Schema](https://json-schema.org/understanding-json-schema/reference). You mark the class's properties with decorators. Schema Forge then gives you either the plain JSON Schema, or a ready-made tool definition for the OpenAI, Anthropic (Claude) or Google Gemini APIs. A large language model (LLM) reads that tool definition to know which arguments it may send.

The same class can also be the TypeScript type of those arguments, so the schema and the type cannot drift apart.

```typescript
import 'reflect-metadata';
import {
  ToolMeta,
  ToolProp,
  classToOpenAITool,
} from '@firefliesai/schema-forge';

@ToolMeta({
  name: 'get_weather',
  description: 'Get the current weather for a city',
})
class GetWeatherInput {
  @ToolProp({ description: 'City name, for example "Paris"' })
  city!: string;

  @ToolProp({
    description: 'Temperature unit',
    enum: ['celsius', 'fahrenheit'],
    isOptional: true,
  })
  unit?: string;
}

const tool = classToOpenAITool(GetWeatherInput);
// {
//   type: 'function',
//   function: {
//     name: 'get_weather',
//     description: 'Get the current weather for a city',
//     parameters: {
//       type: 'object',
//       properties: {
//         city: {
//           description: 'City name, for example "Paris"',
//           type: 'string'
//         },
//         unit: {
//           description: 'Temperature unit',
//           enum: ['celsius', 'fahrenheit'],
//           type: 'string'
//         }
//       },
//       required: ['city']
//     }
//   }
// }
```

Pass `tool` in the `tools` list of an OpenAI request. When the model calls it, its arguments have the shape of `GetWeatherInput`.

## Contents

1. [What Schema Forge does](#1-what-schema-forge-does) (diagram 1: from a class to an LLM tool)
2. [Install and set up](#2-install-and-set-up)
3. [Quick start](#3-quick-start)
4. [Describing properties with `@ToolProp`](#4-describing-properties-with-toolprop)
5. [Rules from class-validator](#5-rules-from-class-validator) (diagram 2: which source wins)
6. [Schema options](#6-schema-options)
7. [LLM provider formats](#7-llm-provider-formats)
8. [Errors and warnings](#8-errors-and-warnings)
9. [Migrating from 2.x](#9-migrating-from-2x)
10. [How it works inside](#10-how-it-works-inside) (diagram 3: what happens when)
11. [Limitations](#11-limitations)
12. [API reference](#12-api-reference)
13. [Troubleshooting](#13-troubleshooting)

## 1. What Schema Forge does

**Terms used in this README:**

| Term | Meaning |
| --- | --- |
| Tool (also called function calling) | A function your application offers to an LLM. You send the LLM its name, a description and a JSON Schema of its arguments; the LLM answers with a call that has those arguments, and your code runs it. |
| Structured output | Asking the LLM to answer with JSON that matches a JSON Schema, instead of free text. |
| Strict mode | A provider setting that makes the LLM's output follow the schema exactly. It accepts only part of JSON Schema and adds its own rules (see [OpenAI strict mode](#71-openai)). |
| Decorator | A TypeScript annotation such as `@ToolProp()` written above a class or property. See [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html). |
| Design type | The type TypeScript records for a property when `emitDecoratorMetadata` is on: `String`, `Number`, `Boolean`, `Date`, `Array`, a class, or `Object` when the type is something else (a union, an interface, …). |
| class-validator | A separate library whose decorators (`@IsEmail()`, `@MaxLength(100)`, …) validate class instances. Schema Forge only reads these decorators to add rules to the schema; it never runs validation. |

**Diagram 1: from a class to an LLM tool.** Steps ① and ② happen when the class is defined. Steps ③ and ④ happen when you call a Schema Forge function.

```text
 ① your class                      ② stored on the class
┌───────────────────────────┐     ┌────────────────────────┐
│ @ToolMeta (name, desc.)   │     │ Schema Forge metadata  │
│ @ToolProp on properties   │ ──> │ (what you wrote, plus  │
│ class-validator (optional)│     │ the design types)      │
└───────────────────────────┘     └───────────┬────────────┘
                                              │
                                              v
 ④ classTo<Provider>…()            ③ classToJsonSchema()
┌───────────────────────────┐     ┌────────────────────────┐
│ tool or response format   │     │ JSON Schema            │
│ for OpenAI, Anthropic or  │ <── │ (checked; rules from   │
│ Gemini                    │     │ class-validator added) │
└───────────────────────────┘     └────────────────────────┘
```

| Step | What happens |
| --- | --- |
| ① Define the class | You add `@ToolMeta` to the class and `@ToolProp` to each property that belongs in the schema. |
| ② Decorators run | `@ToolProp` records your options and the property's design type. It never throws. |
| ③ Generate the schema | `classToJsonSchema` builds the schema, adds rules from class-validator, and throws if the schema would not describe the class (see [Errors](#8-errors-and-warnings)). |
| ④ Format for a provider | A `classTo…` function wraps the schema in the shape one provider's API expects, and adapts it to what that provider accepts. |

**When to use it:** you already describe data with classes and decorators (for example NestJS data transfer objects, also called DTOs), you want one class to be both the schema and the TypeScript type, or you send the same tool to several LLM providers.

**When something else may fit better:** you prefer building schemas with functions instead of classes ([Zod](https://github.com/colinhacks/zod) or [TypeBox](https://github.com/sinclairzx81/typebox)), your code base does not use decorators, or property names are only known at run time.

## 2. Install and set up

```bash
npm install @firefliesai/schema-forge reflect-metadata
```

| Package | Needed? | Version | Why |
| --- | --- | --- | --- |
| [`reflect-metadata`](https://github.com/microsoft/reflect-metadata) | Yes (peer dependency) | `^0.1.14` or `^0.2.0` | Stores what the decorators record. |
| [`class-validator`](https://github.com/typestack/class-validator) | Optional (peer dependency) | `^0.14.0` or `^0.15.0` | Only if you want its rules in the schema ([section 5](#5-rules-from-class-validator)). |

Some package managers do not install peer dependencies on their own; the command above installs `reflect-metadata` explicitly for that reason.

**Install a single copy of Schema Forge.** Each installed copy keeps its own metadata, so a property declared through one copy is invisible to another. If a library you use depends on a different version of `@firefliesai/schema-forge`, deduplicate it or force one version (npm `overrides`, pnpm `overrides`, yarn `resolutions`). Schema Forge detects the other copy and throws instead of leaving properties out ([section 8](#8-errors-and-warnings)).

**TypeScript settings.** Turn on both options in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

[`experimentalDecorators`](https://www.typescriptlang.org/tsconfig/#experimentalDecorators) enables the decorator syntax Schema Forge uses. [`emitDecoratorMetadata`](https://www.typescriptlang.org/tsconfig/#emitDecoratorMetadata) makes TypeScript record each property's design type, which Schema Forge reads.

**Load `reflect-metadata` first.** Import it once, at the start of your program, before any class with decorators is loaded:

```typescript
import 'reflect-metadata';
```

The examples in this README use `name!: string`. The `!` tells TypeScript that the property is assigned elsewhere; it is needed when [`strictPropertyInitialization`](https://www.typescriptlang.org/tsconfig/#strictPropertyInitialization) is on.

## 3. Quick start

### 3.1 Define a class

```typescript
import 'reflect-metadata';
import { ToolMeta, ToolProp } from '@firefliesai/schema-forge';

@ToolMeta({ name: 'create_user', description: 'Create a user account' })
class CreateUserInput {
  @ToolProp({ description: 'Full name' })
  name!: string;

  @ToolProp({ description: 'Email address', format: 'email' })
  email!: string;

  @ToolProp({ description: 'Age in years', isOptional: true })
  age?: number;

  @ToolProp({
    description: 'Role of the user',
    enum: ['admin', 'member', 'guest'],
  })
  role!: string;
}
```

- `@ToolMeta` gives the tool its name and description. The provider formats need it; plain JSON Schema does not.
- `@ToolProp` puts a property in the schema. A property without `@ToolProp` is left out.
- The type (`string`, `number`) comes from TypeScript. `isOptional: true` leaves the property out of `required`.

### 3.2 Get the JSON Schema

```typescript
import { classToJsonSchema } from '@firefliesai/schema-forge';

const schema = classToJsonSchema(CreateUserInput);
// {
//   type: 'object',
//   properties: {
//     name: { description: 'Full name', type: 'string' },
//     email: { description: 'Email address', format: 'email', type: 'string' },
//     age: { description: 'Age in years', type: 'number' },
//     role: {
//       description: 'Role of the user',
//       enum: ['admin', 'member', 'guest'],
//       type: 'string'
//     }
//   },
//   required: ['name', 'email', 'role']
// }
```

### 3.3 Get a tool for an LLM provider

Each provider's API expects a slightly different shape. Pick the function for the SDK you use:

| You call | With | Schema Forge function | Put the result in |
| --- | --- | --- | --- |
| OpenAI Chat Completions API | `openai` | `classToOpenAITool` | `tools: [tool]` |
| OpenAI Responses API | `openai` | `classToOpenAIResponseApiTool` | `tools: [tool]` |
| Anthropic Messages API | `@anthropic-ai/sdk` | `classToAnthropicTool` | `tools: [tool]` |
| Gemini API | [`@google/genai`](https://github.com/googleapis/js-genai) | `classToGeminiTool` | `config.tools: [{ functionDeclarations: [tool] }]` |
| Gemini API, legacy SDK | [`@google/generative-ai`](https://github.com/google-gemini/deprecated-generative-ai-js) (deprecated by Google) | `classToGeminiOldTool` | `tools: [{ functionDeclarations: [tool] }]` |
| Vertex AI | `@google-cloud/vertexai` | `classToGeminiVertexTool` | `tools: [{ functionDeclarations: [tool] }]` |

The model names below are examples; use a current one.

```typescript
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import {
  classToAnthropicTool,
  classToGeminiTool,
  classToOpenAIResponseApiTool,
  classToOpenAITool,
} from '@firefliesai/schema-forge';

const prompt = 'Create a user named Ada Lovelace, ada@example.com, role admin';

// OpenAI, Chat Completions API
const openai = new OpenAI();
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  tools: [classToOpenAITool(CreateUserInput)],
});
const call = completion.choices[0].message.tool_calls?.[0];
if (call?.type === 'function') {
  const input: CreateUserInput = JSON.parse(call.function.arguments);
}

// OpenAI, Responses API
const response = await openai.responses.create({
  model: 'gpt-4o-mini',
  input: prompt,
  tools: [classToOpenAIResponseApiTool(CreateUserInput)],
});
const item = response.output[0];
if (item.type === 'function_call') {
  const input: CreateUserInput = JSON.parse(item.arguments);
}

// Anthropic
const anthropic = new Anthropic();
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1000,
  messages: [{ role: 'user', content: prompt }],
  tools: [classToAnthropicTool(CreateUserInput)],
});
const toolUse = message.content.find((block) => block.type === 'tool_use');
if (toolUse?.type === 'tool_use') {
  const input = toolUse.input as CreateUserInput;
}

// Gemini, @google/genai
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const result = await gemini.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: prompt,
  config: {
    tools: [{ functionDeclarations: [classToGeminiTool(CreateUserInput)] }],
  },
});
const input = result.functionCalls?.[0]?.args as unknown as
  | CreateUserInput
  | undefined;
```

The type annotation on `input` is a promise about the shape, not a check. In strict mode the provider guarantees that the arguments match the schema; otherwise it usually follows it. Your code should still validate what it runs (for example with class-validator).

## 4. Describing properties with `@ToolProp`

### 4.1 What TypeScript tells Schema Forge, and what you must add

Schema Forge reads each property's design type. For some TypeScript types that is enough; for others the design type does not say what the value is, and you must add an option.

| TypeScript property | Design type | Schema without extra options | What to add |
| --- | --- | --- | --- |
| `name!: string` | `String` | `{ type: 'string' }` | nothing |
| `count!: number` | `Number` | `{ type: 'number' }` | `type: 'integer'` (or `@IsInt()`) for whole numbers |
| `active!: boolean` | `Boolean` | `{ type: 'boolean' }` | nothing |
| `createdAt!: Date` | `Date` | `{ type: 'string', format: 'date-time' }` | nothing |
| `address!: Address` (a class with `@ToolProp` properties) | the class | a nested object with `Address`'s properties | nothing |
| `role!: Role` (a TypeScript enum) | `String` or `Number` | `{ type: 'string' }` or `{ type: 'number' }`, without the allowed values | `enum: Role` |
| `tags!: string[]` | `Array` | error: an array needs an item type | `items: { type: 'string' }` |
| `addresses!: Address[]` | `Array` | error: an array needs an item type | `items: { type: Address }` |
| `note?: string \| null` | `Object` | error: cannot determine the type | `type: 'string', nullable: true` |
| `id!: string \| number` | `Object` | error: cannot determine the type | `anyOf: [{ type: 'string' }, { type: 'number' }]` |
| `meta!: Record<string, string>` | `Object` | error: cannot determine the type | `type: 'object'` |

`Object` is what TypeScript records for a union, a nullable type under [`strictNullChecks`](https://www.typescriptlang.org/tsconfig/#strictNullChecks), an interface, a generic, `any` and `unknown`. Schema Forge does not guess a type for it; it throws when the schema is generated ([section 8](#8-errors-and-warnings)). A class-validator type decorator such as `@IsString()` can also supply the type ([section 5](#5-rules-from-class-validator)).

### 4.2 Arrays, enums and nested classes

```typescript
enum Role {
  Admin = 'admin',
  Member = 'member',
}

class Address {
  @ToolProp({ description: 'City name' })
  city!: string;
}

class Team {
  @ToolProp({ description: 'Tags', items: { type: 'string' } })
  tags!: string[];

  @ToolProp({ description: 'Main role', enum: Role })
  role!: Role;

  @ToolProp({ description: 'Roles of the team', enum: Role })
  roles!: Role[];

  @ToolProp({ description: 'Office address' })
  office!: Address;

  @ToolProp({ description: 'Other offices', items: { type: Address } })
  branches!: Address[];
}

classToJsonSchema(Team).properties;
// {
//   tags: { description: 'Tags', items: { type: 'string' }, type: 'array' },
//   role: {
//     description: 'Main role',
//     enum: ['admin', 'member'],
//     type: 'string'
//   },
//   roles: {
//     description: 'Roles of the team',
//     type: 'array',
//     items: { type: 'string', enum: ['admin', 'member'] }
//   },
//   office: {
//     description: 'Office address',
//     type: 'object',
//     properties: { city: {…} },
//     required: ['city']
//   },
//   branches: {
//     description: 'Other offices',
//     type: 'array',
//     items: {
//       type: 'object',
//       properties: { city: {…} },
//       required: ['city']
//     }
//   }
// }
```

- `enum` takes a TypeScript enum or an array of values. On an array property it describes the items.
- The type of an enum comes from its values: all strings give `string`, all numbers `number`, all booleans `boolean`, a mix gives a list such as `['string', 'number']`.
- A class used as a property type is expanded into a nested object. A class cannot contain itself, directly or through another class ([section 11](#11-limitations)).

### 4.3 Optional and nullable

`isOptional` and `nullable` answer two different questions:

| Option | Question it answers | Effect on the schema |
| --- | --- | --- |
| `isOptional: true` | May the caller leave the property out? | The property is not listed in `required`. `null` is still rejected. |
| `nullable: true` | May the value be `null`? | `null` becomes an allowed value: `type: 'string'` becomes `type: ['string', 'null']`, and an `enum` gains `null`. |

Use both for a property that may be missing or `null`:

```typescript
class UpdateProfileInput {
  @ToolProp({
    description: 'New nickname, or null to remove it',
    type: 'string',
    nullable: true,
    isOptional: true,
  })
  nickname?: string | null;
}

classToJsonSchema(UpdateProfileInput);
// {
//   type: 'object',
//   properties: {
//     nickname: { description: '…', type: ['string', 'null'] }
//   }
// }
// (no `required` list: the only property is optional)
```

With `anyOf` or `oneOf`, `nullable` adds a `{ type: 'null' }` branch. With `const`, `allOf`, or a composition next to a `type`, the whole property becomes `anyOf: [<property>, { type: 'null' }]`.

### 4.4 All `@ToolProp` options

| Option | Type | Meaning |
| --- | --- | --- |
| `description` | `string` | Text the LLM reads to understand the property. Recommended on every property. |
| `type` | `'string' \| 'number' \| 'integer' \| 'boolean' \| 'array' \| 'object'` | The JSON Schema type, when the design type is not enough. |
| `enum` | TypeScript enum or array of values | The allowed values. |
| `items` | `{ type: 'string' \| 'number' \| 'integer' \| 'boolean' \| 'object' \| SomeClass, …constraints }` | The item schema of an array. |
| `isOptional` | `boolean` | Leaves the property out of `required`. |
| `nullable` | `boolean` | Allows `null` ([4.3](#43-optional-and-nullable)). |
| `format`, `pattern`, `minLength`, `maxLength` | | String rules, as in [JSON Schema](https://json-schema.org/understanding-json-schema/reference/string). |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | | Number rules, as in [JSON Schema](https://json-schema.org/understanding-json-schema/reference/numeric). |
| `minItems`, `maxItems`, `uniqueItems` | | Array rules, as in [JSON Schema](https://json-schema.org/understanding-json-schema/reference/array). |
| `anyOf`, `oneOf`, `allOf`, `const` | | Combinations and fixed values, copied to the schema as given. No `type` is added next to them. |
| `title`, `default`, `examples`, `deprecated` | | Annotations, copied to the schema as given. |

The output uses [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) keywords. It has no `$schema` field, because the LLM APIs do not need one.

`@ToolMeta({ name, description })` takes the tool's name and description. The provider formats read it; without it, the tool's name is an empty string.

## 5. Rules from class-validator

If your class also uses [class-validator](https://github.com/typestack/class-validator) decorators, Schema Forge adds their rules to the schema. You write a rule once, and both the validator and the LLM see it.

Schema Forge only reads class-validator's decorators to add rules to the JSON Schema; it never runs validation. To validate values, call class-validator's `validate()` yourself, or validate the arguments against the generated JSON Schema.

```typescript
import { IsEmail, IsInt, IsPositive, Max, MaxLength } from 'class-validator';

class CreateOrderInput {
  @ToolProp({ description: 'Customer email' })
  @IsEmail()
  email!: string;

  @ToolProp({ description: 'Number of items' })
  @IsInt()
  @IsPositive()
  @Max(100)
  quantity!: number;

  @ToolProp({ description: 'Note for the courier', isOptional: true })
  @MaxLength(200)
  note?: string;
}

classToJsonSchema(CreateOrderInput).properties;
// {
//   email: {
//     description: 'Customer email',
//     type: 'string',
//     format: 'email'
//   },
//   quantity: {
//     description: 'Number of items',
//     type: 'integer',
//     maximum: 100,
//     exclusiveMinimum: 0
//   },
//   note: {
//     description: 'Note for the courier',
//     type: 'string',
//     maxLength: 200
//   }
// }
```

The decorators may be written in any order; Schema Forge reads them when the schema is generated.

### 5.1 Which source wins

**Diagram 2: where each part of a property's schema comes from.** When two sources disagree, the higher one wins, and Schema Forge prints a warning about the conflict.

```text
  highest  1. explicit options  @ToolProp({ … }), updateSchemaProperty(),
                                propertyOverrides
           2. class-validator   @IsInt(), @MaxLength(200), @IsEmail(), …
  lowest   3. design type       what TypeScript recorded (String, Number, …)
```

For example, `@ToolProp({ type: 'number' })` with `@IsInt()` keeps `number` and warns. Without the explicit `type`, the property becomes `integer`.

### 5.2 Only `@ToolProp` adds a property

class-validator only adds rules to properties that have `@ToolProp`. A property with class-validator decorators but no `@ToolProp` is not in the schema. This lets one class be an API DTO and a tool input with different fields, for example an `ownerId` that your API sets but the LLM must not.

Two related checks:

- A class whose properties all lack `@ToolProp`, while some have class-validator decorators, throws: its schema would be empty. This usually means the class was copied with `PickType`, `OmitType` or `PartialType` (from NestJS), which keep class-validator's metadata but not Schema Forge's.
- To check in a test that a class exposes every validated property, use `findUndeclaredValidatedProperties`:

```typescript
import { findUndeclaredValidatedProperties } from '@firefliesai/schema-forge';

expect(findUndeclaredValidatedProperties(CreateOrderInput)).toEqual([]);
// If a property were validated but not declared, the list would name it,
// for example:
// [
//   {
//     path: 'shipping.ownerId',
//     className: 'ShippingInput',
//     property: 'ownerId'
//   }
// ]
```

### 5.3 Translated decorators

A decorator with `{ each: true }` applies its rule to the items of an array. When those item rules give no type of their own, the item type is the one they accept: the numeric rules (`@Min`, `@Max`, `@IsPositive`, `@IsNegative`, `@IsDivisibleBy`) accept only numbers, so the items are `number`; the string rules (`@MinLength`, `@MaxLength`, `@Length`, `@Matches`, `@IsEmail`, `@IsUrl`, `@IsUUID`) accept only strings, so the items are `string`. Rules of both kinds on the same items give no type.

| class-validator decorator | JSON Schema |
| --- | --- |
| `@IsString()`, `@IsNumber()`, `@IsInt()`, `@IsBoolean()`, `@IsObject()` | `type: 'string'`, `'number'`, `'integer'`, `'boolean'`, `'object'` |
| `@IsArray()` | `type: 'array'` |
| `@ArrayMinSize(n)`, `@ArrayMaxSize(n)` | `minItems: n`, `maxItems: n` |
| `@ArrayNotEmpty()` | `minItems: 1` |
| `@ArrayUnique()` | `uniqueItems: true` |
| `@ArrayContains([...])` | `items.enum` (primitive values only) |
| `@Min(n)`, `@Max(n)` | `minimum: n`, `maximum: n` |
| `@IsPositive()`, `@IsNegative()` | `exclusiveMinimum: 0`, `exclusiveMaximum: 0` |
| `@IsDivisibleBy(n)` | `multipleOf` with the absolute value of `n` (not for `n = 0`) |
| `@MinLength(n)`, `@MaxLength(n)`, `@Length(min, max)` | `minLength`, `maxLength` |
| `@IsNotEmpty()` | `minLength: 1` on a string (or on string items with `{ each: true }`) |
| `@IsEmail()`, `@IsUrl()`, `@IsUUID()` | `format: 'email'`, `'uri'`, `'uuid'` |
| `@Matches(regex)` | `pattern`, if the regex has no flags other than `u` |
| `@IsEnum(E)`, `@IsIn([...])` | `enum` |

When several decorators set the same limit (for example `@Length(2, 10)` and `@MinLength(5)`), the strictest value is used. This includes `@IsNotEmpty()`: with `@MinLength(0)` the result is `minLength: 1`.

`@IsOptional()`, `@ValidateIf()`, `@ValidateNested()`, `@IsDefined()`, `@Allow()`, `@IsDate()` and `@IsNotEmptyObject()` add nothing to the schema and print no warning. `@IsOptional()` does not make a property optional; use `isOptional: true`.

### 5.4 Rules the schema cannot express

Some rules have no JSON Schema keyword: `@IsTimeZone()`, `@IsISO8601()`, `@IsDateString()`, `@Matches(/x/i)` (a regex with flags) and your own validators. They are not in the schema, so the LLM does not see them. Schema Forge prints one warning per rule (`console.warn`, starting with `[schema-forge]`). Describe the rule yourself with `format`, `pattern` or `description`. An explicit `format`, `pattern` or `enum` on the property also turns that warning off.

## 6. Schema options

`classToJsonSchema(Class, options)` and every `classTo…` function accept these options:

| Option | Default | Effect |
| --- | --- | --- |
| `additionalProperties: false` | not set | Adds `additionalProperties: false` to every object that declares properties: the root, nested classes, array items and `anyOf` / `oneOf` / `allOf` branches. Strict modes need it. An object without declared properties (a `Record`) stays open, because closing it would accept only `{}`. |
| `forStructuredOutput: true` | `false` | Applies the OpenAI strict-mode schema changes ([7.1](#71-openai)). The OpenAI functions also set `strict: true`; `classToJsonSchema` and `classToAnthropicTool` only change the schema. The Gemini functions do not take this option. |
| `propertyOverrides` | none | Changes properties for this call only, by path: `{ 'name': { description: '…' }, 'address.city': { … } }`. An override that describes a property holding a class as something else (another `type`, an `enum`, a `const`, a composition, or `items` that are not a class) replaces the class, whose schema is then not built. A property that allows `null` keeps allowing it unless the override sets `nullable: false`. |

To change a class's schema for every later call, use `updateSchemaProperty` and `addSchemaProperty`. Paths may go into nested classes:

```typescript
import {
  addSchemaProperty,
  updateSchemaProperty,
} from '@firefliesai/schema-forge';

class Shipment {
  @ToolProp({ description: 'Destination' })
  destination!: Address;
}

updateSchemaProperty(Shipment, 'destination.city', {
  description: 'Destination city',
});
addSchemaProperty(Shipment, 'destination.zip', {
  type: 'string',
  isOptional: true,
});
// Every later classToJsonSchema(Shipment) has destination.city's new
// description and destination.zip. Address's own schema is not changed.
```

## 7. LLM provider formats

Each `classTo…` function calls `classToJsonSchema` and then changes the result to fit one provider. The `jsonSchemaTo…` functions do the same for a JSON Schema you already have ([7.4](#74-existing-json-schemas-and-converting-between-formats)).

### 7.1 OpenAI

OpenAI has two APIs and two uses of a schema:

| Purpose | Chat Completions API | Responses API |
| --- | --- | --- |
| Tool | `classToOpenAITool` | `classToOpenAIResponseApiTool` |
| Structured output | `classToOpenAIResponseFormatJsonSchema` (for `response_format`) | `classToOpenAIResponseApiTextSchema` (for `text.format`) |

See OpenAI's [function calling](https://developers.openai.com/api/docs/guides/function-calling) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) guides, and [migrating to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses).

**Strict mode.** OpenAI's strict mode requires `additionalProperties: false` on every object and every property in `required`; an optional property is written as a type that allows `null` (see [Supported schemas](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)). `forStructuredOutput: true` does this for you:

| `forStructuredOutput: true` changes | Example |
| --- | --- |
| Sets `strict: true` on the tool or format | |
| Adds `additionalProperties: false` to every object that declares properties | |
| Lists every property in `required` | |
| Makes each optional property nullable | `age?: number` becomes `type: ['number', 'null']` |
| Removes these keywords: `minLength`, `maxLength`, `pattern`, `format` (strings); `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` (numbers); `minItems`, `maxItems`, `uniqueItems` (arrays) | |

The keyword removal is older than OpenAI's current rules, which accept several of these keywords; it is kept for compatibility.

```typescript
import {
  classToOpenAIResponseFormatJsonSchema,
} from '@firefliesai/schema-forge';

const tool = classToOpenAITool(CreateUserInput, {
  forStructuredOutput: true,
});
const format = classToOpenAIResponseFormatJsonSchema(CreateUserInput, {
  forStructuredOutput: true,
});
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  response_format: format,
});
const user: CreateUserInput = JSON.parse(
  completion.choices[0].message.content ?? '{}',
);
```

**The Responses API tool is strict by default.** `classToOpenAIResponseApiTool` always closes the objects that declare properties, lists every property in `required` and removes the keywords above. `strict: true` and the nullable step are on by default; `forStructuredOutput: false` sets `strict: false` and skips the nullable step, so optional properties are then required, and only properties declared `nullable` accept `null`.

### 7.2 Anthropic

`classToAnthropicTool` returns `{ name, description, input_schema }`. With `additionalProperties: false`, the root `input_schema` is closed too. Anthropic's [strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) is a separate `strict: true` flag that Schema Forge does not set. See [defining tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).

### 7.3 Gemini

| SDK | Tool | Structured output (`responseSchema`) |
| --- | --- | --- |
| [`@google/genai`](https://github.com/googleapis/js-genai) (current) | `classToGeminiTool` | `classToGeminiResponseSchema` |
| [`@google/generative-ai`](https://github.com/google-gemini/deprecated-generative-ai-js) (deprecated by Google) | `classToGeminiOldTool` | `classToGeminiOldResponseSchema` |
| `@google-cloud/vertexai` | `classToGeminiVertexTool` | `classToGeminiVertexResponseSchema` |

The Vertex AI functions are implemented but not tested against the real API.

Gemini accepts only part of JSON Schema in these fields (see its [function calling guide](https://aistudio.google.com/docs/function-calling), and the fields of its `Schema` type in the [API reference](https://aistudio.google.com/api-reference/caching), listed under `CachedContent` → `tools` → `functionDeclarations` → `parameters`). It rejects the whole request with a 400 (`Unknown name "uniqueItems" … Cannot find field`) when a schema has any field its `Schema` type does not have. The Gemini functions change the schema to fit, as checked against the live API in November 2026:

| JSON Schema from Schema Forge | Sent to Gemini |
| --- | --- |
| `type: ['string', 'null']` or a `{ type: 'null' }` branch | `type: 'string', nullable: true` |
| `type: ['string', 'number']` (several types) | `anyOf` with one branch per type (an `anyOf` already there keeps its branches, narrowed to those types) |
| `additionalProperties` | removed |
| `exclusiveMinimum` / `exclusiveMaximum` | `minimum` / `maximum` on an integer (`exclusiveMinimum: 0` becomes `minimum: 1`); otherwise added to the description |
| a string `const` | a one-value `enum` |
| an `enum` whose values are not all non-empty strings | added to the description (the `type` stays) |
| any other field Gemini does not have, such as `multipleOf` (from `@IsDivisibleBy`), `uniqueItems`, `examples`, `deprecated`, `readOnly`, `contains`, `patternProperties`, `propertyNames`, or a `const` that is not a string | added to the description |

"Added to the description" means the keyword and its value are appended to the property's description as `{keyword: value}`, so the model still reads the rule. `oneOf`, `allOf` and `not` are sent as they are: the API accepts them, although its documentation does not list them. The API checks these fields before the request reaches a model, so the result was the same on every model tried (Gemini 2.5 Flash, 2.5 Pro and 3.8 Flash); whether a model follows `oneOf`, `allOf` or `not` is up to the model.

Gemini does not need `forStructuredOutput`, so the Gemini functions do not take it.

```typescript
import { classToGeminiResponseSchema } from '@firefliesai/schema-forge';

const structured = await gemini.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseSchema: classToGeminiResponseSchema(CreateUserInput),
  },
});
const user: CreateUserInput = JSON.parse(structured.text ?? '{}');
```

### 7.4 Existing JSON Schemas, and converting between formats

If you already have a JSON Schema, convert it without a class:

```typescript
import {
  jsonSchemaToAnthropicTool,
  jsonSchemaToOpenAITool,
  openAIToolToJsonSchema,
} from '@firefliesai/schema-forge';

const searchSchema = {
  type: 'object' as const,
  properties: {
    query: { type: 'string' as const, description: 'Search words' },
  },
  required: ['query'],
};
const openAITool = jsonSchemaToOpenAITool(searchSchema, {
  name: 'search',
  description: 'Search documents',
});

// From an OpenAI tool back to JSON Schema, then to Anthropic
const { schema, metadata } = openAIToolToJsonSchema(openAITool);
const anthropicTool = jsonSchemaToAnthropicTool(schema, metadata);
```

These functions only reshape the schema. They do not run the checks of [section 8](#8-errors-and-warnings).

## 8. Errors and warnings

### 8.1 When Schema Forge checks

Schema Forge checks when a schema is generated: when you call `classToJsonSchema` or a `classTo…` function. It checks the class you pass and, recursively, the classes nested in it. Defining or decorating a class never throws. So a class that has `@ToolProp` but is never turned into a schema (for example a database model whose shared field decorator adds `@ToolProp` to every field) cannot break your program when it loads.

To find problems early, generate every tool's schema when your application starts, or in a test.

### 8.2 Errors

One error lists every problem found, named after the class you passed. A problem in a nested class shows its path from that class. For a class `Order` with a property `customer: Customer` (each problem is one line in the real message; it is wrapped here to fit):

```text
schema-forge: cannot generate a JSON Schema for Order:
  - Order.note: cannot determine the JSON Schema type; TypeScript reports
    design type Object (a union such as `T | null`, …). Set `type`, `items`
    or `enum` in @ToolProp …
  - Order.customer → Customer.tags: an array needs an item type. …
```

| Error message contains | Cause | Fix |
| --- | --- | --- |
| `cannot determine the JSON Schema type` | The design type is `Object` (a union, `T \| null`, an interface, a generic, `any`, `unknown`, `Record`), and no option or class-validator decorator gives a type. | Set `type`, `items` or `enum` (and `nullable: true` if `null` is allowed), or add a type decorator such as `@IsString()`. |
| `an array needs an item type` | An array property has no `items`, and no class-validator decorator with `{ each: true }` gives the items a type ([5.3](#53-translated-decorators)). | Set `items`. |
| `the class declares no property with @ToolProp` | The class has class-validator decorators but no `@ToolProp` at all ([5.2](#52-only-toolprop-adds-a-property)). | Add `@ToolProp` to the properties the schema should have. |
| `refers to its own class` / `refers back to …, which contains it` | A class contains itself, directly (`children: Node[]` in `Node`) or through another class (`A.b: B` and `B.a: A`). | On the property that closes the loop, set `type: 'object'` (or `items: { type: 'object' }` for an array). It becomes an object without a fixed shape. |
| `cannot be used as a property name or path segment` | A path given to `updateSchemaProperty`, `addSchemaProperty` or `propertyOverrides` contains `__proto__`, `constructor` or `prototype`, which would reach an object's prototype instead of a property. `updateSchemaProperty` and `addSchemaProperty` throw when called; `propertyOverrides` when the schema is generated. | Use a different property name. |
| `declared by another installed copy of @firefliesai/schema-forge` | Two copies of Schema Forge are installed, and a property was declared through the other copy, whose metadata this copy cannot read ([section 2](#2-install-and-set-up)). | Install a single copy (deduplicate, or force one version with your package manager's overrides), or declare the property with this copy's `@ToolProp`. |

### 8.3 Warnings

Warnings go to `console.warn`, start with `[schema-forge]`, and are printed once per message.

| Warning | Meaning |
| --- | --- |
| `… from @ToolProp is kept; class-validator says …` | An explicit option and a class-validator rule disagree. The explicit option is used ([5.1](#51-which-source-wins)). |
| `class-validator rule "…" has no JSON Schema equivalent` | The rule is not in the schema ([5.4](#54-rules-the-schema-cannot-express)). |
| `… has no @ToolMeta name, so the tool or response format has an empty name …` | A `classTo…Tool` or response-format function ran on a class without `@ToolMeta({ name })`. OpenAI, Anthropic and Gemini reject an empty name, so add `@ToolMeta`, or set the name before sending the tool. |

## 9. Migrating from 2.x

3.0.0 throws where 2.x produced a wrong schema, and translates more class-validator rules. Most classes produce the same schema as before. The full list of changes is the 3.0.0 entry of the [CHANGELOG](CHANGELOG.md).

1. **Generate the schema of every class you convert** (for example by running your tests) and fix each error from [section 8.2](#82-errors). The most common one is a property typed `T | null` under `strictNullChecks`: 2.x produced `{ "type": "object" }` for it, which rejected every string or number sent for it.
2. **Read the `[schema-forge]` warnings.** A conflict warning means an explicit option now wins over class-validator. A "no JSON Schema equivalent" warning names a rule the schema does not contain.
3. **Compare the schemas.** Save the `classToJsonSchema` output of each class before and after the upgrade and compare them. The expected differences are listed under "Breaking changes" in the CHANGELOG: `exclusiveMinimum` for `@IsPositive`, the new translations, decorator order, enum types and compositions.
4. **Check the installed copies.** If a library depends on another version of Schema Forge, install a single copy ([section 2](#2-install-and-set-up)).
5. **Update type checks.** `JSONSchemaProperty.type` may now be an array or `undefined`.
6. **Stored metadata.** If your code reads `Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, …)` directly: a class-typed property no longer holds its nested class's properties there. They exist only in the generated schema.
7. **class-validator.** If you use it, version 0.14 or 0.15 is required. Inference did not work with 0.13 in 2.x either.

## 10. How it works inside

This section is for contributors and for readers who want to know why the rules above exist. You do not need it to use the library.

**Diagram 3: what happens when.** Steps (1) and (2) run once, when the class is defined. Steps (3) to (8) run every time a schema is generated.

```text
 class definition
┌──────────────────────────────────────────────────────────────────────────┐
│ (1) @ToolProp records, per property: the options as written,             │
│     which of them were explicit, the design type, a nested class         │
│ (2) class-validator records its rules in its own store                   │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      v
 classToJsonSchema(Root, options)
┌──────────────────────────────────────────────────────────────────────────┐
│ (3) read Root's stored properties                                        │
│ (4) look for properties another copy of the package declared             │
│     -> problem                                                           │
│ (5) for each property holding a class: build that class's schema,        │
│     with the updates and overrides whose path goes into it               │
│     ((3) to (7) again; a class already on the path -> recursion problem) │
│ (6) apply the other recorded updates, then the other propertyOverrides   │
│ (7) per property: add class-validator rules (explicit wins), nullable,   │
│     check the type -> problems                                           │
│ (8) problems? throw one error : apply options and return                 │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Why the checks wait until (3).** A property's class-validator decorators may run after `@ToolProp` (decorators run bottom-up), and a class may be decorated by a shared library without ever being used as a tool. Checking at generation time makes the result independent of decorator order, and means a class is only checked when a schema reaches it.
- **Precedence (7).** `@ToolProp` records which options you set yourself. Inferred rules fill the gaps; a conflicting inferred rule only produces a warning.
- **Nested classes (5).** `@ToolProp` stores a reference to a property's class, not its schema. The nested schema is built for each root, so a change to the nested class is always seen, and the path from the root is known for error messages and recursion checks.
- **Updates into nested classes (5).** `updateSchemaProperty(Outer, 'address.city', …)` is recorded on `Outer`. When a schema of `Outer` is generated, the update is handed to the build of `Address`'s schema and applied there before `Address`'s properties are checked, exactly like an update of `Address`'s own `city`; a `propertyOverrides` entry such as `'address.city'` goes the same way, at any depth. So an update or override can give a nested property the type it lacks, and `Address` itself does not change. A subclass of `Outer` gets the update too, if its `address` property still holds the same class. Step (6) applies the rest: updates of the class's own properties, and paths into a property whose class is not built.
- **Another installed copy (4).** Metadata is stored under JavaScript symbols created by each copy of the package (`Symbol('jsonSchema')`). Two copies create two different symbols with the same name, so one copy cannot read the other's properties. Schema Forge looks for a symbol with the same name that is not its own, and reports the properties only that copy declared, instead of leaving them out silently.

## 11. Limitations

- **No recursive schemas.** Schema Forge does not emit `$ref` or `$defs`, so a class cannot contain itself; describe the closing property as `type: 'object'`.
- **No object-level rules.** `minProperties`, `maxProperties`, `patternProperties` and `propertyNames` have no option.
- **class-transformer is not read.** `@Type(() => X)` does not give array items; set `items`.
- **`@IsOptional()` does not make a property optional.** Use `isOptional: true`.
- **Strict modes cannot express a free-form object.** An object without declared properties (a `Record`) cannot be closed, so OpenAI strict mode rejects it.
- **The Vertex AI functions are not tested** against the real API.

## 12. API reference

**Decorators**

| Function | Description |
| --- | --- |
| `@ToolMeta({ name?, description? })` | Class decorator: the tool's name and description, used by the provider formats. |
| `@ToolProp(options?)` | Property decorator: puts the property in the schema ([4.4](#44-all-toolprop-options)). |

**Generating a schema**

| Function | Description |
| --- | --- |
| `classToJsonSchema(Class, options?)` | The JSON Schema of a class ([section 6](#6-schema-options)). |
| `prepareForOpenAIStructuredOutput(schema, handleOptionals?)` | The OpenAI strict-mode preparation of [7.1](#71-openai), on a schema you already have. |
| `findUndeclaredValidatedProperties(Class)` | Properties with class-validator decorators but no `@ToolProp`, with their paths ([5.2](#52-only-toolprop-adds-a-property)). |

**Changing a class's schema permanently**

| Function | Description |
| --- | --- |
| `updateSchemaProperty(Class, path, updates)` | Changes a property; the path may go into nested classes. |
| `addSchemaProperty(Class, path, options)` | Adds a property; the path may go into nested classes. |

**From a class to a provider format** (all take `(Class, options?)`)

| Function | Returns |
| --- | --- |
| `classToOpenAITool` | OpenAI Chat Completions tool |
| `classToOpenAIResponseApiTool` | OpenAI Responses API tool (strict by default) |
| `classToOpenAIResponseFormatJsonSchema` | OpenAI Chat Completions `response_format` |
| `classToOpenAIResponseApiTextSchema` | OpenAI Responses API `text.format` |
| `classToAnthropicTool` | Anthropic tool |
| `classToGeminiTool`, `classToGeminiResponseSchema` | `@google/genai` function declaration, response schema |
| `classToGeminiOldTool`, `classToGeminiOldResponseSchema` | `@google/generative-ai` function declaration, response schema |
| `classToGeminiVertexTool`, `classToGeminiVertexResponseSchema` | `@google-cloud/vertexai` function declaration, response schema |

**From a JSON Schema to a provider format** (they take `(schema, { name, description? }, options?)`, except that `jsonSchemaToAnthropicTool` takes no `options` and the three Gemini response-schema converters take `(schema, { description? })`)

`jsonSchemaToOpenAITool`, `jsonSchemaToOpenAIResponseApiTool` (its `options.strict` is required), `jsonSchemaToOpenAIResponseFormat`, `jsonSchemaToOpenAIResponseApiTextSchema`, `jsonSchemaToAnthropicTool`, `jsonSchemaToGeminiTool`, `jsonSchemaToGeminiResponseSchema`, `jsonSchemaToGeminiOldTool`, `jsonSchemaToGeminiOldResponseSchema`, `jsonSchemaToGeminiVertexTool`, `jsonSchemaToGeminiVertexResponseSchema`.

**From a provider format back to JSON Schema**

`openAIToolToJsonSchema(tool)` and `openAIResponseApiToolToJsonSchema(tool)` return `{ schema, metadata }`.

**Other exports.** `Schema` is an object holding the main functions above (an older import style), and `classToLLMTool` is an older name for `classToOpenAITool`.

## 13. Troubleshooting

**`Property 'name' has no initializer and is not definitely assigned in the constructor. ts(2564)`** — `strictPropertyInitialization` is on. Write `name!: string` ([section 2](#2-install-and-set-up)).

**The error says "no design type (is emitDecoratorMetadata enabled?)"** — turn on `emitDecoratorMetadata`, and make sure your build tool emits decorator metadata. [esbuild does not support it](https://esbuild.github.io/content-types/#no-type-system), so neither do tools that compile TypeScript with esbuild.

**A property is missing from the schema** — it has no `@ToolProp` ([5.2](#52-only-toolprop-adds-a-property)), or it was declared through another installed copy of Schema Forge, which 3.0 reports as an error ([section 8.2](#82-errors)).

**An optional property rejects `null`** — `isOptional` does not allow `null`; add `nullable: true` ([4.3](#43-optional-and-nullable)).

## License

[Apache 2.0](LICENSE)

## Contributing

Contributions are welcome. Please open an issue or a pull request on [GitHub](https://github.com/firefliesai/schema-forge).
