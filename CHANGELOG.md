# Changelog

All notable changes to Schema Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - UNRELEASED

PR: firefliesai/schema-forge#33

This release makes the generated schema match what the class actually allows, and fails at load time when it cannot. Most classes produce the same schema as in 2.1.0; the changes below list every case that differs. See [Migrating from 2.x](README.md#migrating-from-2x).

### Breaking changes

- **A property whose type cannot be determined now throws.** In 2.x, a property whose TypeScript design type is `Object` became `{ "type": "object" }` with no warning. That covers `x?: string | null` under `strictNullChecks`, any other union, an interface, a generic `T`, `any`, `unknown` and `Record<…>`. A string sent for such a field then failed validation against its own schema. Now `classToJsonSchema` throws, naming every such property of the class. Fix it with an explicit `type`, `items` or `enum` in `@ToolProp` (and `nullable: true` if `null` is allowed), or with a class-validator type decorator such as `@IsString()`.
- **A property with class-validator decorators but no `@ToolProp` now throws.** In 2.x it was silently left out of the schema.
- **An array property without an item type** now throws when the schema is generated, with a message naming the class and property. In 2.x it threw when the class was loaded, with a shorter message. The array can still get its items from a class-validator decorator with `{ each: true }`, whatever the decorator order.
- **A class that refers to itself** (for example `children: TreeNode[]` inside `TreeNode`) now throws when the class is loaded. In 2.x the nested schema was silently truncated to the properties declared before the self-reference.
- **Decorator order no longer matters.** class-validator decorators are read when the schema is generated, not inside `@ToolProp`. In 2.x a type decorator written above `@ToolProp` (for example `@IsInt()`) was ignored, so the same class could give `number` or `integer` depending on the order.
- **Explicit `@ToolProp` options win over class-validator.** In 2.x an inferred type replaced an explicit one when the class-validator decorator was written below `@ToolProp` (`@ToolProp({ type: 'number' }) @IsInt()` gave `integer`). Now the explicit option is kept, and a conflicting class-validator rule prints a warning.
- **`@IsPositive()` becomes `exclusiveMinimum: 0`** (was `minimum: 1`, which rejected `0.5`). **`@IsNegative()` becomes `exclusiveMaximum: 0`.**
- **More class-validator decorators are translated**, so more properties gain constraints: `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsObject` (type); `@IsEnum`, `@IsIn` (`enum`); `@IsUUID` (`format: "uuid"`); `@Matches` (`pattern`, when the regex has no flags other than `u`); `@Length` (`minLength` / `maxLength`); `@IsNotEmpty` (`minLength: 1` on strings); `@IsDivisibleBy` (`multipleOf`).
- **Enum types come from every value.** A boolean enum is `boolean` (was `number`), and a mixed enum such as `['a', 2]` is `["string", "number"]` (was `string`).
- **A composition is not given a forced type.** `@ToolProp({ anyOf: [...] })` now emits only the `anyOf` (2.x added `"type": "object"` beside it, which rejected every branch that was not an object). The same applies to `oneOf`, `allOf` and `const`.
- **An explicit `items` makes the property an array** even when the design type is not `Array` (for example `string[] | null` under `strictNullChecks`, which 2.x emitted as `{ "type": "object", "items": … }`).
- **`JSONSchemaProperty.type` is optional and may be an array** (`JSONSchemaTypeName | JSONSchemaTypeName[]`), to express `nullable` and compositions. Code that reads `.type` as a `string` needs a type update.
- `getJsonSchemaType` was removed from the internal utilities. It was not part of the public exports.

### Added

- **`nullable: true`** in `@ToolProp`, `propertyOverrides`, `updateSchemaProperty` and `addSchemaProperty`. It adds `"null"` to `type` (and `null` to `enum`), adds a `{ "type": "null" }` branch to an `anyOf` / `oneOf`, and turns anything else that a type cannot open up (`const`, `allOf`, a composition beside a `type`) into `anyOf: [schema, { "type": "null" }]`. It is independent of `isOptional`. The Gemini formatters translate it to `nullable: true`.
- **`additionalProperties: false`** as a `classToJsonSchema` option (and an option of every `classTo…` formatter) adds `additionalProperties: false` to every object that declares properties (the root, nested classes, array items and composition branches), which strict structured-output modes require. A free-form object with no declared properties, such as `@ToolProp({ type: 'object' })` on a `Record`, stays open, because closing it would accept only `{}`. Anthropic tools keep it at the root; Gemini formats drop it, because Gemini does not accept the keyword.
- **Warnings** (`console.warn`, prefixed `[schema-forge]`, once per message) when a class-validator rule has no JSON Schema equivalent (for example `@IsTimeZone`, `@IsISO8601`, `@Matches` with flags), and when an explicit `@ToolProp` option conflicts with a class-validator rule. An explicit `format`, `pattern` or `enum` on the property silences the "no equivalent" warning.
- `PropertyOptions` now types `pattern`, `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum`, `title`, `default`, `examples`, `deprecated`, `const`, `anyOf`, `oneOf` and `allOf`; all were already passed through untyped.
- `class-validator` is declared as an optional peer dependency (`^0.14.0 || ^0.15.0`).

### Fixed

- The published package no longer contains compiled test files or test fixtures.
- `propertyOverrides` and `updateSchemaProperty` no longer copy the `isOptional` option into the emitted property schema.
- OpenAI structured output also strips `exclusiveMinimum` and `exclusiveMaximum` from numbers, like `minimum` and `maximum`.

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
