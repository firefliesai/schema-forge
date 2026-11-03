/**
 * Strict-mode adaptation per provider: what each strict mode keeps, what it moves into the
 * description, and how optional properties are expressed.
 */
import 'reflect-metadata';

import { ArrayMaxSize, ArrayMinSize, IsUrl, Max, MaxLength, Min } from 'class-validator';

import {
  classToAnthropicTool,
  classToOpenAIResponseApiTool,
  classToOpenAITool,
  jsonSchemaToAnthropicTool,
  prepareForAnthropicStrictTool,
  prepareForOpenAIStructuredOutput,
  ToolMeta,
  ToolProp,
} from './index';

enum Mood {
  Happy = 'happy',
  Sad = 'sad',
}

class Place {
  @ToolProp({ description: 'City' })
  city: string;
}

@ToolMeta({ name: 'order', description: 'Place an order' })
class Order {
  @ToolProp({ description: 'Customer name' })
  @MaxLength(50)
  name: string;

  @ToolProp({ description: 'Website' })
  @IsUrl()
  site: string;

  @ToolProp({ description: 'Quantity', type: 'integer', exclusiveMinimum: 0 })
  @Max(100)
  quantity: number;

  @ToolProp({ description: 'Tags', items: { type: 'string' } })
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  tags: string[];

  @ToolProp({ description: 'Notes', items: { type: 'string' } })
  @ArrayMinSize(1)
  notes: string[];

  @ToolProp({ description: 'Mood', enum: Mood, isOptional: true })
  mood?: Mood;

  @ToolProp({ description: 'Mood or nothing', enum: Mood, nullable: true })
  maybeMood: Mood | null;

  @ToolProp({
    description: 'Either',
    anyOf: [{ type: 'string' }, { type: 'number' }],
    isOptional: true,
  })
  either?: string | number;

  @ToolProp({ description: 'Where', isOptional: true })
  place?: Place;

  @ToolProp({ description: 'Score', isOptional: true })
  @Min(0)
  score?: number;
}

describe('OpenAI strict mode (forStructuredOutput)', () => {
  const parameters = () =>
    classToOpenAITool(Order, { forStructuredOutput: true }).function.parameters;

  it('keeps the keywords OpenAI strict mode enforces', () => {
    const p = parameters().properties;
    expect(p.name.maxLength).toBe(50);
    expect(p.quantity).toMatchObject({ type: 'integer', exclusiveMinimum: 0, maximum: 100 });
    expect(p.tags).toMatchObject({ minItems: 2, maxItems: 5 });
    expect(p.score.minimum).toBe(0);
  });

  it('moves a format OpenAI rejects into the description', () => {
    const site = parameters().properties.site;
    expect(site.format).toBeUndefined();
    expect(site.description).toBe('Website\n\n{format: "uri"}');
  });

  it('lists every property in required and makes the optional ones nullable', () => {
    const p = parameters();
    expect(p.required).toEqual(Object.keys(p.properties));
    expect(p.additionalProperties).toBe(false);
    expect(p.properties.mood).toMatchObject({
      type: ['string', 'null'],
      enum: ['happy', 'sad', null],
    });
    expect(p.properties.either.anyOf).toEqual([
      { type: 'string' },
      { type: 'number' },
      { type: 'null' },
    ]);
    expect(p.properties.place.type).toEqual(['object', 'null']);
    expect(p.properties.place.additionalProperties).toBe(false);
  });

  it('moves the other rejected keywords and leaves the input unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        list: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        map: {
          type: 'object',
          properties: { a: { type: 'string' } },
          required: ['a'],
          minProperties: 1,
        },
        // A default value is data, not a schema: it is not walked
        config: {
          type: 'object',
          properties: { b: { type: 'string' } },
          default: { properties: { x: 1 } },
        },
      },
      required: ['list', 'map', 'config'],
    };
    const before = JSON.parse(JSON.stringify(schema));
    const prepared = prepareForOpenAIStructuredOutput(schema, true);
    expect(schema).toEqual(before);
    expect(prepared.properties.list.uniqueItems).toBeUndefined();
    expect(prepared.properties.list.description).toBe('{uniqueItems: true}');
    expect(prepared.properties.map.minProperties).toBeUndefined();
    expect(prepared.properties.config.default).toEqual({ properties: { x: 1 } });
  });
});

