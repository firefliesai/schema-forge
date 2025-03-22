import 'reflect-metadata';

import Anthropic from '@anthropic-ai/sdk';
/** new Google AI Studio API which supports Gemini Developer API and Vertex AI.*/
import { GoogleGenAI } from '@google/genai';
/** old Google AI Studio API which supports Gemini Developer API.*/
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import {
  ToolMeta,
  ToolProp,
  classToAnthropicTool,
  classToGeminiOldResponseSchema,
  classToGeminiOldTool,
  classToGeminiResponseSchema,
  classToGeminiTool,
  classToJsonSchema,
  classToOpenAIResponseApiTextSchema,
  classToOpenAIResponseApiTool,
  classToOpenAIResponseFormatJsonSchema,
  classToOpenAITool,
  jsonSchemaToAnthropicTool,
  jsonSchemaToOpenAITool,
  openAIResponseApiToolToJsonSchema,
  openAIToolToJsonSchema,
} from './schema-forge';

const findCapitalToolName = 'find_capital';
const findCapitalToolDesc = 'Find the capital of a given state';
const userMessage = 'What is the capital of California?';
@ToolMeta({
  name: findCapitalToolName,
  description: findCapitalToolDesc,
})
class CapitalTool {
  @ToolProp({
    description: 'The name of the capital to find',
  })
  name: string;
}
const jsonSchema = classToJsonSchema(CapitalTool);

const openai = new OpenAI();
const anthropic = new Anthropic();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const geminiOldApi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

jest.setTimeout(60 * 1000);

