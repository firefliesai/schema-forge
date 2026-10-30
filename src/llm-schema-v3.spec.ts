/**
 * Real-API checks for the schema shapes 3.0.0 introduced: nullable type arrays, a nullable enum,
 * exclusiveMinimum, closed objects and a mixed-type enum. Each provider must accept the schema and
 * return arguments that match it.
 */
import 'reflect-metadata';

import Anthropic from '@anthropic-ai/sdk';
/** new Google AI Studio API which supports Gemini Developer API and Vertex AI.*/
import { GoogleGenAI } from '@google/genai';
/** old Google AI Studio API which supports Gemini Developer API.*/
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IsInt, IsPositive } from 'class-validator';
import OpenAI from 'openai';

import {
  classToAnthropicTool,
  classToGeminiOldTool,
  classToGeminiTool,
  classToOpenAITool,
  ToolMeta,
  ToolProp,
} from './schema-forge';

enum Mood {
  Happy = 'happy',
  Sad = 'sad',
}

class ProfileAddress {
  @ToolProp({ description: 'City name' })
  city: string;
}

const toolName = 'record_profile';

@ToolMeta({ name: toolName, description: 'Record a person profile' })
class ProfileTool {
  @ToolProp({ description: 'Full name' })
  name: string;

  @ToolProp({ type: 'string', nullable: true, description: 'Nickname, or null when none' })
  nickname: string | null;

  @ToolProp({ enum: Mood, nullable: true, description: 'Mood, or null when unknown' })
  mood: Mood | null;

  @IsInt()
  @IsPositive()
  @ToolProp({ description: 'Age in whole years' })
  age: number;

  @ToolProp({ description: 'Home address' })
  address: ProfileAddress;

  @ToolProp({ enum: ['a', 2], description: 'Either the string "a" or the number 2' })
  code: string | number;
}

const userMessage =
  'Record this profile with the tool: Ada Lovelace, no nickname, mood happy, 36 years old, ' +
  'lives in London, code "a".';

function expectProfile(args: any): void {
  expect(args.name).toContain('Ada');
  expect([null, undefined]).toContain(args.nickname);
  expect(args.mood).toBe('happy');
  expect(args.age).toBe(36);
  expect(args.address.city).toBe('London');
  expect(args.code).toBe('a');
}

const openai = new OpenAI();
const anthropic = new Anthropic();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const geminiOldApi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

jest.setTimeout(90 * 1000);

describe('LLM providers accept 3.0.0 schema shapes', () => {
  it('OpenAI (Chat Completions API) - strict tool (forStructuredOutput)', async () => {
    const tool = classToOpenAITool(ProfileTool, { forStructuredOutput: true });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userMessage }],
      tools: [tool as any],
      tool_choice: 'required',
    });

    const call = completion.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe(toolName);
    expect(JSON.parse(call.function.arguments).nickname).toBeNull();
    expectProfile(JSON.parse(call.function.arguments));
  });

  it('OpenAI (Chat Completions API) - closed objects', async () => {
    const tool = classToOpenAITool(ProfileTool, { additionalProperties: false });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userMessage }],
      tools: [tool as any],
      tool_choice: 'required',
    });

    expectProfile(JSON.parse(completion.choices[0].message.tool_calls[0].function.arguments));
  });

  it('Anthropic Claude - closed objects', async () => {
    const tool = classToAnthropicTool(ProfileTool, { additionalProperties: false });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: userMessage }],
      tools: [tool as any],
      tool_choice: { type: 'any' },
    });

    const block = message.content.find((content) => content.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('Tool use not found');
    expect(block.name).toBe(toolName);
    expectProfile(block.input);
  });

  it('Google Gemini (@google/genai) - nullable, bounds and a mixed enum', async () => {
    const tool = classToGeminiTool(ProfileTool);

    const response = await gemini.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userMessage,
      config: { tools: [{ functionDeclarations: [tool as any] }] },
    });

    expect(response.functionCalls[0].name).toBe(toolName);
    expectProfile(response.functionCalls[0].args);
  });

  it('Google Gemini (@google/generative-ai) - nullable, bounds and a mixed enum', async () => {
    const tool = classToGeminiOldTool(ProfileTool);

    const model = geminiOldApi.getGenerativeModel({
      model: 'gemini-3.8-flash',
      tools: [{ functionDeclarations: [tool as any] }],
    });
    const result = await model.generateContent([userMessage]);

    const call = result.response.candidates[0].content.parts.find(
      (part) => part.functionCall,
    )?.functionCall;
    if (!call) throw new Error('Function call not found');
    expect(call.name).toBe(toolName);
    expectProfile(call.args);
  });
});
