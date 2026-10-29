/**
 * 3.0.0 behaviour: generation-time resolution, precedence, errors and new options
 */
import 'reflect-metadata';

import {
  IsDivisibleBy,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNegative,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  classToAnthropicTool,
  classToGeminiTool,
  classToJsonSchema,
  classToOpenAITool,
  ToolProp,
  updateSchemaProperty,
} from './index';
import { makeNullable } from './resolve';

enum Color {
  Red = 'red',
  Blue = 'blue',
}

describe('3.0.0 schema resolution', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const warnings = (): string[] => warn.mock.calls.map((call) => String(call[0]));

  describe('a property whose type cannot be determined', () => {
    // This repository compiles without strictNullChecks, where `string | null` is just `string`;
    // a consumer with `strict: true` gets design type Object for it, like this union.
    it('throws one error naming every such property', () => {
      class Unresolved {
        @ToolProp({ isOptional: true }) note?: string | number;
        @ToolProp() payload: Record<string, unknown>;
        @ToolProp() fine: string;
      }

      expect(() => classToJsonSchema(Unresolved)).toThrow(
        /Unresolved:\n {2}- Unresolved\.note: cannot determine[^\n]*\n {2}- Unresolved\.payload: cannot determine/,
      );
    });

    it('is resolved by an explicit type, an enum, items, a composition or a class-validator type', () => {
      class Resolved {
        @ToolProp({ type: 'string', isOptional: true }) a?: string | null;
        @ToolProp({ enum: Color }) b: Color | null;
        @ToolProp({ items: { type: 'string' } }) c: string[] | null;
        @ToolProp({ anyOf: [{ type: 'string' }, { type: 'number' }] }) d: string | number;
        @IsString() @ToolProp() e: string | null;
        @IsInt() @ToolProp() f: number | null;
      }

      expect(classToJsonSchema(Resolved).properties).toStrictEqual({
        a: { type: 'string' },
        b: { type: 'string', enum: ['red', 'blue'] },
        c: { type: 'array', items: { type: 'string' } },
        d: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        e: { type: 'string' },
        f: { type: 'integer' },
      });
    });

    it('can be fixed through propertyOverrides', () => {
      class FixedByOverride {
        @ToolProp() meta: Record<string, string>;
        @ToolProp() tags: unknown;
      }

      expect(
        classToJsonSchema(FixedByOverride, {
          // PropertyPath has no entry for an `unknown` property, hence the cast
          propertyOverrides: {
            meta: { type: 'object' },
            tags: { items: { type: 'string' } },
          } as never,
        }).properties,
      ).toStrictEqual({
        meta: { type: 'object' },
        tags: { type: 'array', items: { type: 'string' } },
      });
    });
  });

  describe('nullable', () => {
    it('adds null to the type and the enum, independent of isOptional', () => {
      class Nullables {
        @ToolProp({ type: 'string', nullable: true }) requiredButNullable: string | null;
        @ToolProp({ type: 'string', nullable: true, isOptional: true }) both?: string | null;
        @ToolProp({ enum: Color, nullable: true }) color: Color | null;
        @ToolProp({ items: { type: 'number' }, nullable: true }) list: number[] | null;
        @ToolProp({ anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true })
        mixed: unknown;
        @IsInt() @ToolProp({ nullable: true }) count: number | null;
      }

      const schema = classToJsonSchema(Nullables);

      expect(schema.required).toStrictEqual([
        'requiredButNullable',
        'color',
        'list',
        'mixed',
        'count',
      ]);
      expect(schema.properties).toStrictEqual({
        requiredButNullable: { type: ['string', 'null'] },
        both: { type: ['string', 'null'] },
        color: { type: ['string', 'null'], enum: ['red', 'blue', null] },
        list: { type: ['array', 'null'], items: { type: 'number' } },
        mixed: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
        count: { type: ['integer', 'null'] },
      });
    });

    it('can be set through propertyOverrides', () => {
      class NullableOverride {
        @ToolProp() name: string;
      }

      expect(
        classToJsonSchema(NullableOverride, { propertyOverrides: { name: { nullable: true } } })
          .properties.name,
      ).toStrictEqual({ type: ['string', 'null'] });
      expect(classToJsonSchema(NullableOverride).properties.name).toStrictEqual({ type: 'string' });
    });

    it('can be turned off through propertyOverrides and updateSchemaProperty', () => {
      class NullableOff {
        @ToolProp({ type: 'string', nullable: true }) a: string | null;
        @ToolProp() b: string;
      }

      expect(
        classToJsonSchema(NullableOff, {
          propertyOverrides: { a: { nullable: false }, b: { nullable: false } },
        }).properties,
      ).toStrictEqual({ a: { type: 'string' }, b: { type: 'string' } });

      updateSchemaProperty(NullableOff, 'b', { nullable: false });
      expect(classToJsonSchema(NullableOff).properties.b).toStrictEqual({ type: 'string' });
    });

    it('makes const and typed compositions an alternative with null', () => {
      class NullableAlternatives {
        @ToolProp({ const: 'yes', nullable: true, description: 'flag' }) yes: unknown;
        @ToolProp({ allOf: [{ type: 'string' }, { minLength: 2 }], nullable: true }) both: unknown;
      }

      expect(classToJsonSchema(NullableAlternatives).properties).toStrictEqual({
        yes: { description: 'flag', anyOf: [{ const: 'yes' }, { type: 'null' }] },
        both: {
          anyOf: [{ allOf: [{ type: 'string' }, { minLength: 2 }] }, { type: 'null' }],
        },
      });
    });

    it('wraps a composition with a sibling enum, which would otherwise still reject null', () => {
      const schema: Record<string, any> = { enum: ['a'], anyOf: [{ type: 'string' }] };
      makeNullable(schema);

      expect(schema).toStrictEqual({
        anyOf: [{ enum: ['a'], anyOf: [{ type: 'string' }] }, { type: 'null' }],
      });
    });

    it('becomes nullable: true in the Gemini formats', () => {
      class GeminiNullable {
        @ToolProp({ enum: Color, nullable: true }) color: Color | null;
        @ToolProp({ anyOf: [{ type: 'string' }], nullable: true }) single: unknown;
        @ToolProp({ anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true })
        pair: unknown;
      }

      expect(classToGeminiTool(GeminiNullable).parameters.properties).toStrictEqual({
        color: { type: 'string', enum: ['red', 'blue'], nullable: true },
        single: { type: 'string', nullable: true },
        pair: { anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true },
      });
    });

    it('leaves literal values unchanged in the Gemini formats', () => {
      class GeminiLiterals {
        @ToolProp({
          type: 'object',
          default: { additionalProperties: 42, type: ['string', 'null'] },
          examples: [{ additionalProperties: 1 }],
        })
        options: Record<string, unknown>;
      }

      expect(classToGeminiTool(GeminiLiterals).parameters.properties.options).toStrictEqual({
        type: 'object',
        default: { additionalProperties: 42, type: ['string', 'null'] },
        examples: [{ additionalProperties: 1 }],
      });
    });
  });

  describe('class-validator inference', () => {
    it('does not depend on decorator order', () => {
      class Order {
        @IsInt() @Max(9) @IsEmail() @ToolProp() above: number;
        @ToolProp() @IsInt() @Max(9) @IsEmail() below: number;
      }

      const { above, below } = classToJsonSchema(Order).properties;
      expect(above).toStrictEqual(below);
      expect(above).toStrictEqual({ type: 'integer', maximum: 9, format: 'email' });
    });

    it('translates the 3.0.0 decorators', () => {
      class Translated {
        @IsUUID() @ToolProp() id: string;
        @Matches(/^[a-z]+$/) @ToolProp() slug: string;
        @Length(2, 5) @ToolProp() code: string;
        @MinLength(3) @Length(2, 10) @MaxLength(8) @ToolProp() combined: string;
        @IsNotEmpty() @ToolProp() name: string;
        @IsNotEmpty() @ToolProp() amount: number;
        @IsPositive() @ToolProp() price: number;
        @IsNegative() @ToolProp() delta: number;
        @IsDivisibleBy(15) @ToolProp() minutes: number;
        @IsEnum(Color) @ToolProp() color: Color;
        @IsIn([1, 2, 3]) @ToolProp() level: number;
        @IsNumber() @IsInt() @ToolProp() count: number;
      }

      expect(classToJsonSchema(Translated).properties).toStrictEqual({
        id: { type: 'string', format: 'uuid' },
        slug: { type: 'string', pattern: '^[a-z]+$' },
        code: { type: 'string', minLength: 2, maxLength: 5 },
        combined: { type: 'string', minLength: 3, maxLength: 8 },
        name: { type: 'string', minLength: 1 },
        amount: { type: 'number' },
        price: { type: 'number', exclusiveMinimum: 0 },
        delta: { type: 'number', exclusiveMaximum: 0 },
        minutes: { type: 'number', multipleOf: 15 },
        color: { type: 'string', enum: ['red', 'blue'] },
        level: { type: 'number', enum: [1, 2, 3] },
        count: { type: 'integer' },
      });
      expect(warnings()).toStrictEqual([]);
    });

    it('supplies array items from each: true validators', () => {
      class EachItems {
        @IsInt({ each: true }) @Min(1, { each: true }) @ToolProp() ids: number[];
      }

      expect(classToJsonSchema(EachItems).properties.ids).toStrictEqual({
        type: 'array',
        items: { type: 'integer', minimum: 1 },
      });
    });

    it('keeps explicit options and warns on a conflict', () => {
      class Conflicts {
        @MaxLength(10) @ToolProp({ maxLength: 20 }) title: string;
        @IsInt() @ToolProp({ type: 'number' }) score: number;
        @IsEmail() @ToolProp({ format: 'email' }) email: string;
      }

      expect(classToJsonSchema(Conflicts).properties).toStrictEqual({
        title: { type: 'string', maxLength: 20 },
        score: { type: 'number' },
        email: { type: 'string', format: 'email' },
      });
      expect(warnings()).toStrictEqual([
        '[schema-forge] Conflicts.title: maxLength 20 from @ToolProp is kept; class-validator says 10.',
        '[schema-forge] Conflicts.score: type "number" from @ToolProp is kept; class-validator says "integer".',
      ]);
    });

    it('warns once for a rule with no JSON Schema equivalent, unless format or pattern is explicit', () => {
      class Untranslated {
        @IsTimeZone() @ToolProp() zone: string;
        @Matches(/^a+$/i) @ToolProp() caseless: string;
        @IsISO8601() @ToolProp({ format: 'date-time' }) start: string;
      }

      classToJsonSchema(Untranslated);
      classToJsonSchema(Untranslated);

      expect(warnings()).toStrictEqual([
        expect.stringContaining(
          'Untranslated.zone: class-validator rule "isTimeZone" has no JSON Schema equivalent',
        ),
        expect.stringContaining(
          'Untranslated.caseless: class-validator rule "matches (regex flags)"',
        ),
      ]);
    });

    it('throws for a property with class-validator decorators but no @ToolProp', () => {
      class Forgotten {
        @ToolProp() kept: string;
        @IsInt() @Min(1) dropped: number;
      }

      expect(() => classToJsonSchema(Forgotten)).toThrow(
        'Forgotten.dropped: has class-validator decorators but no @ToolProp',
      );
    });
  });

  describe('arrays and nesting', () => {
    it('reports an array without an item type when the schema is generated, not at load', () => {
      class NoItems {
        @ToolProp() tags: string[];
      }

      expect(() => classToJsonSchema(NoItems)).toThrow('NoItems.tags: an array needs an item type');
    });

    it('accepts the explicit-object workaround for a self-reference', () => {
      class LinkedNode {
        @ToolProp() label: string;
        @ToolProp({ type: 'object', isOptional: true }) next?: LinkedNode;
        @ToolProp({ items: { type: 'object' }, isOptional: true }) children?: LinkedNode[];
      }

      expect(classToJsonSchema(LinkedNode).properties).toStrictEqual({
        label: { type: 'string' },
        next: { type: 'object' },
        children: { type: 'array', items: { type: 'object' } },
      });
    });

    it('follows override paths through a nullable nested object', () => {
      class Child {
        @ToolProp() name: string;
      }
      class Parent {
        @ToolProp({ nullable: true }) child: Child;
      }
      class Root {
        @ToolProp() parent: Parent;
      }

      const schema = classToJsonSchema(Root, {
        propertyOverrides: { 'parent.child.name': { description: 'child name' } },
      });
      expect((schema.properties.parent.properties as any).child).toStrictEqual({
        type: ['object', 'null'],
        properties: { name: { type: 'string', description: 'child name' } },
        required: ['name'],
      });
    });

    it('rejects a class that refers to itself', () => {
      expect(() => {
        class Node {
          @ToolProp() label: string;
          @ToolProp({ items: { type: Node } }) children: Node[];
        }
        return Node;
      }).toThrow('Node.children refers to its own class');
    });
  });

  describe('enums', () => {
    it('derives the type from every value', () => {
      class Enums {
        @ToolProp({ enum: [true, false] }) flag: boolean;
        @ToolProp({ enum: ['a', 2] }) mixed: string | number;
        @ToolProp({ enum: [1, 2] }) level: number;
      }

      expect(classToJsonSchema(Enums).properties).toStrictEqual({
        flag: { type: 'boolean', enum: [true, false] },
        mixed: { type: ['string', 'number'], enum: ['a', 2] },
        level: { type: 'number', enum: [1, 2] },
      });
    });
  });

  it('keeps nested properties and the Date format when the matching type is explicit', () => {
    class Leaf {
      @ToolProp() x: string;
    }
    class ExplicitMatchingTypes {
      @ToolProp({ type: 'object', description: 'leaf' }) leaf: Leaf;
      @ToolProp({ type: 'string' }) when: Date;
    }

    expect(classToJsonSchema(ExplicitMatchingTypes).properties).toStrictEqual({
      leaf: {
        type: 'object',
        description: 'leaf',
        properties: { x: { type: 'string' } },
        required: ['x'],
      },
      when: { type: 'string', format: 'date-time' },
    });
  });

  describe('closed objects', () => {
    class Inner {
      @ToolProp() x: string;
    }
    class Outer {
      @ToolProp() inner: Inner;
      @ToolProp({ items: { type: Inner } }) list: Inner[];
    }

    it('adds additionalProperties: false at every level when asked', () => {
      const schema = classToJsonSchema(Outer, { additionalProperties: false });

      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.inner.additionalProperties).toBe(false);
      expect((schema.properties.list.items as any).additionalProperties).toBe(false);
      expect(classToJsonSchema(Outer).additionalProperties).toBeUndefined();
    });

    it('passes the option through the provider formats', () => {
      expect(
        classToOpenAITool(Outer, { additionalProperties: false }).function.parameters
          .additionalProperties,
      ).toBe(false);
      expect(
        classToAnthropicTool(Outer, { additionalProperties: false }).input_schema
          .additionalProperties,
      ).toBe(false);
      expect(
        classToGeminiTool(Outer, { additionalProperties: false }).parameters.properties.inner,
      ).not.toHaveProperty('additionalProperties');
    });
  });

  it('updateSchemaProperty counts as explicit', () => {
    class Updated {
      @IsInt() @ToolProp() n: number;
    }
    updateSchemaProperty(Updated, 'n', { type: 'number' });

    expect(classToJsonSchema(Updated).properties.n).toStrictEqual({ type: 'number' });
  });
});
