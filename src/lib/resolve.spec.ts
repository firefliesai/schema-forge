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
  addSchemaProperty,
  classToAnthropicTool,
  classToGeminiTool,
  classToJsonSchema,
  classToOpenAITool,
  findUndeclaredValidatedProperties,
  ToolProp,
  updateSchemaProperty,
} from './index';
import { DEFERRED_UPDATES_METADATA_KEY, makeNullable } from './resolve';

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

    it('can be turned off on a property of a nested class', () => {
      class NullableLeaf {
        @ToolProp({ type: 'string', nullable: true }) name: string | null;
        @ToolProp({ enum: Color, nullable: true }) color: Color | null;
      }
      class NullableHolder {
        @ToolProp() leaf: NullableLeaf;
      }

      const leaf = classToJsonSchema(NullableHolder, {
        propertyOverrides: {
          'leaf.name': { nullable: false },
          'leaf.color': { nullable: false },
        },
      }).properties.leaf;
      expect(leaf.properties).toStrictEqual({
        name: { type: 'string' },
        color: { type: 'string', enum: ['red', 'blue'] },
      });
    });

    it('keeps null when an override replaces a nullable nested property', () => {
      class Mood {
        @ToolProp({ enum: Color, nullable: true }) color: Color | null;
        @ToolProp({ type: 'string', nullable: true }) note: string | null;
      }
      class Person {
        @ToolProp() mood: Mood;
      }
      class Recorded {
        @ToolProp() mood: Mood;
      }
      updateSchemaProperty(Recorded, 'mood.color', { enum: ['red'] });

      const viaOverride = classToJsonSchema(Person, {
        propertyOverrides: {
          'mood.color': { enum: ['red'] },
          'mood.note': { type: 'string', maxLength: 5 },
        },
      }).properties.mood.properties;
      // toEqual: a nested enum update leaves `description: undefined` (dropped from JSON)
      expect(viaOverride.color).toEqual({ type: ['string', 'null'], enum: ['red', null] });
      expect(viaOverride.note).toStrictEqual({ type: ['string', 'null'], maxLength: 5 });
      expect(classToJsonSchema(Recorded).properties.mood.properties.color).toEqual({
        type: ['string', 'null'],
        enum: ['red', null],
      });
      // nullable: false in the same update still removes it
      expect(
        classToJsonSchema(Person, {
          propertyOverrides: { 'mood.note': { type: 'string', nullable: false } },
        }).properties.mood.properties.note,
      ).toStrictEqual({ type: 'string' });
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

    it('adds no null branch to a oneOf whose branch already accepts null', () => {
      const schema: Record<string, any> = {
        oneOf: [{ type: ['string', 'null'] }, { type: 'number' }],
      };
      makeNullable(schema);

      // a second branch accepting null would make null match two oneOf branches
      expect(schema).toStrictEqual({ oneOf: [{ type: ['string', 'null'] }, { type: 'number' }] });
    });

    it('wraps a $ref, which a null type or branch cannot open up', () => {
      const schema: Record<string, any> = { $ref: '#/$defs/Address', description: 'Where' };
      makeNullable(schema);

      expect(schema).toStrictEqual({
        description: 'Where',
        anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }],
      });
    });

    it('wraps an anyOf with a null branch when a sibling allOf still rejects null', () => {
      // Sibling keywords all apply: the anyOf's null branch does not let null through the allOf
      const schema: Record<string, any> = {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        allOf: [{ type: 'string', minLength: 1 }],
      };
      makeNullable(schema);

      expect(schema).toStrictEqual({
        anyOf: [
          {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            allOf: [{ type: 'string', minLength: 1 }],
          },
          { type: 'null' },
        ],
      });
    });

    it('leaves a schema that nothing makes reject null as it is', () => {
      const schemas: Record<string, any>[] = [
        { oneOf: [{ minLength: 2 }, { type: 'number' }] },
        { type: ['string', 'null'], allOf: [{ minLength: 1 }] },
        // `true` as a branch accepts every value
        { oneOf: [true, { type: 'number' }] },
      ];
      for (const schema of schemas) {
        const before = JSON.parse(JSON.stringify(schema));
        makeNullable(schema);
        expect(schema).toStrictEqual(before);
      }
    });

    it('counts a false branch as rejecting null', () => {
      // `false` is a whole schema that rejects every value
      const schema: Record<string, any> = { anyOf: [false, { type: 'string' }] };
      makeNullable(schema);

      expect(schema).toStrictEqual({ anyOf: [false, { type: 'string' }, { type: 'null' }] });
    });

    it('becomes nullable: true in the Gemini formats', () => {
      class GeminiNullable {
        @ToolProp({ enum: Color, nullable: true }) color: Color | null;
        @ToolProp({ anyOf: [{ type: 'string' }], nullable: true }) single: unknown;
        @ToolProp({ anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true })
        pair: unknown;
        @ToolProp({ enum: ['a', 2], nullable: true }) mixed: string | number | null;
      }

      expect(classToGeminiTool(GeminiNullable).parameters.properties).toStrictEqual({
        color: { type: 'string', enum: ['red', 'blue'], nullable: true },
        single: { type: 'string', nullable: true },
        pair: { anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true },
        mixed: {
          anyOf: [
            { type: 'string', enum: ['a'] },
            // Gemini accepts only string enum values; the rest is kept in the description
            { type: 'number', description: '{enum: [2]}' },
          ],
          nullable: true,
        },
      });
    });

    it('gives Gemini only the bounds and enums it accepts', () => {
      class GeminiBounds {
        @IsInt() @IsPositive() @ToolProp() count: number;
        @IsInt() @IsNegative() @Min(-9) @ToolProp() delta: number;
        @IsPositive() @ToolProp() ratio: number;
        @ToolProp({ enum: [1, 2] }) level: number;
      }

      expect(classToGeminiTool(GeminiBounds).parameters.properties).toStrictEqual({
        count: { type: 'integer', minimum: 1 },
        delta: { type: 'integer', minimum: -9, maximum: -1 },
        ratio: { type: 'number', description: '{exclusiveMinimum: 0}' },
        level: { type: 'number', description: '{enum: [1,2]}' },
      });
      expect(classToJsonSchema(GeminiBounds).properties.count).toStrictEqual({
        type: 'integer',
        exclusiveMinimum: 0,
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
        // Gemini rejects `examples`; its value is moved as it is
        description: '{examples: [{"additionalProperties":1}]}',
      });
    });

    it('moves the fields Gemini rejects into the description and keeps the ones it accepts', () => {
      class GeminiFields {
        @IsDivisibleBy(5) @ToolProp() step: number;
        @ToolProp({ type: 'array', items: { type: 'string' }, uniqueItems: true } as any)
        tags: string[];
        @ToolProp({ type: 'string', description: 'Old', deprecated: true, readOnly: true } as any)
        legacy: string;
        @ToolProp({ const: 'fixed' } as any) fixed: string;
        @ToolProp({ const: 3 } as any) three: number;
        @ToolProp({ const: 3, nullable: true, description: 'Three' } as any) threeOrNull: number;
        @ToolProp({ enum: ['', 'a'] }) blank: string;
        @ToolProp({
          oneOf: [{ type: 'string' }, { type: 'integer' }],
          not: { enum: ['x'] },
          title: 'Either',
          example: 'a',
        } as any)
        either: unknown;
        @ToolProp({ allOf: [{ type: 'string', minLength: 1, pattern: '^a' }] } as any)
        both: string;
      }

      expect(classToGeminiTool(GeminiFields).parameters.properties).toStrictEqual({
        step: { type: 'number', description: '{multipleOf: 5}' },
        tags: { type: 'array', items: { type: 'string' }, description: '{uniqueItems: true}' },
        legacy: { type: 'string', description: 'Old\n\n{deprecated: true, readOnly: true}' },
        fixed: { type: 'string', enum: ['fixed'] },
        three: { description: '{const: 3}' },
        // the description outside the null wrapper and the note from inside it are both kept
        threeOrNull: { description: 'Three\n\n{const: 3}', nullable: true },
        blank: { type: 'string', description: '{enum: ["","a"]}' },
        either: {
          oneOf: [{ type: 'string' }, { type: 'integer' }],
          not: { enum: ['x'] },
          title: 'Either',
          example: 'a',
        },
        both: { allOf: [{ type: 'string', minLength: 1, pattern: '^a' }] },
      });
    });

    it('throws for a type array next to an anyOf, which Gemini cannot express', () => {
      // Only a hand-written schema has this shape: nullable never puts an anyOf next to a type
      class Inner {
        @ToolProp({
          type: ['string', 'number'],
          anyOf: [
            { type: 'string', pattern: '^a' },
            { type: 'integer', minimum: 10 },
          ],
        } as any)
        value: string | number;
      }
      class GeminiTypeArrayAndAnyOf {
        @ToolProp() inner: Inner;
      }

      expect(() => classToGeminiTool(GeminiTypeArrayAndAnyOf)).toThrow(
        'schema-forge: Gemini cannot express "inner.value": it has a type array (["string","number"]) next to an anyOf',
      );
      // The plain JSON Schema keeps both, as written
      expect(classToJsonSchema(Inner).properties.value.type).toStrictEqual(['string', 'number']);
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

    it('applies @IsNotEmpty({ each: true }) to string items and keeps multipleOf positive', () => {
      class EachNotEmpty {
        @IsString({ each: true }) @IsNotEmpty({ each: true }) @ToolProp() names: string[];
        @IsDivisibleBy(-2) @ToolProp() even: number;
        @IsDivisibleBy(0) @ToolProp() zero: number;
      }

      expect(classToJsonSchema(EachNotEmpty).properties).toStrictEqual({
        names: { type: 'array', items: { type: 'string', minLength: 1 } },
        even: { type: 'number', multipleOf: 2 },
        zero: { type: 'number' },
      });
      expect(warnings()).toStrictEqual([
        expect.stringContaining('EachNotEmpty.zero: class-validator rule "isDivisibleBy"'),
      ]);
    });

    it('types array items from each: true rules that only one type can satisfy', () => {
      class EachBounds {
        @Min(1, { each: true }) @ToolProp() counts: number[];
        @MaxLength(3, { each: true }) @ToolProp() codes: string[];
      }

      // class-validator's numeric rules reject non-numbers and its length rules reject
      // non-strings, so the item type is the one both the schema and the validator accept
      expect(classToJsonSchema(EachBounds).properties).toStrictEqual({
        counts: { type: 'array', items: { type: 'number', minimum: 1 } },
        codes: { type: 'array', items: { type: 'string', maxLength: 3 } },
      });
    });

    it('still asks for an item type when each: true rules mix numbers and strings', () => {
      class EachMixed {
        @Min(1, { each: true }) @MaxLength(3, { each: true }) @ToolProp() values: unknown[];
      }

      expect(() => classToJsonSchema(EachMixed)).toThrow(
        'EachMixed.values: an array needs an item type',
      );
    });

    it('combines @IsNotEmpty with a lower length bound as the stricter one', () => {
      class NotEmptyBounds {
        @IsString() @IsNotEmpty() @MinLength(0) @ToolProp() name: string;
        @IsString({ each: true })
        @IsNotEmpty({ each: true })
        @MinLength(0, { each: true })
        @ToolProp()
        tags: string[];
        @IsNotEmpty() @ToolProp({ minLength: 0 }) explicitZero: string;
        @IsNotEmpty({ each: true })
        @ToolProp({ items: { type: 'string', minLength: 0 } })
        explicitItems: string[];
      }

      expect(classToJsonSchema(NotEmptyBounds).properties).toStrictEqual({
        name: { type: 'string', minLength: 1 },
        tags: { type: 'array', items: { type: 'string', minLength: 1 } },
        explicitZero: { type: 'string', minLength: 0 },
        explicitItems: { type: 'array', items: { type: 'string', minLength: 0 } },
      });
      expect(warnings()).toStrictEqual([
        expect.stringContaining('NotEmptyBounds.explicitZero: minLength 0 from @ToolProp is kept'),
        expect.stringContaining(
          'NotEmptyBounds.explicitItems: items.minLength 0 from @ToolProp is kept',
        ),
      ]);
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

    it('leaves out a validated property without @ToolProp, in a class and in a nested class', () => {
      class SharedBookingDto {
        @ToolProp() @IsString() title: string;
        @IsInt() ownerId: number;
      }
      class BookingToolInput {
        @ToolProp() booking: SharedBookingDto;
        @IsInt() @Min(1) internalPriority: number;
      }

      expect(classToJsonSchema(BookingToolInput)).toStrictEqual({
        type: 'object',
        properties: {
          booking: {
            type: 'object',
            properties: { title: { type: 'string' } },
            required: ['title'],
          },
        },
        required: ['booking'],
      });
      expect(warnings()).toStrictEqual([]);
    });

    it('throws when a class has validated properties but no @ToolProp at all', () => {
      // What PickType / OmitType / PartialType produce from a @ToolProp class
      class CopiedWithoutToolProp {
        @IsString() title: string;
        @IsInt() count: number;
      }
      class NoValidatedProperties {}

      expect(() => classToJsonSchema(CopiedWithoutToolProp)).toThrow(
        'CopiedWithoutToolProp: title, count have class-validator decorators, but the class ' +
          'declares no property with @ToolProp',
      );
      expect(classToJsonSchema(NoValidatedProperties)).toStrictEqual({
        type: 'object',
        properties: {},
      });
    });

    it('lists validated properties without @ToolProp through findUndeclaredValidatedProperties', () => {
      class Line {
        @ToolProp() @IsString() sku: string;
        @IsInt() costCents: number;
      }
      class Customer {
        @ToolProp() @IsString() name: string;
        @IsEmail() email: string;
      }
      class Order {
        @ToolProp() @IsString() id: string;
        @IsString() ownerId: string;
        @ToolProp({ items: { type: Line } }) lines: Line[];
        @ToolProp() customer: Customer;
      }

      expect(findUndeclaredValidatedProperties(Order)).toStrictEqual([
        { path: 'ownerId', className: 'Order', property: 'ownerId' },
        { path: 'lines.costCents', className: 'Line', property: 'costCents' },
        { path: 'customer.email', className: 'Customer', property: 'email' },
      ]);
    });

    it('reports a nested class once per path that reaches it', () => {
      class Address {
        @ToolProp() @IsString() street: string;
        @IsString() postcode: string;
      }
      class Shipment {
        @ToolProp() billing: Address;
        @ToolProp() shipping: Address;
      }

      expect(findUndeclaredValidatedProperties(Shipment).map(({ path }) => path)).toStrictEqual([
        'billing.postcode',
        'shipping.postcode',
      ]);
    });
  });

  describe('arrays and nesting', () => {
    it('reports an array without an item type when the schema is generated, not at load', () => {
      class NoItems {
        @ToolProp() tags: string[];
      }

      expect(() => classToJsonSchema(NoItems)).toThrow('NoItems.tags: an array needs an item type');
    });

    it('takes a composition on an array property as given, without forcing type or items', () => {
      const branches = [{ type: 'array', items: { type: 'string' } }, { type: 'null' }];
      class Composed {
        @ToolProp({ anyOf: branches }) values: string[];
        @ToolProp({ type: 'array', anyOf: [{ maxItems: 2 }], items: { type: 'string' } })
        pair: string[];
      }

      expect(classToJsonSchema(Composed).properties).toStrictEqual({
        values: { anyOf: branches },
        pair: { type: 'array', anyOf: [{ maxItems: 2 }], items: { type: 'string' } },
      });
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

    it('rejects a class that refers to itself when its schema is generated', () => {
      class Node {
        @ToolProp() label: string;
        @ToolProp({ items: { type: Node } }) children: Node[];
      }

      expect(() => classToJsonSchema(Node)).toThrow(
        /Node:\n {2}- Node\.children refers to its own class\. Recursive classes are not supported/,
      );
    });

    it('applies a nested enum override to the items of an array target, whatever the parent', () => {
      class Line {
        @ToolProp({ items: { type: 'string' } }) tags: string[];
      }
      class ObjectParent {
        @ToolProp() line: Line;
      }
      class ArrayParent {
        @ToolProp({ items: { type: Line } }) lines: Line[];
      }

      const viaObject = classToJsonSchema(ObjectParent, {
        propertyOverrides: { 'line.tags': { enum: ['a', 'b'] } },
      }).properties.line.properties.tags;
      const viaArray = classToJsonSchema(ArrayParent, {
        propertyOverrides: { 'lines.tags': { enum: ['a', 'b'] } },
      }).properties.lines.items as any;
      expect(viaArray.properties.tags).toBeDefined();
      expect(viaObject).toStrictEqual({
        type: 'array',
        items: { type: 'string', enum: ['a', 'b'] },
      });
      expect(viaArray.properties.tags).toStrictEqual(viaObject);
    });

    it('keeps or removes null on a path into an object declared inline', () => {
      // A path into a nested class is applied while that class is built; a path into an object
      // declared inline (no class) goes through the nested-path update instead
      class InlineHolder {
        @ToolProp({
          type: 'object',
          properties: { mode: { type: ['string', 'null'] }, note: { type: ['string', 'null'] } },
        } as any)
        inline: Record<string, unknown>;
        @ToolProp({ type: ['object', 'null'], properties: { x: { type: 'string' } } } as any)
        maybe: Record<string, unknown> | null;
      }

      const schema = classToJsonSchema(InlineHolder, {
        propertyOverrides: {
          'inline.mode': { enum: ['a'] },
          'inline.note': { description: 'Note', nullable: false },
          'maybe.x': { maxLength: 5 },
        } as any,
      });
      const inline = schema.properties.inline.properties;
      // toEqual: a nested enum update leaves `description: undefined` (dropped from JSON)
      expect(inline.mode).toEqual({ type: ['string', 'null'], enum: ['a', null] });
      expect(inline.note).toStrictEqual({ type: 'string', description: 'Note' });
      // a path also reaches into an object that accepts null
      expect(schema.properties.maybe.properties.x).toStrictEqual({ type: 'string', maxLength: 5 });
    });

    it('keeps an array an array for an enum update when its design type is Object', () => {
      class Tagged {}
      // What TypeScript records for `tags: string[] | null` under strictNullChecks
      Reflect.defineMetadata('design:type', Object, Tagged.prototype, 'tags');
      ToolProp({ items: { type: ['string', 'null'] } as any, nullable: true })(
        Tagged.prototype,
        'tags',
      );
      class TaggedHolder {
        @ToolProp() tagged: Tagged;
      }

      // The items keep accepting null, as the array does
      const expected = {
        type: ['array', 'null'],
        items: { type: ['string', 'null'], enum: ['a', null] },
      };
      expect(
        classToJsonSchema(Tagged, { propertyOverrides: { tags: { enum: ['a'] } } }).properties.tags,
      ).toStrictEqual(expected);
      expect(
        classToJsonSchema(TaggedHolder, {
          propertyOverrides: { 'tagged.tags': { enum: ['a'] } } as any,
        }).properties.tagged.properties.tags,
      ).toStrictEqual(expected);
    });

    it('applies nullable in a nested enum override to the array target, not its items', () => {
      class Line {
        @ToolProp({ items: { type: 'string' } }) tags: string[];
        @ToolProp({ items: { type: 'string' }, nullable: true }) labels: string[] | null;
      }
      class Holder {
        @ToolProp() line: Line;
      }

      const line = classToJsonSchema(Holder, {
        propertyOverrides: {
          'line.tags': { enum: ['a'], nullable: true },
          'line.labels': { enum: ['b'], nullable: false },
        },
      }).properties.line.properties;
      expect(line.tags).toStrictEqual({
        type: ['array', 'null'],
        items: { type: 'string', enum: ['a'] },
      });
      expect(line.labels).toStrictEqual({ type: 'array', items: { type: 'string', enum: ['b'] } });
    });

    describe('updates see through the anyOf a nullable composition is wrapped in', () => {
      // `nullable: true` beside `allOf` cannot add "null" to `type`, so the property's schema
      // becomes `anyOf: [<schema>, { type: 'null' }]`. Updates that reach it must find the array,
      // the object or the value inside that wrapper.
      class WrappedLine {
        @ToolProp({ items: { type: 'string' }, allOf: [{ minItems: 1 }], nullable: true })
        tags: string[] | null;
        @ToolProp({
          type: 'string',
          allOf: [{ minLength: 1 }],
          nullable: true,
          description: 'Mode',
        })
        mode: string | null;
      }
      class WrappedLineHolder {
        @ToolProp() line: WrappedLine;
      }

      it('applies a nested enum override to the items of a wrapped array', () => {
        const line = classToJsonSchema(WrappedLineHolder, {
          propertyOverrides: { 'line.tags': { enum: ['a'] } },
        }).properties.line.properties;
        expect(line.tags).toStrictEqual({
          anyOf: [
            { type: 'array', items: { type: 'string', enum: ['a'] }, allOf: [{ minItems: 1 }] },
            { type: 'null' },
          ],
        });

        const notNull = classToJsonSchema(WrappedLineHolder, {
          propertyOverrides: { 'line.tags': { enum: ['a'], nullable: false } },
        }).properties.line.properties;
        expect(notNull.tags).toStrictEqual({
          type: 'array',
          items: { type: 'string', enum: ['a'] },
          allOf: [{ minItems: 1 }],
        });
      });

      it('replaces the value inside the wrapper and keeps null, for an enum or a type', () => {
        const line = classToJsonSchema(WrappedLineHolder, {
          propertyOverrides: { 'line.mode': { enum: ['a', 'b'] } },
        }).properties.line.properties;
        expect(line.mode).toStrictEqual({
          description: 'Mode',
          anyOf: [
            { type: 'string', enum: ['a', 'b'], allOf: [{ minLength: 1 }] },
            { type: 'null' },
          ],
        });

        const typed = classToJsonSchema(WrappedLineHolder, {
          propertyOverrides: { 'line.mode': { type: 'string', maxLength: 10 } },
        }).properties.line.properties;
        expect(typed.mode).toStrictEqual({
          description: 'Mode',
          anyOf: [{ type: 'string', allOf: [{ minLength: 1 }], maxLength: 10 }, { type: 'null' }],
        });
      });

      it('walks into the item class of a wrapped array, for overrides and added properties', () => {
        class WrappedItem {
          @ToolProp({ type: 'string' }) name: string;
          @ToolProp({ items: { type: 'string' } }) tags: string[];
        }
        class WrappedGroup {
          @ToolProp({ items: { type: WrappedItem }, allOf: [{ minItems: 1 }], nullable: true })
          entries: WrappedItem[] | null;
        }
        class WrappedRoot {
          @ToolProp() group: WrappedGroup;
        }
        addSchemaProperty(WrappedRoot, 'group.entries.extra', { type: 'string' });

        const entries = classToJsonSchema(WrappedRoot, {
          propertyOverrides: {
            'group.entries.tags': { enum: ['x'] },
            'group.entries.name': { maxLength: 5 },
          },
        }).properties.group.properties.entries as any;
        // The wrapper is untouched: no properties beside it, still an array or null
        expect(Object.keys(entries)).toEqual(['anyOf']);
        expect(entries.anyOf[1]).toStrictEqual({ type: 'null' });
        const item = entries.anyOf[0];
        expect(item.type).toBe('array');
        expect(item.allOf).toStrictEqual([{ minItems: 1 }]);
        expect(item.items.properties.tags).toStrictEqual({
          type: 'array',
          items: { type: 'string', enum: ['x'] },
        });
        expect(item.items.properties.name).toStrictEqual({ type: 'string', maxLength: 5 });
        expect(item.items.properties.extra).toEqual({ type: 'string' });
      });

      it('walks into a wrapped item schema', () => {
        class WrappedItems {
          @ToolProp({
            items: {
              anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'null' }],
            } as any,
          })
          list: unknown[];
        }
        class WrappedItemsHolder {
          @ToolProp() owner: WrappedItems;
        }

        const list = classToJsonSchema(WrappedItemsHolder, {
          propertyOverrides: { 'owner.list.a': { maxLength: 3 } } as any,
        }).properties.owner.properties.list as any;
        expect(list.items).toStrictEqual({
          anyOf: [
            { type: 'object', properties: { a: { type: 'string', maxLength: 3 } } },
            { type: 'null' },
          ],
        });
      });

      it('names the array when a path reaches into one without items', () => {
        // The items come from class-validator only when a schema is generated, so an update of
        // the stored metadata finds none and must not invent them
        class NoItems {
          @IsString({ each: true })
          @ToolProp()
          tags: string[];
        }

        expect(() => updateSchemaProperty(NoItems, 'tags.name' as any, { maxLength: 2 })).toThrow(
          /cannot reach into "tags": it is an array without `items`/,
        );
        expect(() => addSchemaProperty(NoItems, 'tags.extra', { type: 'string' })).toThrow(
          /cannot reach into "tags": it is an array without `items`/,
        );
        // The class still generates, with its items inferred
        expect(classToJsonSchema(NoItems).properties.tags).toStrictEqual({
          type: 'array',
          items: { type: 'string' },
        });
      });
    });
  });

  describe('nested classes are built and checked only for a schema that reaches them', () => {
    // A class library may put @ToolProp on every field of every model (for example a shared field
    // decorator); models that no tool schema uses must not break the import.
    const defineModels = () => {
      class ValidatedOnly {
        @IsString() id: string;
      }
      class Untyped {
        @ToolProp() value: string | number;
      }
      class NoItems {
        @ToolProp() tags: string[];
      }
      class Tree {
        @ToolProp() label: string;
        @ToolProp({ items: { type: Tree }, isOptional: true }) children?: Tree[];
      }
      class Profile {
        @ToolProp() owner: ValidatedOnly;
        @ToolProp() score: Untyped;
        @ToolProp({ items: { type: NoItems } }) groups: NoItems[];
        @ToolProp() tree: Tree;
      }
      class Fine {
        @ToolProp() name: string;
      }
      class Tool {
        @ToolProp() name: string;
        @ToolProp() profile: Profile;
        @ToolProp({ nullable: true }) note: string | number;
      }
      return { Profile, Tool, Fine };
    };

    it('never throws while classes are defined', () => {
      expect(defineModels).not.toThrow();
    });

    it('reports every problem of every reached class in one error, with its path', () => {
      const { Tool } = defineModels();

      expect(() => classToJsonSchema(Tool)).toThrow(
        'schema-forge: cannot generate a JSON Schema for Tool:\n' +
          '  - Tool.profile → Profile.owner → ValidatedOnly: id has class-validator decorators, ' +
          'but the class ' +
          'declares no property with @ToolProp',
      );
      const message = (() => {
        try {
          classToJsonSchema(Tool);
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message.split('\n').map((line) => line.split(':')[0])).toStrictEqual([
        'schema-forge',
        '  - Tool.profile → Profile.owner → ValidatedOnly',
        '  - Tool.profile → Profile.score → Untyped.value',
        '  - Tool.profile → Profile.groups → NoItems.tags',
        '  - Tool.profile → Profile.tree → Tree.children refers to its own class. Recursive classes are not supported; describe the field explicitly (e.g. type',
        '  - Tool.note',
      ]);
    });

    it('leaves a schema that does not reach a broken class alone', () => {
      const { Fine } = defineModels();

      expect(classToJsonSchema(Fine)).toStrictEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
    });

    it('lets an update or override of a nested property give it the type it lacks', () => {
      class Reading {
        @ToolProp() value: string | number;
        @ToolProp() unit: string;
      }
      class Sensor {
        @ToolProp() reading: Reading;
      }
      class Station {
        @ToolProp() sensor: Sensor;
      }
      class Logged {
        @ToolProp() reading: Reading;
      }

      // Without a type, every class that reaches Reading.value fails
      expect(() => classToJsonSchema(Station)).toThrow(
        'Station.sensor → Sensor.reading → Reading.value',
      );

      // An override two levels down repairs it, for this call only
      const repaired = classToJsonSchema(Station, {
        propertyOverrides: { 'sensor.reading.value': { type: 'number', nullable: true } } as any,
      });
      expect(repaired.properties.sensor.properties.reading).toStrictEqual({
        type: 'object',
        properties: { value: { type: ['number', 'null'] }, unit: { type: 'string' } },
        required: ['value', 'unit'],
      });
      expect(() => classToJsonSchema(Station)).toThrow('Reading.value');

      // A recorded update repairs it for every schema of that class, and not for Reading itself
      updateSchemaProperty(Logged, 'reading.value', { type: 'string', description: 'Raw' });
      expect(classToJsonSchema(Logged).properties.reading.properties.value).toStrictEqual({
        type: 'string',
        description: 'Raw',
      });
      expect(() => classToJsonSchema(Reading)).toThrow('Reading.value');
    });

    it('does not build a nested class that an override replaces, however deep', () => {
      class Broken {
        @ToolProp() value: string | number;
      }
      class Middle {
        @ToolProp() broken: Broken;
      }
      class Top {
        @ToolProp() middle: Middle;
      }

      expect(
        classToJsonSchema(Top, {
          propertyOverrides: { 'middle.broken': { type: 'string' } } as any,
        }).properties.middle.properties.broken,
      ).toStrictEqual({ type: 'string' });
    });

    it('rejects a class that refers back to itself through another class', () => {
      class Team {
        @ToolProp() name: string;
      }
      class Member {
        @ToolProp() name: string;
        @ToolProp() team: Team;
      }
      // The back reference can only be added once both classes exist
      ToolProp({ items: { type: Member } })(Team.prototype, 'members');

      expect(() => classToJsonSchema(Member)).toThrow(
        /Member:\n {2}- Member\.team → Team\.members refers back to Member, which contains it\./,
      );
      expect(() => classToJsonSchema(Team)).toThrow(
        /Team:\n {2}- Team\.members → Member\.team refers back to Team, which contains it\./,
      );
    });

    it('accepts an explicit object type for a reference back through another class', () => {
      class Folder {
        @ToolProp() name: string;
      }
      class File {
        @ToolProp() name: string;
        @ToolProp() folder: Folder;
      }
      // What TypeScript would record for `firstFile?: File`, then the decorator
      Reflect.defineMetadata('design:type', File, Folder.prototype, 'firstFile');
      ToolProp({ type: 'object', isOptional: true })(Folder.prototype, 'firstFile');

      // Nested, but a free-form object where it would recurse
      expect(classToJsonSchema(File).properties.folder).toStrictEqual({
        type: 'object',
        properties: { name: { type: 'string' }, firstFile: { type: 'object' } },
        required: ['name'],
      });
      // From Folder, the reference back is File.folder, which has no explicit type
      expect(() => classToJsonSchema(Folder)).toThrow(
        'Folder.firstFile → File.folder refers back to Folder, which contains it.',
      );
    });

    it('applies updates into nested classes when the schema is generated, in order', () => {
      class Address {
        @ToolProp() city: string;
      }
      class Line {
        @ToolProp() sku: string;
      }
      class Order {
        @ToolProp() address: Address;
        @ToolProp({ items: { type: Line } }) lines: Line[];
      }

      updateSchemaProperty(Order, 'address.city', { description: 'City' });
      updateSchemaProperty(Order, 'lines.sku', { enum: ['a', 'b'] });
      addSchemaProperty(Order, 'address.zip', { type: 'string', isOptional: true });
      // A path added by addSchemaProperty is not in the class's type
      updateSchemaProperty(Order, 'address.zip' as 'address.city', { description: 'Postcode' });
      updateSchemaProperty(Order, 'address', { description: 'Where to ship' });

      class RushOrder extends Order {
        @ToolProp() rush: boolean;
      }
      // Made after RushOrder was defined, and RushOrder still gets it, as in 2.x
      updateSchemaProperty(Order, 'address.city', { description: 'Town' });

      const expected = (cityDescription: string): Record<string, unknown> => ({
        address: {
          type: 'object',
          description: 'Where to ship',
          properties: {
            city: { type: 'string', description: cityDescription },
            zip: { type: 'string', description: 'Postcode' },
          },
          required: ['city'],
        },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { sku: { type: 'string', enum: ['a', 'b'] } },
            required: ['sku'],
          },
        },
      });
      // toEqual: a nested enum update leaves `description: undefined` (dropped from JSON)
      expect(classToJsonSchema(Order).properties).toEqual(expected('Town'));
      expect(classToJsonSchema(RushOrder).properties).toEqual({
        ...expected('Town'),
        rush: { type: 'boolean' },
      });
      // The nested class itself is untouched
      expect(classToJsonSchema(Address).properties).toStrictEqual({ city: { type: 'string' } });
    });

    it('does not build a nested class that an override describes as another type', () => {
      class ValidatedOnly {
        @IsString() id: string;
      }
      class Holder {
        @ToolProp() ref: ValidatedOnly;
        @ToolProp({ items: { type: ValidatedOnly } }) refs: ValidatedOnly[];
        @ToolProp() choice: ValidatedOnly;
      }
      class RecordedHolder {
        @ToolProp() ref: ValidatedOnly;
      }
      updateSchemaProperty(RecordedHolder, 'ref', { type: 'string' });

      expect(() => classToJsonSchema(Holder)).toThrow('ValidatedOnly: id has class-validator');
      expect(
        classToJsonSchema(Holder, {
          propertyOverrides: {
            ref: { type: 'string', description: 'The id' },
            refs: { items: { type: 'string' } },
            choice: { enum: ['a', 'b'] },
          },
        }).properties,
      ).toStrictEqual({
        ref: { type: 'string', description: 'The id' },
        refs: { type: 'array', items: { type: 'string' } },
        choice: { type: 'string', enum: ['a', 'b'] },
      });
      expect(classToJsonSchema(RecordedHolder).properties).toStrictEqual({
        ref: { type: 'string' },
      });
    });

    it('records a repeated identical nested update once', () => {
      class Address {
        @ToolProp() city: string;
      }
      class Order {
        @ToolProp() address: Address;
      }
      const recorded = (): unknown[] =>
        Reflect.getOwnMetadata(DEFERRED_UPDATES_METADATA_KEY, Order.prototype);

      for (let i = 0; i < 3; i++) updateSchemaProperty(Order, 'address.city', { description: 'A' });
      expect(recorded()).toHaveLength(1);

      // A different update in between is kept, and so is the repeat after it: replaying them in
      // order is what decides the result
      updateSchemaProperty(Order, 'address.city', { description: 'B' });
      updateSchemaProperty(Order, 'address.city', { description: 'A' });
      expect(recorded()).toHaveLength(3);
      expect(classToJsonSchema(Order).properties.address.properties.city.description).toBe('A');
    });

    it('does not apply a base class update to a subclass property that nests another class', () => {
      class Address {
        @ToolProp() city: string;
      }
      class Coordinates extends Address {
        @ToolProp() lat: number;
      }
      class Place {
        @ToolProp() location: Address;
      }
      updateSchemaProperty(Place, 'location.city', { description: 'City' });
      class GeoPlace extends Place {
        @ToolProp() location: Coordinates;
      }

      // `city` is Coordinates' own (inherited from Address), without Place's description
      expect(classToJsonSchema(GeoPlace).properties.location).toStrictEqual({
        type: 'object',
        properties: { city: { type: 'string' }, lat: { type: 'number' } },
        required: ['city', 'lat'],
      });
      expect((classToJsonSchema(Place).properties.location.properties as any).city).toStrictEqual({
        type: 'string',
        description: 'City',
      });
    });
  });

  describe('properties declared by another copy of the package', () => {
    // A second installed copy (another version, pulled in by a library) creates its own
    // Symbol('jsonSchema'). What its @ToolProp writes looks like this:
    const declareWithOtherCopy = (prototype: object, properties: Record<string, unknown>): void => {
      const otherCopyKey = Symbol('jsonSchema');
      Reflect.defineMetadata(otherCopyKey, properties, prototype);
    };

    it('reports a property only another copy declared, instead of leaving it out', () => {
      class Booking {
        @ToolProp() name: string;
        @IsString() slug: string;
      }
      declareWithOtherCopy(Booking.prototype, {
        name: { type: 'string' },
        slug: { type: 'string' },
      });

      expect(() => classToJsonSchema(Booking)).toThrow(
        'schema-forge: cannot generate a JSON Schema for Booking:\n' +
          '  - Booking: slug was declared by another installed copy of @firefliesai/schema-forge, ' +
          'whose metadata this copy cannot read, so the schema would leave it out. Install a ' +
          "single copy (deduplicate, or force one version with your package manager's " +
          "overrides), or declare it with this copy's @ToolProp.",
      );
    });

    it('says so for a nested class and a base class, and not as missing @ToolProp', () => {
      class Base {
        @IsString() id: string;
      }
      declareWithOtherCopy(Base.prototype, { id: { type: 'string' } });
      class Owner extends Base {}
      class Booking {
        @ToolProp() name: string;
        @ToolProp() owner: Owner;
      }

      const message = (() => {
        try {
          classToJsonSchema(Booking);
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message.split('\n')).toStrictEqual([
        'schema-forge: cannot generate a JSON Schema for Booking:',
        '  - Booking.owner → Owner: id was declared by another installed copy of ' +
          '@firefliesai/schema-forge, whose metadata this copy cannot read, so the schema would ' +
          'leave it out. Install a single copy (deduplicate, or force one version with your ' +
          "package manager's overrides), or declare it with this copy's @ToolProp.",
      ]);
    });

    it('accepts properties that this copy declares too', () => {
      // A field decorator that applies both copies' @ToolProp to the same property
      class Booking {
        @ToolProp({ format: 'email' }) email: string;
      }
      declareWithOtherCopy(Booking.prototype, { email: { type: 'string' } });

      expect(classToJsonSchema(Booking)).toStrictEqual({
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
        required: ['email'],
      });
    });
  });

  describe('property names and paths', () => {
    const unsafe = ['__proto__', 'constructor', 'prototype'];

    it('rejects a path segment that would reach an object prototype, at every entry point', () => {
      class Address {
        @ToolProp() city: string;
      }
      class Target {
        @ToolProp() name: string;
        @ToolProp() address: Address;
      }

      for (const key of unsafe) {
        const message = `"${key}" cannot be used as a property name or path segment`;
        expect(() => updateSchemaProperty(Target, key as 'name', { description: 'x' })).toThrow(
          message,
        );
        expect(() =>
          updateSchemaProperty(Target, `address.${key}` as 'name', { description: 'x' }),
        ).toThrow(message);
        expect(() => addSchemaProperty(Target, key, { type: 'string' })).toThrow(message);
        expect(() => addSchemaProperty(Target, `address.${key}`, { type: 'string' })).toThrow(
          message,
        );
        expect(() =>
          classToJsonSchema(Target, {
            propertyOverrides: { [`name.${key}.polluted`]: { description: 'x' } } as never,
          }),
        ).toThrow(message);
        expect(() =>
          classToJsonSchema(Target, {
            propertyOverrides: { [key]: { description: 'x' } } as never,
          }),
        ).toThrow(message);
      }

      expect(Object.prototype).not.toHaveProperty('description');
      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(Object.prototype).not.toHaveProperty('type');
      // Nothing was recorded or changed by the refused calls
      expect(classToJsonSchema(Target).properties).toStrictEqual({
        name: { type: 'string' },
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      });
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

    it('keeps a class-validator type when @IsIn or @IsEnum supplies the enum', () => {
      class InferredEnums {
        @IsInt() @IsIn([1, 1.5]) @ToolProp() step: number;
        @IsIn([1, 2]) @ToolProp() level: string;
      }

      expect(classToJsonSchema(InferredEnums).properties).toStrictEqual({
        step: { type: 'integer', enum: [1, 1.5] },
        level: { type: 'number', enum: [1, 2] },
      });
    });
  });

  it('does not put a design type beside an explicit composition', () => {
    class Leaf {
      @ToolProp() x: string;
    }
    class Compositions {
      @ToolProp({ anyOf: [{ type: 'string' }, { type: 'number' }] }) when: Date;
      @ToolProp({ oneOf: [{ type: 'string' }, { type: 'object' }] }) leaf: Leaf;
    }

    expect(classToJsonSchema(Compositions).properties).toStrictEqual({
      when: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      leaf: { oneOf: [{ type: 'string' }, { type: 'object' }] },
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

  it('throws when an update names a class, which only @ToolProp can declare', () => {
    // Left in the schema, the class would serialize to nothing: `items: {}`, or no type at all
    class Line {
      @ToolProp() sku: string;
    }
    class OtherLine {
      @ToolProp() code: string;
    }
    class Order {
      @ToolProp({ items: { type: Line } }) lines: Line[];
      @ToolProp({ items: { type: 'string' } }) tags: string[];
      @ToolProp() line: Line;
    }
    const names = /names the class OtherLine, which an update cannot add/;

    for (const overrides of [
      { lines: { items: { type: OtherLine } } },
      { tags: { items: { type: OtherLine } } },
      { line: { type: OtherLine } },
    ]) {
      expect(() => classToJsonSchema(Order, { propertyOverrides: overrides as any })).toThrow(
        names,
      );
    }
    expect(() =>
      updateSchemaProperty(Order, 'lines', { items: { type: OtherLine } } as any),
    ).toThrow(/updateSchemaProperty\(Order, 'lines'\) names the class OtherLine/);
    expect(() =>
      updateSchemaProperty(Order, 'tags', { items: { type: OtherLine } } as any),
    ).toThrow(names);
    expect(() =>
      addSchemaProperty(Order, 'more', { type: 'array', items: { type: OtherLine } } as any),
    ).toThrow(/addSchemaProperty\(Order, 'more'\) names the class OtherLine/);
    // Nothing was recorded, and built-in constructors stay allowed
    updateSchemaProperty(Order, 'tags', { items: { type: Date } } as any);
    expect(classToJsonSchema(Order).properties.tags.items).toStrictEqual({
      type: 'string',
      format: 'date-time',
    });
    expect((classToJsonSchema(Order).properties.lines.items as any).properties).toHaveProperty(
      'sku',
    );
  });

  it('keeps each generation separate from the recorded updates and the overrides', () => {
    class Spot {
      @ToolProp({ type: 'object' }) point: Record<string, unknown>;
      @ToolProp({ type: 'object' }) other: Record<string, unknown>;
    }
    class Map {
      @ToolProp() spot: Spot;
    }
    updateSchemaProperty(Map, 'spot.point', {
      type: 'object',
      properties: { inner: { type: 'object', properties: { v: { type: 'string' } } } },
    } as any);
    const override = {
      'spot.other': {
        type: 'object',
        properties: { w: { type: 'object', properties: { z: { type: 'string' } } } },
      },
    };
    const before = JSON.parse(JSON.stringify(override));

    classToJsonSchema(Map, { additionalProperties: false, propertyOverrides: override as any });
    // The caller's override is not changed by the generation either
    expect(override).toStrictEqual(before);
    // A later call without the option is not closed by the earlier one
    const point = classToJsonSchema(Map).properties.spot.properties.point as any;
    expect(point.properties.inner).toStrictEqual({
      type: 'object',
      properties: { v: { type: 'string' } },
    });
  });

  it('builds the nested class when a later update describes the property as an object again', () => {
    class Inner {
      @ToolProp() v: string;
    }
    class Back {
      @ToolProp() inner: Inner;
    }
    updateSchemaProperty(Back, 'inner', { type: 'string' });
    updateSchemaProperty(Back, 'inner', { type: 'object' });
    expect(classToJsonSchema(Back).properties.inner.properties).toStrictEqual({
      v: { type: 'string' },
    });

    class Restored {
      @ToolProp() inner: Inner;
    }
    updateSchemaProperty(Restored, 'inner', { type: 'string' });
    const restored = classToJsonSchema(Restored, {
      propertyOverrides: { inner: { type: 'object' } } as any,
    }).properties.inner;
    expect(restored.properties).toStrictEqual({ v: { type: 'string' } });
    // and the last one still wins when it replaces
    expect(classToJsonSchema(Restored).properties.inner).toStrictEqual({ type: 'string' });
  });

  it('takes a class given as type as the nested class, also for a nullable one', () => {
    class Place {
      @ToolProp() city: string;
    }
    class Home {
      // As in 2.1.0: the class as `type` next to the same design type
      @ToolProp({ type: Place }) place: Place;
    }
    expect(classToJsonSchema(Home).properties.place).toStrictEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });

    // What TypeScript records for `place: Place | null` under strictNullChecks
    class MaybeHome {}
    Reflect.defineMetadata('design:type', Object, MaybeHome.prototype, 'place');
    ToolProp({ type: Place, nullable: true })(MaybeHome.prototype, 'place');
    expect(classToJsonSchema(MaybeHome).properties.place).toStrictEqual({
      type: ['object', 'null'],
      properties: { city: { type: 'string' } },
      required: ['city'],
    });

    // A class `type` that refers back is still a recursion error, not a free-form object
    class Loop {}
    Reflect.defineMetadata('design:type', Object, Loop.prototype, 'self');
    ToolProp({ type: Loop })(Loop.prototype, 'self');
    expect(() => classToJsonSchema(Loop)).toThrow('Loop.self refers to its own class');
  });

  it('takes a built-in constructor given as type as the JSON Schema type', () => {
    // What TypeScript records for `when: Date | null` under strictNullChecks
    class Event {}
    Reflect.defineMetadata('design:type', Object, Event.prototype, 'when');
    ToolProp({ type: Date, nullable: true })(Event.prototype, 'when');
    Reflect.defineMetadata('design:type', Object, Event.prototype, 'label');
    ToolProp({ type: String as any })(Event.prototype, 'label');
    class Counted {
      @ToolProp() n: number;
      @ToolProp() flag: boolean;
    }
    updateSchemaProperty(Counted, 'n', { type: Number as any });
    addSchemaProperty(Counted, 'on', { type: Boolean as any });

    expect(classToJsonSchema(Event).properties).toStrictEqual({
      when: { type: ['string', 'null'], format: 'date-time' },
      label: { type: 'string' },
    });
    const counted = classToJsonSchema(Counted, {
      propertyOverrides: { flag: { type: Boolean } } as any,
    }).properties;
    expect([counted.n.type, counted.flag.type, counted.on.type]).toStrictEqual([
      'number',
      'boolean',
      'boolean',
    ]);
  });

  it('addSchemaProperty keeps every option it is given', () => {
    class Added {
      @ToolProp() id: string;
    }
    const anyOf = [{ type: 'string' }, { type: 'null' }];
    addSchemaProperty(Added, 'link', { type: 'string', format: 'uri', maxLength: 10 });
    addSchemaProperty(Added, 'when', { type: Date as any, isOptional: true });
    addSchemaProperty(Added, 'count', { type: 'integer', minimum: 1, nullable: true });
    addSchemaProperty(Added, 'note', { anyOf, type: 'string' } as any);

    const schema = classToJsonSchema(Added);
    expect(schema.properties).toStrictEqual({
      id: { type: 'string' },
      link: { type: 'string', format: 'uri', maxLength: 10 },
      when: { type: 'string', format: 'date-time' },
      count: { type: ['integer', 'null'], minimum: 1 },
      note: { type: 'string', anyOf },
    });
    expect(schema.required).toStrictEqual(['id', 'link', 'count', 'note']);
  });

  it('updateSchemaProperty counts as explicit', () => {
    class Updated {
      @IsInt() @ToolProp() n: number;
    }
    updateSchemaProperty(Updated, 'n', { type: 'number' });

    expect(classToJsonSchema(Updated).properties.n).toStrictEqual({ type: 'number' });
  });
});