describe('OpenAI Responses API tool', () => {
  it('is strict by default, with every property required', () => {
    const tool = classToOpenAIResponseApiTool(Order);
    expect(tool.strict).toBe(true);
    expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties));
  });

  it('sends the schema as declared when forStructuredOutput is false', () => {
    const tool = classToOpenAIResponseApiTool(Order, { forStructuredOutput: false });
    expect(tool.strict).toBe(false);
    expect(tool.parameters.required).not.toContain('mood');
    expect(tool.parameters.additionalProperties).toBeUndefined();
    expect(tool.parameters.properties.mood.type).toBe('string');
    expect(tool.parameters.properties.site.format).toBe('uri');
  });
});

describe('Anthropic strict tool use (forStructuredOutput)', () => {
  it('leaves a tool without forStructuredOutput as declared', () => {
    const tool = classToAnthropicTool(Order);
    expect(tool.strict).toBeUndefined();
    expect(tool.input_schema.properties.quantity.maximum).toBe(100);
    expect(tool.input_schema.properties.maybeMood.type).toEqual(['string', 'null']);
  });

  it("applies Anthropic's own rules, not OpenAI's", () => {
    const tool = classToAnthropicTool(Order, { forStructuredOutput: true });
    const schema = tool.input_schema;
    expect(tool.strict).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    // Optional properties stay optional
    expect(schema.required).not.toContain('mood');
    expect(schema.properties.mood.type).toBe('string');
    expect(schema.properties.place.additionalProperties).toBe(false);
    // Kept: uri, minItems 0/1. String lengths move to the description (next test).
    expect(schema.properties.name.maxLength).toBeUndefined();
    expect(schema.properties.site.format).toBe('uri');
    expect(schema.properties.notes.minItems).toBe(1);
  });

  it('moves number bounds, string lengths and array sizes into the description', () => {
    const p = classToAnthropicTool(Order, { forStructuredOutput: true }).input_schema.properties;
    expect(p.name).toEqual({ type: 'string', description: 'Customer name\n\n{maxLength: 50}' });
    expect(p.quantity).toEqual({
      type: 'integer',
      description: 'Quantity\n\n{maximum: 100, exclusiveMinimum: 0}',
    });
    expect(p.tags.minItems).toBeUndefined();
    expect(p.tags.maxItems).toBeUndefined();
    expect(p.tags.description).toBe('Tags\n\n{maxItems: 5, minItems: 2}');
  });

  it('drops the type array next to an enum', () => {
    const p = classToAnthropicTool(Order, { forStructuredOutput: true }).input_schema.properties;
    expect(p.maybeMood.type).toBeUndefined();
    expect(p.maybeMood.enum).toEqual(['happy', 'sad', null]);
    const mixed = prepareForAnthropicStrictTool({
      type: 'object',
      properties: { code: { type: ['string', 'number'], enum: ['a', 2] } },
    });
    expect(mixed.properties.code).toEqual({ enum: ['a', 2] });
  });

  it('keeps only the enum values the dropped type array accepted', () => {
    class Step {
      @ToolProp({ description: 'Step', type: 'integer', enum: [1, 1.5, 2], nullable: true })
      step: number | null;
    }
    const step = classToAnthropicTool(Step, { forStructuredOutput: true }).input_schema.properties
      .step;
    expect(step.type).toBeUndefined();
    expect(step.enum).toEqual([1, 2, null]);
  });

  it('sets strict on a tool built from a JSON Schema', () => {
    const tool = jsonSchemaToAnthropicTool(
      { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      { name: 'search' },
      { strict: true },
    );
    expect(tool.strict).toBe(true);
    expect(
      jsonSchemaToAnthropicTool({ type: 'object', properties: {} }, { name: 's' }).strict,
    ).toBe(undefined);
  });
});
