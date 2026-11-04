# Changelog

All notable changes to Schema Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - UNRELEASED

PR: firefliesai/schema-forge#33, firefliesai/schema-forge#34

This release makes the generated schema match what the class actually allows, and fails when the schema is generated if it cannot. Most classes produce the same schema as in 2.1.0; the changes below list every case that differs. See [Migrating from 2.x](README.md#9-migrating-from-2x).

### Breaking changes

- **A property whose type cannot be determined now throws.** In 2.x, a property whose TypeScript design type is `Object` became `{ "type": "object" }` with no warning. That covers `x?: string | null` under `strictNullChecks`, any other union, an interface, a generic `T`, `any`, `unknown` and `Record<…>`. A string sent for such a field then failed validation against its own schema. Now `classToJsonSchema` throws, naming every such property of the class. Fix it with an explicit `type`, `items` or `enum` in `@ToolProp` (and `nullable: true` if `null` is allowed), or with a class-validator type decorator such as `@IsString()`.
- **A class with class-validator decorated properties but no `@ToolProp` at all now throws**, because its schema would be empty. This is typically a class built with `PickType` / `OmitType` / `PartialType`, which copy class-validator metadata but not `@ToolProp`'s; 2.x silently produced `{ "properties": {} }` for it. A validated property without `@ToolProp` in a class that declares other properties is still left out, as in 2.x, and that is now the documented contract: only `@ToolProp` declares properties, class-validator only adds to them. This lets one DTO serve an API and a tool with different fields.
- **An array property without an item type** now throws when the schema is generated, with a message naming the class and property. In 2.x it threw when the class was loaded, with a shorter message. The array can still get its items from a class-validator decorator with `{ each: true }`, whatever the decorator order.
- **A class that refers to itself** (for example `children: TreeNode[]` inside `TreeNode`), directly or through another class (`A.b: B` and `B.a: A`), now throws when a schema that reaches it is generated, unless the field that closes the loop is described explicitly (`type: 'object'`, or `items: { type: 'object' }` for an array). In 2.x the nested schema was silently truncated to the properties declared before the self-reference.
- **Every check runs when a schema is generated, and only for the classes that schema reaches.** `@ToolProp` now only records; nested class schemas are built when `classToJsonSchema` (or a `classTo…` formatter) runs, for the class passed in and, recursively, the classes nested in it. Defining or decorating a class never throws, so a class that carries `@ToolProp` but is never converted (for example a model whose shared field decorator adds `@ToolProp` to every field) cannot break an import. Problems are reported in one error named after the class passed in, each with its path (`Order.customer → Customer.email: …`). In 2.x a nested class's schema was built, and an array without items threw, when the outer class was defined.
- **Properties declared by another installed copy of the package now throw.** Each copy of `@firefliesai/schema-forge` stores its metadata under its own `Symbol('jsonSchema')`, so when two copies are installed (for example a library that depends on another version), a property declared through the other copy was invisible and silently left out of the schema; 2.x behaved the same. `classToJsonSchema` now finds that metadata by the symbol's name and throws, naming the properties only the other copy declared, with their path. Install a single copy (deduplicate, or force one version with your package manager's overrides), or declare those properties with this copy's `@ToolProp`. A property both copies declared (a field decorator that applies both) is accepted.
- **The stored decorator metadata of a class-typed property no longer contains the nested class's properties** (`Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, …)`); they exist only in the generated schema. `updateSchemaProperty` and `addSchemaProperty` with a path into a nested class (`'address.city'`) give the same schemas as before: they are recorded and applied each time a schema is generated, and a subclass gets its base class's. They, and `propertyOverrides` entries into a nested class at any depth (`'sensor.reading.value'`), are applied while the nested class's schema is built, before its properties are checked, so they can give a nested property the type it lacks.
- **Decorator order no longer matters.** class-validator decorators are read when the schema is generated, not inside `@ToolProp`. In 2.x a type decorator written above `@ToolProp` (for example `@IsInt()`) was ignored, so the same class could give `number` or `integer` depending on the order.
- **Explicit `@ToolProp` options win over class-validator.** In 2.x an inferred type replaced an explicit one when the class-validator decorator was written below `@ToolProp` (`@ToolProp({ type: 'number' }) @IsInt()` gave `integer`). Now the explicit option is kept, and a conflicting class-validator rule prints a warning.
- **`@IsPositive()` becomes `exclusiveMinimum: 0`** (was `minimum: 1`, which rejected `0.5`). **`@IsNegative()` becomes `exclusiveMaximum: 0`.**
- **More class-validator decorators are translated**, so more properties gain constraints: `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsObject` (type); `@IsEnum`, `@IsIn` (`enum`); `@IsUUID` (`format: "uuid"`); `@Matches` (`pattern`, when the regex has no flags other than `u`); `@Length` (`minLength` / `maxLength`); `@IsNotEmpty` (`minLength: 1` on strings, and on string items with `{ each: true }`); `@IsDivisibleBy` (`multipleOf`, as a positive number). When several decorators set the same bound (`@Length(2, 10)` with `@MinLength(5)`), the strictest value is used, `@IsNotEmpty` included (`@MinLength(0)` with `@IsNotEmpty()` gives `minLength: 1`). Item rules with `{ each: true }` that give no type of their own give the type they accept: numeric rules (`@Min`, `@Max`, …) make the items `number`, string rules (`@MinLength`, `@Matches`, …) make them `string`. An enum from `@IsIn` / `@IsEnum` takes its type from its values only when no type decorator gave one (`@IsInt()` with `@IsIn([1, 1.5])` stays `integer`).
- **Enum types come from every value.** A boolean enum is `boolean` (was `number`), and a mixed enum such as `['a', 2]` is `["string", "number"]` (was `string`).
- **A composition is not given a forced type.** `@ToolProp({ anyOf: [...] })` now emits only the `anyOf` (2.x added `"type": "object"` beside it, which rejected every branch that was not an object). The same applies to `oneOf`, `allOf` and `const`, also when the design type is a class or `Date`.
- **An explicit `items` makes the property an array** even when the design type is not `Array` (for example `string[] | null` under `strictNullChecks`, which 2.x emitted as `{ "type": "object", "items": … }`).
- **class-validator, if installed, must be 0.14 or 0.15.** It is now declared as an optional peer (`^0.14.0 || ^0.15.0`), so npm 7+ reports a peer conflict (ERESOLVE) for a project on 0.13 or older (or on a later major such as 0.16), unless installed with `--legacy-peer-deps`. Inference did not work with 0.13 in 2.x either: 2.1.0 with 0.13.2 silently leaves out every inferred constraint (checked on a regression corpus), and the 3.0.0 inference tests fail with 0.13.2.
- **`forStructuredOutput: true` keeps what OpenAI strict mode accepts** (OpenAI formatters and `classToJsonSchema`). 2.x removed `minLength`, `maxLength`, `pattern` and `format` from strings, number bounds and `multipleOf` from `number` properties (not from `integer` ones), and `minItems` / `maxItems` from arrays, following older OpenAI rules. They now stay, and OpenAI enforces them, so a model can no longer send a value outside them (OpenAI's guide lists them as not supported for fine-tuned models; a fine-tuned `gpt-4o-mini` accepted them when checked, see README 7.1). **If you call `prepareForOpenAIStructuredOutput` on a schema you send to Anthropic, switch to `prepareForAnthropicStrictTool`:** the OpenAI helper now keeps number bounds, `multipleOf`, string lengths and array sizes, which Anthropic strict mode rejects or does not support. Only the keywords OpenAI strict mode rejects (checked against the live API) are removed, and each is added to the property's description as `{keyword: value}`: a `format` other than `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6` and `uuid` (for example `uri` from `@IsUrl`), `uniqueItems`, `contains`, `minContains`, `maxContains`, `unevaluatedItems`, `minProperties`, `maxProperties`, `propertyNames` and `unevaluatedProperties`, and a `pattern` that uses a lookahead or lookbehind, a named group, a backreference or `\b` / `\B` (OpenAI rejects a named group, and answers the others with an empty response that stops at the token limit; other patterns are enforced). An object with no declared properties (a free-form object, such as a `Record`) now throws when the schema is generated, naming the property: strict mode needs every object closed, and the request would be rejected. `prepareForOpenAIStructuredOutput` keeps `handleOptionals = false` as its default, as in 2.x. An optional property is made nullable the way `nullable: true` does it: an optional enum also gets `null` in its `enum` (2.x added `null` to `type` only, so the enum still rejected it), and an optional composition or `const` gets a `null` branch (2.x left it required and not nullable).
- **`classToAnthropicTool` with `forStructuredOutput: true` applies Anthropic's strict tool use**, not the OpenAI rules. It sets `strict: true` on the tool, adds `additionalProperties: false` to every object that declares properties, and keeps `required` as declared (Anthropic allows optional properties). It moves into the description what Anthropic rejects or lists as unsupported: number bounds and `multipleOf`, `minLength` and `maxLength`, `maxItems`, a `minItems` other than 0 or 1, `uniqueItems`, `contains`, `minContains`, `maxContains`, `patternProperties`, `propertyNames`, `minProperties`, `maxProperties`, `unevaluatedProperties`, a `format` outside Anthropic's list, and a `pattern` with a construct Anthropic rejects with a 400 (a lookahead or lookbehind, a named group, a backreference, `\b` / `\B`). An object with no declared properties throws, as for OpenAI. A nullable or mixed-type enum loses its `type` array (Anthropic rejects the pair; the values carry the types). In 2.x the option made every property required and nullable, applied the OpenAI keyword removal, and set no `strict`.
- **`classToOpenAIResponseApiTool` with `forStructuredOutput: false` sends the schema as declared**, with `strict: false`. In 2.x it still closed every object, listed every property in `required` and removed keywords. The default (`strict: true` with the strict changes) is unchanged.
- **A property path containing `__proto__`, `constructor` or `prototype` now throws**, in `updateSchemaProperty`, `addSchemaProperty` and `propertyOverrides`. Such a segment would reach an object's prototype instead of a property schema.
- **`JSONSchemaProperty.type` is optional and may be an array** (`JSONSchemaTypeName | JSONSchemaTypeName[]`), to express `nullable` and compositions. Code that reads `.type` as a `string` needs a type update.
- `getJsonSchemaType` was removed from the internal utilities. It was not part of the public exports.

### Added

- **`nullable: true`** in `@ToolProp`, `propertyOverrides`, `updateSchemaProperty` and `addSchemaProperty`. It adds `"null"` to `type` (and `null` to `enum`), adds a `{ "type": "null" }` branch to an `anyOf` / `oneOf`, and turns anything else that a type cannot open up (`const`, `allOf`, a composition beside a `type` or another composition, a `$ref`, `not`) into `anyOf: [schema, { "type": "null" }]`. A schema that no keyword makes reject null is left as it is: for example a `oneOf` with a branch that already accepts null, where another null branch would make null match two branches. Sibling keywords count together, so an `anyOf` with a null branch beside an `allOf` that rejects null is wrapped. It is independent of `isOptional`. The Gemini formatters translate it to `nullable: true`, and turn a type array with several types (such as a mixed enum) into one typed `anyOf` branch per type, because Gemini's `type` is a single value; a type array next to an `anyOf` (only a hand-written schema has one) throws, naming the property, since Gemini cannot express both.
- **The Gemini formatters send only the fields Gemini's `Schema` accepts** (checked against the live API, for tools and response schemas). Gemini rejects a request with any other field with a 400, and 2.x sent them as they were. A keyword Gemini does not accept now goes into the property's description as `{keyword: value}`, where the model still reads it: `multipleOf` (from `@IsDivisibleBy`), `uniqueItems`, `examples`, `deprecated`, `readOnly`, `contains`, `patternProperties`, `propertyNames`, `exclusiveMinimum` / `exclusiveMaximum` on a number that is not an integer (an integer gets the equivalent `minimum` / `maximum`), a `const` that is not a string, and an `enum` whose values are not all non-empty strings (Gemini rejects numbers and `""` in an enum; the `type` stays). A string `const` becomes a one-value `enum`. `oneOf`, `allOf` and `not` are sent as they are.
- **`additionalProperties: false`** as a `classToJsonSchema` option (and an option of every `classTo…` formatter) adds `additionalProperties: false` to every object that declares properties (the root, nested classes, array items and composition branches), which strict structured-output modes require. A free-form object with no declared properties, such as `@ToolProp({ type: 'object' })` on a `Record`, stays open, because closing it would accept only `{}`. Anthropic tools keep it at the root; Gemini formats drop it, because Gemini does not accept the keyword.
- **Warnings** (`console.warn`, prefixed `[schema-forge]`, once per message) when a class-validator rule has no JSON Schema equivalent (for example `@IsTimeZone`, `@IsISO8601`, `@Matches` with flags), and when an explicit `@ToolProp` option conflicts with a class-validator rule. An explicit `format`, `pattern` or `enum` on the property silences the "no equivalent" warning.
- `PropertyOptions` now types `pattern`, `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum`, `title`, `default`, `examples`, `deprecated`, `const`, `anyOf`, `oneOf` and `allOf`; all were already passed through untyped. `items.type` also accepts `'object'`.
- **`findUndeclaredValidatedProperties(Class)`** lists the properties that have class-validator decorators but no `@ToolProp`, in the class and in the classes nested in its schema, with their paths. It only reports; use it in a test when a class is meant to expose every validated field.
- `class-validator` is declared as an optional peer dependency (`^0.14.0 || ^0.15.0`).
- **`prepareForAnthropicStrictTool(schema)`** applies the Anthropic strict-tool changes to a JSON Schema you already have, and **`jsonSchemaToAnthropicTool(schema, metadata, { strict: true })`** sets `strict: true` on the tool. `AnthropicToolFunction` gains an optional `strict` field.

### Fixed

- The published package no longer contains compiled test files or test fixtures.
- `propertyOverrides` and `updateSchemaProperty` no longer copy the `isOptional` option into the emitted property schema.
- An override (`propertyOverrides`, or `updateSchemaProperty` of the property itself) that describes a property holding a class as another type, an enum, a const or a composition replaces the class: its schema is not built, so its properties and problems no longer reach the result. This holds at any depth (`'middle.broken': { type: 'string' }`).
- An override of a property of a nested class keeps `null` allowed when the property allowed it, unless the override sets `nullable: false`.
- `prepareForOpenAIStructuredOutput` no longer walks into `default`, `const` or `enum` values, so an object given as a default value is not changed as if it were a schema.
- An `enum` update or override of an array property keeps it an array, with the enum on its items, also when its design type is `Object` (`string[] | null` under `strictNullChecks`, with an explicit `items`); 2.1.0 replaced the array with a single enum value. Items that accepted `null` keep accepting it.
- An `enum` override of a nested array property (`'line.tags': { enum: ['a'] }`) applies to its items under an object parent too, as it already did under an array parent; 2.1.0 turned the array into a single enum value. `nullable` in the same override applies to the array itself, and items that accepted `null` keep accepting it.
- Overrides and added properties also reach into a nested property whose schema is wrapped as `anyOf: [<schema>, { type: "null" }]` (what `nullable: true` produces beside `allOf`, `const` or a composition): a path walks into the array or object inside the wrapper, an `enum` or `type` replaces the value inside it and keeps `null`, and `addSchemaProperty` no longer replaces such a property with an empty object.

## [2.1.0] - 2026-02-24

PR: firefliesai/schema-forge#29, firefliesai/schema-forge#30

### Added

- An array property is also detected from class-validator array decorators (`@IsArray`, `@ArrayMinSize`, `@ArrayMaxSize`, `@ArrayUnique`, `@ArrayNotEmpty`, `@ArrayContains`), not only from the `Array` design type.
- Array `items` can come from `@ArrayContains` (primitive values become `items.enum`) and from validators with `{ each: true }` (`items.type`, `minimum`, `maximum`, `minLength`, `maxLength`, `format`). They are merged under explicit `items`, and explicit values win.
- `items.type` accepts the constructors `String`, `Number`, `Boolean` and `Date`; they are normalised to type names (`Date` becomes `{ type: "string", format: "date-time" }`).
- Constraints inferred from class-validator are filled in again when the schema is generated, for decorators that ran after `@ToolProp`.

### Changed

- Enum and item types accept `boolean` values and the `integer` type.

## [2.0.0] - 2026-01-29

### Added

- **Date Type Support**: Properties with `Date` type are now automatically mapped to JSON Schema `{ type: "string", format: "date-time" }`.

- **Class-Validator Integration**: Automatic inference of JSON Schema constraints from class-validator decorators when used in your project. Supported decorators:
  - `@ArrayMaxSize(n)` → `maxItems: n`
  - `@ArrayMinSize(n)` → `minItems: n`
  - `@ArrayUnique()` → `uniqueItems: true`
  - `@ArrayNotEmpty()` → `minItems: 1`
  - `@Max(n)` → `maximum: n`
  - `@Min(n)` → `minimum: n`
  - `@IsInt()` → `type: 'integer'`
  - `@MinLength(n)` → `minLength: n`
  - `@MaxLength(n)` → `maxLength: n`
  - `@IsUrl()` → `format: 'uri'`
  - `@IsEmail()` → `format: 'email'`
  - `@IsPositive()` → `minimum: 1`

- **Validation Constraint Options in ToolProp**: New options for `@ToolProp` decorator to manually specify validation constraints:
  - `minimum`, `maximum` for number constraints
  - `minLength`, `maxLength` for string constraints
  - `minItems`, `maxItems`, `uniqueItems` for array constraints
  - `format` for string format specification

### Changed

- When both class-validator decorators and explicit `@ToolProp` options are present, the explicit options take precedence.

## [1.0.4] - 2025-03-28

1. update README.md

## [1.0.3] - 2025-03-27

1. Add reflect-metadata v0.1.14 backward-compatibility.

## [1.0.2] - 2025-03-25

1. Publish `jsonSchemaToGeminiOldTool`, `jsonSchemaToGeminiOldResponseSchema` that whould be published in 1.0.0.
2. Support the tool format and responseSchema format of google vertex API, `@google-cloud/vertexai`. Supply the following functions
   1. `jsonSchemaToGeminiVertexTool`
   2. `jsonSchemaToGeminiVertexResponseSchema`
   3. `classToGeminiVertexResponseSchema`
   4. `classToGeminiVertexTool`

## [1.0.1] - 2025-03-25

1. Improve README

## [1.0.0] - 2025-03-22

### 🎉 First Official Release

Schema Forge is now ready for production use! This release provides a complete TypeScript library for transforming classes into JSON Schema definitions with first-class support for various LLM function calling formats.

### Features

- **Core Functionality**
  - Class-to-JSON Schema conversion with powerful decorator API
  - Support for nested object structures and complex property paths
  - Extensible metadata and property attributes
  - Comprehensive handling of TypeScript types and enums

- **LLM Provider Support**
  - OpenAI Chat Completions API tool format
  - OpenAI Response API tool format
  - OpenAI structured output formats (response_format and text.format)
  - Anthropic Claude tool format
  - Google Gemini tool and response schema formats (for both @google/genai and @google/generative-ai)

- **Optional Property Handling**
  - Automatic conversion of optional properties to OpenAI's preferred ["type", "null"] format
  - Standard JSON Schema handling for Gemini and other providers

- **Direct Converters**
  - JSON Schema to various LLM formats without requiring TypeScript classes
  - Conversion between different LLM formats (e.g., OpenAI to Anthropic)

- **Developer Experience**
  - Well-documented API with extensive examples
  - Type-safe interfaces with full TypeScript support
  - Modern package exports for both ESM and CommonJS compatibility

### Package Updates

- First stable release with a complete feature set
- Documentation with comprehensive examples
- Full test coverage for all supported features and LLM providers
- CI/CD pipeline for quality assurance
