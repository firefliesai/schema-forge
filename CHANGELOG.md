# Changelog

All notable changes to Schema Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2025-03-28

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
