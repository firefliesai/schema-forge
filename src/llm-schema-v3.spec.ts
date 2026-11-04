/**
 * Real-API checks for the schema shapes 3.0.0 introduced: nullable type arrays, a nullable enum,
 * exclusiveMinimum, closed objects and a mixed-type enum. Each provider must accept the schema and
 * return arguments that match it. The second block sends each provider's strict mode the keywords
 * schema-forge keeps for it (string lengths, pattern, formats, number bounds, array sizes).
 */
import 'reflect-metadata';

import Anthropic from '@anthropic-ai/sdk';
/** new Google AI Studio API which supports Gemini Developer API and Vertex AI.*/
import { GoogleGenAI } from '@google/genai';
/** old Google AI Studio API which supports Gemini Developer API.*/
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDivisibleBy,
  IsInt,
  IsPositive,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import OpenAI from 'openai';

import {
  classToAnthropicTool,
  classToGeminiOldTool,
  classToGeminiResponseSchema,
  classToGeminiTool,
  classToOpenAIResponseApiTool,
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

  it('Google Gemini (@google/genai) - keywords its Schema does not have', async () => {
    // Each of these fields alone makes Gemini answer 400 (`Unknown name …` or
    // `enum[0]: cannot be empty`) unless the formatter moves it into the description
    @ToolMeta({ name: 'record_order', description: 'Record an order' })
    class GeminiOrder {
      @IsDivisibleBy(5) @ToolProp({ description: 'Quantity, a multiple of 5' }) quantity: number;
      @ToolProp({
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
        description: 'Distinct tags',
      } as any)
      tags: string[];
      @ToolProp({ const: 'EUR', description: 'Currency' } as any) currency: string;
      @ToolProp({
        type: 'string',
        deprecated: true,
        examples: ['x'],
        description: 'Old note',
      } as any)
      note: string;
      @ToolProp({ enum: ['', 'gift'], description: 'Wrapping, empty for none' }) wrap: string;
    }
    const message =
      'Record an order of 10 items tagged red and blue, in EUR, note "n", no wrapping.';

    const response = await gemini.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: message,
      config: { tools: [{ functionDeclarations: [classToGeminiTool(GeminiOrder) as any] }] },
    });
    expect(response.functionCalls[0].name).toBe('record_order');
    expect(response.functionCalls[0].args.quantity).toBe(10);
    expect(response.functionCalls[0].args.currency).toBe('EUR');

    const structured = await gemini.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: message,
      config: {
        responseMimeType: 'application/json',
        responseSchema: classToGeminiResponseSchema(GeminiOrder) as any,
      },
    });
    expect(JSON.parse(structured.text).currency).toBe('EUR');
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

const strictToolName = 'place_order';

@ToolMeta({ name: strictToolName, description: 'Place an order' })
class StrictOrder {
  @ToolProp({ description: 'Customer name' })
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ToolProp({ description: 'Customer email', format: 'email' })
  email: string;

  @ToolProp({ description: 'Delivery time, ISO 8601 in UTC' })
  deliverOn: Date;

  @ToolProp({ description: 'Number of units; at most 100 per order' })
  @IsInt()
  @IsPositive()
  @Max(100)
  quantity: number;

  @ToolProp({ description: 'Units per pack' })
  @IsInt()
  @IsDivisibleBy(5)
  packSize: number;

  @ToolProp({ description: 'Tags', items: { type: 'string' } })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  tags: string[];

  @ToolProp({ description: 'Shop website' })
  @IsUrl()
  site: string;

  @ToolProp({ description: 'Three-letter product code' })
  @Matches(/^[A-Z]{3}$/)
  code: string;

  // A lookahead: Anthropic rejects it and OpenAI answers with an empty response, so strict mode
  // moves it into the description
  @ToolProp({ description: 'Voucher code, six characters with at least one digit' })
  @Matches(/^(?=.*\d).{6}$/)
  voucher: string;

  // A quantifier on `.`: Anthropic answers 400, so its strict mode moves the pattern into the
  // description; OpenAI keeps and enforces it
  @ToolProp({ description: 'Gift message, at most 40 characters' })
  @Matches(/^.{1,40}$/)
  giftMessage: string;

  @ToolProp({ description: 'Mood of the customer', enum: Mood, isOptional: true })
  mood?: Mood;

  @ToolProp({ description: 'Second mood, or null when there is none', enum: Mood, nullable: true })
  otherMood: Mood | null;
}

const orderMessage =
  'Place this order with the tool: 500 units for Ada (ada@example.com), deliver on ' +
  '2026-12-01T10:00:00Z, pack size 10, tags red and blue, shop https://example.com, ' +
  'product code ABC, voucher AB12CD, gift message "Enjoy", mood happy, no second mood.';

function expectOrder(args: any): void {
  expect(args.name).toContain('Ada');
  expect(args.email).toBe('ada@example.com');
  expect(args.code).toBe('ABC');
  expect(args.voucher).toBe('AB12CD');
  expect(args.giftMessage).toContain('Enjoy');
  expect(args.packSize % 5).toBe(0);
  expect(args.tags.length).toBeGreaterThanOrEqual(1);
  expect(args.tags.length).toBeLessThanOrEqual(5);
  expect([null, undefined]).toContain(args.otherMood);
}

describe('Strict modes accept the keywords schema-forge keeps for them', () => {
  it('OpenAI (Chat Completions API) - strict tool enforces maximum', async () => {
    const tool = classToOpenAITool(StrictOrder, { forStructuredOutput: true });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: orderMessage }],
      tools: [tool as any],
      tool_choice: 'required',
    });

    const call = completion.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe(strictToolName);
    const args = JSON.parse(call.function.arguments);
    expectOrder(args);
    // The prompt asks for 500; the strict grammar allows at most 100
    expect(args.quantity).toBeLessThanOrEqual(100);
  });

  it('OpenAI (Responses API) - strict tool by default', async () => {
    const tool = classToOpenAIResponseApiTool(StrictOrder);
    expect(tool.strict).toBe(true);

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: orderMessage,
      tools: [tool as any],
      tool_choice: 'required',
    });

    const call: any = response.output.find((item) => item.type === 'function_call');
    expect(call.name).toBe(strictToolName);
    const args = JSON.parse(call.arguments);
    expectOrder(args);
    expect(args.quantity).toBeLessThanOrEqual(100);
  });

  it('OpenAI (Responses API) - non-strict tool keeps optional properties optional', async () => {
    const tool = classToOpenAIResponseApiTool(StrictOrder, { forStructuredOutput: false });
    expect(tool.strict).toBe(false);
    expect(tool.parameters.required).not.toContain('mood');

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: orderMessage,
      tools: [tool as any],
      tool_choice: 'required',
    });

    const call: any = response.output.find((item) => item.type === 'function_call');
    expect(call.name).toBe(strictToolName);
    expectOrder(JSON.parse(call.arguments));
  });

  it('Anthropic Claude - strict tool use', async () => {
    const tool = classToAnthropicTool(StrictOrder, { forStructuredOutput: true });
    expect(tool.strict).toBe(true);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: orderMessage }],
      tools: [tool as any],
      tool_choice: { type: 'any' },
    });

    const block = message.content.find((content) => content.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('Tool use not found');
    expect(block.name).toBe(strictToolName);
    expectOrder(block.input);
  });
});
