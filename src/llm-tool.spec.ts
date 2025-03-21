import 'reflect-metadata';

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import {
  ToolMeta,
  ToolProp,
  classToAnthropicTool,
  classToJsonSchema,
  classToOpenAIResponseFormatJsonSchema,
  classToOpenAITool,
} from './schema-forge';

const findCapitalToolName = 'find_capital';
const findCapitalToolDesc = 'Find the capital of a given state';
@ToolMeta({
  name: findCapitalToolName,
  description: findCapitalToolDesc,
})
class CapitalTool {
  @ToolProp({
    description: 'The full name of the user',
  })
  name: string;
}
const jsonSchema = classToJsonSchema(CapitalTool);

const openai = new OpenAI();
const anthropic = new Anthropic();

describe('llm tool test', () => {
  it('OpenAI chat completion api - function calling w/ json schema', async () => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'What is the capital of California?',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: findCapitalToolName,
            description: findCapitalToolDesc, // You need to manually provide description
            parameters: jsonSchema,
          },
        },
      ],
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
          content: 'What is the capital of California?',
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
          content: 'What is the capital of California?',
        },
      ],
      response_format: responseFormat,
    });

    const data: CapitalTool = JSON.parse(completion.choices[0].message.content);
    expect(data.name).toBeDefined();
  });

  it('Anthropic chat completion api - tool use w/ json schema', async () => {
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: 'What is the capital of California?',
        },
      ],
      tools: [
        {
          name: findCapitalToolName,
          description: findCapitalToolDesc,
          input_schema: {
            type: 'object',
            properties: jsonSchema.properties,
            required: jsonSchema.required,
          },
        },
      ],
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
          content: 'What is the capital of California?',
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
});