describe('llm tool test', () => {
  it('OpenAI chat completion api - function calling w/ json schema', async () => {
    // Using the new helper function to convert JSON schema to OpenAI tool
    const tool = jsonSchemaToOpenAITool(jsonSchema, {
      name: findCapitalToolName,
      description: findCapitalToolDesc,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [tool],
      tool_choice: 'required',
    });

    expect(completion.choices[0].message.tool_calls[0].function.name).toBe(findCapitalToolName);
    const data: CapitalTool = JSON.parse(
      completion.choices[0].message.tool_calls[0].function.arguments,
    );
    expect(data.name).toBeDefined();
  });

  it('OpenAI chat completion api - function calling w/ wrapped tool', async () => {
    const tool = classToOpenAITool(CapitalTool);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [tool],
      tool_choice: 'required',
    });

    expect(completion.choices[0].message.tool_calls[0].function.name).toBe(findCapitalToolName);
    const data: CapitalTool = JSON.parse(
      completion.choices[0].message.tool_calls[0].function.arguments,
    );
    expect(data.name).toBeDefined();
  });

  it('OpenAI chat completion api - structured output', async () => {
    const responseFormat = classToOpenAIResponseFormatJsonSchema(CapitalTool, {
      /** or use strict: true, they are equivalent and just need to choose one*/
      forStructuredOutput: true,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant',
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      response_format: responseFormat,
    });

    const data: CapitalTool = JSON.parse(completion.choices[0].message.content);
    expect(data.name).toBeDefined();
  });

  it('OpenAI response api - function calling w/ wrapped tool', async () => {
    const tool = classToOpenAIResponseApiTool(CapitalTool);

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      /** it is equal to deprecated system role message */
      instructions: 'You are a helpful assistant',
      input: userMessage,
      tools: [tool],
      tool_choice: 'required',
    });

    if (response.output[0].type === 'function_call') {
      const data: CapitalTool = JSON.parse(response.output[0].arguments);
      expect(data.name).toBeDefined();
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('OpenAI response api - structured output', async () => {
    const responseFormat = classToOpenAIResponseApiTextSchema(CapitalTool, {
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
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('Anthropic chat completion api - tool use w/ json schema', async () => {
    // Using the new helper function to convert JSON schema to Anthropic tool
    const tool = jsonSchemaToAnthropicTool(jsonSchema, {
      name: findCapitalToolName,
      description: findCapitalToolDesc,
    });

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [tool],
      tool_choice: { type: 'any' },
    });

    if (message.content[0].type === 'tool_use') {
      expect(message.content[0].name).toBe(findCapitalToolName);
      const data = message.content[0].input as CapitalTool;
      expect(data.name).toBeDefined();
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('Anthropic chat completion api - tool use w/ wrapped tool', async () => {
    const claudeTool = classToAnthropicTool(CapitalTool);

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [claudeTool],
      tool_choice: { type: 'any' },
    });

    if (message.content[0].type === 'tool_use') {
      expect(message.content[0].name).toBe(findCapitalToolName);
      const data = message.content[0].input as CapitalTool;
      expect(data.name).toBeDefined();
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('Convert OpenAI tool to JSON Schema then to Anthropic tool', async () => {
    // First create an OpenAI tool
    const openaiTool = classToOpenAITool(CapitalTool);

    // Convert OpenAI tool to JSON Schema
    const { schema, metadata } = openAIToolToJsonSchema(openaiTool);

    // Convert JSON Schema to Anthropic tool
    const anthropicTool = jsonSchemaToAnthropicTool(schema, metadata);

    // Verify the conversion maintains all necessary information
    expect(anthropicTool.name).toBe(findCapitalToolName);
    expect(anthropicTool.description).toBe(findCapitalToolDesc);

    // Test the converted tool with Anthropic API
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [anthropicTool],
      tool_choice: { type: 'any' },
    });

    if (message.content[0].type === 'tool_use') {
      expect(message.content[0].name).toBe(findCapitalToolName);
      const data = message.content[0].input as CapitalTool;
      expect(data.name).toBeDefined();
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('Convert OpenAI Response API tool to JSON Schema then to Anthropic tool', async () => {
    // First create an OpenAI Response API tool
    const responseApiTool = classToOpenAIResponseApiTool(CapitalTool);

    // Convert OpenAI Response API tool to JSON Schema
    const { schema, metadata } = openAIResponseApiToolToJsonSchema(responseApiTool);

    // Convert JSON Schema to Anthropic tool
    const anthropicTool = jsonSchemaToAnthropicTool(schema, metadata);

    // Verify the conversion maintains all necessary information
    expect(anthropicTool.name).toBe(findCapitalToolName);
    expect(anthropicTool.description).toBe(findCapitalToolDesc);

    // Test the converted tool with Anthropic API
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [anthropicTool],
      tool_choice: { type: 'any' },
    });

    if (message.content[0].type === 'tool_use') {
      expect(message.content[0].name).toBe(findCapitalToolName);
      const data = message.content[0].input as CapitalTool;
      expect(data.name).toBeDefined();
    } else {
      throw new Error('Tool use not found');
    }
  });

  it('Gemini @google/genai api (aistudio new, preview stage, support aisutdio and vertex): function calling', async () => {
    const tool = classToGeminiTool(CapitalTool);

    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: userMessage,
      config: {
        // we trust the auto choice of Gemini would work for the current case
        // toolConfig: {
        //   functionCallingConfig: {
        //     // Force it to call any function
        //     mode: FunctionCallingConfigMode.ANY,
        //     allowedFunctionNames: [tool.name],
        //   },
        // },
        tools: [{ functionDeclarations: [tool] }],
      },
    });

    expect(response.functionCalls[0].name).toBe(findCapitalToolName);
    const data = response.functionCalls[0].args as unknown as CapitalTool;
    expect(data.name).toBeDefined();
  });

  it('Gemini @google/generative-ai api (aistudio old): function calling', async () => {
    const tool = classToGeminiOldTool(CapitalTool);

    const model = geminiOldApi.getGenerativeModel({
      model: 'gemini-2.0-flash-001',
      tools: [
        {
          functionDeclarations: [tool],
        },
      ],
    });

    const result = await model.generateContent([userMessage]);

    expect(result.response.candidates[0].content.parts[0].functionCall.name).toBe(
      findCapitalToolName,
    );
    const data = result.response.candidates[0].content.parts[0].functionCall.args as CapitalTool;
    expect(data.name).toBeDefined();
  });

  it('Gemini @google/genai api (aistudio new): structured output', async () => {
    const responseSchema = classToGeminiResponseSchema(CapitalTool, {
      forStructuredOutput: true,
    });

    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: userMessage,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const data: CapitalTool = JSON.parse(response.text);
    expect(data.name).toBeDefined();
  });

  it('Gemini @google/generative-ai api (aistudio old): structured output', async () => {
    const responseSchema = classToGeminiOldResponseSchema(CapitalTool, {
      forStructuredOutput: true,
    });

    const model = geminiOldApi.getGenerativeModel({
      model: 'gemini-2.0-flash-001',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const result = await model.generateContent([userMessage]);
    const data: CapitalTool = JSON.parse(result.response.candidates[0].content.parts[0].text);
    expect(data.name).toBeDefined();
  });
});
