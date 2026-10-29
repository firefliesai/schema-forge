/**
 * Class-validator integration for schema-forge
 *
 * This module provides utilities to infer JSON Schema properties from class-validator decorators.
 * Inference runs when the schema is generated (not when a decorator runs), so the order in which
 * decorators are written does not change the result.
 */

/**
 * Validation names used by class-validator that schema-forge translates
 */
const VALIDATION_TYPES = {
  ARRAY_MAX_SIZE: 'arrayMaxSize',
  ARRAY_MIN_SIZE: 'arrayMinSize',
  ARRAY_UNIQUE: 'arrayUnique',
  ARRAY_NOT_EMPTY: 'arrayNotEmpty',
  ARRAY_CONTAINS: 'arrayContains',
  IS_ARRAY: 'isArray',
  MAX: 'max',
  MIN: 'min',
  IS_INT: 'isInt',
  IS_NUMBER: 'isNumber',
  IS_STRING: 'isString',
  IS_BOOLEAN: 'isBoolean',
  IS_OBJECT: 'isObject',
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  IS_LENGTH: 'isLength',
  IS_NOT_EMPTY: 'isNotEmpty',
  IS_URL: 'isUrl',
  IS_EMAIL: 'isEmail',
  IS_UUID: 'isUuid',
  IS_POSITIVE: 'isPositive',
  IS_NEGATIVE: 'isNegative',
  IS_DIVISIBLE_BY: 'isDivisibleBy',
  MATCHES: 'matches',
  IS_ENUM: 'isEnum',
  IS_IN: 'isIn',
} as const;

/**
 * Metadata that describes presence, nesting or conditions rather than a value rule, so there is
 * nothing to translate and nothing to warn about.
 */
const NEUTRAL_METADATA_TYPES = new Set([
  'nestedValidation',
  'promiseValidation',
  'conditionalValidation',
  'whitelistValidation',
  'isDefined',
]);
const NEUTRAL_VALIDATION_NAMES = new Set(['isOptional', 'isDate', 'isNotEmptyObject']);

/**
 * Interface for class-validator metadata
 */
interface ClassValidatorMetadata {
  type: string;
  name?: string;
  target: any;
  propertyName: string;
  constraints?: any[];
  constraintCls?: { name?: string };
  validationTypeOptions?: any;
  /** When true, validation applies to each array element */
  each?: boolean;
}

/**
 * JSON Schema items definition for array elements
 */
export interface InferredArrayItems {
  type?: 'string' | 'number' | 'integer' | 'boolean';
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

/**
 * Interface for inferred JSON Schema properties from class-validator
 */
export interface InferredSchemaProperties {
  /** When true, property is inferred as array type from @IsArray or array decorators */
  isArray?: boolean;
  /** Inferred schema for array items (from @ArrayContains, or each: true validators) */
  items?: InferredArrayItems;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  type?: 'integer' | 'string' | 'number' | 'boolean' | 'object' | 'array';
  enum?: (string | number | boolean)[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  /** @IsNotEmpty: becomes `minLength: 1` when the property resolves to a string */
  notEmpty?: boolean;
}

/**
 * Result of reading every class-validator decorator on one property
 */
export interface ClassValidatorAnalysis {
  inferred: InferredSchemaProperties;
  /** Decorators whose rule has no JSON Schema translation (by validation name) */
  untranslated: string[];
}

/**
 * Tries to get the class-validator metadata storage if available
 */
function getClassValidatorMetadataStorage(): any | null {
  const getGlobalStorage = () => {
    const g = globalThis as any;
    return g.classValidatorMetadataStorage || null;
  };

  try {
    // Prefer getMetadataStorage() if class-validator is loaded - ensures same instance
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator');
    if (typeof cv.getMetadataStorage === 'function') {
      return cv.getMetadataStorage();
    }
    return getGlobalStorage();
  } catch {
    return getGlobalStorage();
  }
}

/**
 * Gets all class-validator metadata for a class (including inherited properties)
 */
function getClassValidationMetadata(targetConstructor: any): ClassValidatorMetadata[] {
  const storage = getClassValidatorMetadataStorage();
  if (!storage) {
    return [];
  }

  try {
    return storage.getTargetValidationMetadatas(targetConstructor, '', false, false, undefined);
  } catch {
    return [];
  }
}

/**
 * Names of the properties of a class that carry at least one class-validator decorator
 */
export function getClassValidatorPropertyNames(targetConstructor: any): string[] {
  return [
    ...new Set(
      getClassValidationMetadata(targetConstructor).map((metadata) => metadata.propertyName),
    ),
  ];
}

const LOWER_BOUNDS = new Set(['minimum', 'minLength', 'minItems', 'exclusiveMinimum']);

/**
 * Sets a bound keyword, keeping the strictest value when several decorators set it
 * (`@Length(2, 10)` with `@MinLength(5)` gives `minLength: 5`).
 */
function setBound(target: object, key: string, value: unknown): void {
  if (typeof value !== 'number') return;
  const scope = target as Record<string, unknown>;
  const current = scope[key];
  if (typeof current !== 'number') {
    scope[key] = value;
    return;
  }
  scope[key] = LOWER_BOUNDS.has(key) ? Math.max(current, value) : Math.min(current, value);
}

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

function primitiveTypeOf(values: unknown[]): InferredArrayItems['type'] | undefined {
  if (values.length === 0) return undefined;
  if (values.every((v) => typeof v === 'string')) return 'string';
  if (values.every((v) => typeof v === 'number')) return 'number';
  if (values.every((v) => typeof v === 'boolean')) return 'boolean';
  return undefined;
}

/**
 * The source of a @Matches pattern, or undefined when it cannot be expressed as a JSON Schema
 * `pattern` (JSON Schema patterns have no flags; only `u` is harmless).
 */
function translatablePattern(pattern: unknown, modifiers: unknown): string | undefined {
  const flags =
    pattern instanceof RegExp ? pattern.flags : typeof modifiers === 'string' ? modifiers : '';
  if (flags.replace('u', '') !== '') return undefined;
  if (pattern instanceof RegExp) return pattern.source;
  return typeof pattern === 'string' ? pattern : undefined;
}

/**
 * Reads every class-validator decorator of one property: what can be translated to JSON Schema,
 * and which decorators cannot.
 */
export function analyzeClassValidatorProperty(
  target: any,
  propertyName: string,
): ClassValidatorAnalysis {
  const metadata = getClassValidationMetadata(target.constructor).filter(
    (meta) => meta.propertyName === propertyName,
  );
  const inferred: InferredSchemaProperties = {};
  const items: InferredArrayItems = {};
  const untranslated: string[] = [];

  for (const meta of metadata) {
    const appliesToItems = meta.each === true;
    const scope: InferredSchemaProperties | InferredArrayItems = appliesToItems ? items : inferred;
    const constraint = meta.constraints?.[0];
    // class-validator may use 'name' or 'type' for validation type
    const metaType = meta.name || meta.type;

    switch (metaType) {
      case VALIDATION_TYPES.IS_ARRAY:
        inferred.isArray = true;
        inferred.type = 'array';
        break;

      case VALIDATION_TYPES.ARRAY_MAX_SIZE:
        inferred.isArray = true;
        setBound(inferred, 'maxItems', constraint);
        break;

      case VALIDATION_TYPES.ARRAY_MIN_SIZE:
        inferred.isArray = true;
        setBound(inferred, 'minItems', constraint);
        break;

      case VALIDATION_TYPES.ARRAY_UNIQUE:
        inferred.isArray = true;
        inferred.uniqueItems = true;
        break;

      case VALIDATION_TYPES.ARRAY_NOT_EMPTY:
        inferred.isArray = true;
        setBound(inferred, 'minItems', 1);
        break;

      case VALIDATION_TYPES.ARRAY_CONTAINS:
        inferred.isArray = true;
        if (Array.isArray(constraint) && constraint.length > 0 && constraint.every(isPrimitive)) {
          const type = primitiveTypeOf(constraint);
          if (type) items.type = type;
          items.enum = constraint;
        } else {
          untranslated.push(metaType);
        }
        break;

      case VALIDATION_TYPES.MAX:
        setBound(scope, 'maximum', constraint);
        break;

      case VALIDATION_TYPES.MIN:
        setBound(scope, 'minimum', constraint);
        break;

      case VALIDATION_TYPES.IS_POSITIVE:
        setBound(scope, 'exclusiveMinimum', 0);
        break;

      case VALIDATION_TYPES.IS_NEGATIVE:
        setBound(scope, 'exclusiveMaximum', 0);
        break;

      case VALIDATION_TYPES.IS_DIVISIBLE_BY:
        if (typeof constraint === 'number') scope.multipleOf = constraint;
        break;

      case VALIDATION_TYPES.IS_INT:
        scope.type = 'integer';
        break;

      case VALIDATION_TYPES.IS_NUMBER:
        // @IsInt is the stricter rule; keep it when both are present
        if (scope.type !== 'integer') scope.type = 'number';
        break;

      case VALIDATION_TYPES.IS_STRING:
        scope.type = 'string';
        break;

      case VALIDATION_TYPES.IS_BOOLEAN:
        scope.type = 'boolean';
        break;

      case VALIDATION_TYPES.IS_OBJECT:
        if (appliesToItems) untranslated.push(metaType);
        else inferred.type = 'object';
        break;

      case VALIDATION_TYPES.MIN_LENGTH:
        setBound(scope, 'minLength', constraint);
        break;

      case VALIDATION_TYPES.MAX_LENGTH:
        setBound(scope, 'maxLength', constraint);
        break;

      case VALIDATION_TYPES.IS_LENGTH:
        setBound(scope, 'minLength', constraint);
        setBound(scope, 'maxLength', meta.constraints?.[1]);
        break;

      case VALIDATION_TYPES.IS_NOT_EMPTY:
        if (!appliesToItems) inferred.notEmpty = true;
        break;

      case VALIDATION_TYPES.IS_URL:
        scope.format = 'uri';
        break;

      case VALIDATION_TYPES.IS_EMAIL:
        scope.format = 'email';
        break;

      case VALIDATION_TYPES.IS_UUID:
        scope.format = 'uuid';
        break;

      case VALIDATION_TYPES.MATCHES: {
        const pattern = translatablePattern(constraint, meta.constraints?.[1]);
        if (pattern === undefined) untranslated.push(`${metaType} (regex flags)`);
        else scope.pattern = pattern;
        break;
      }

      case VALIDATION_TYPES.IS_ENUM:
      case VALIDATION_TYPES.IS_IN: {
        const values: unknown =
          metaType === VALIDATION_TYPES.IS_ENUM ? meta.constraints?.[1] : constraint;
        if (Array.isArray(values) && values.length > 0 && values.every(isPrimitive)) {
          scope.enum = values;
        } else {
          untranslated.push(metaType);
        }
        break;
      }

      default:
        if (NEUTRAL_METADATA_TYPES.has(meta.type)) break;
        if (meta.name && NEUTRAL_VALIDATION_NAMES.has(meta.name)) break;
        untranslated.push(meta.name || meta.constraintCls?.name || meta.type);
    }
  }

  if (Object.keys(items).length > 0) {
    inferred.items = items;
    inferred.isArray = true;
  }

  return { inferred, untranslated };
}

/**
 * Infers JSON Schema properties from class-validator decorators
 *
 * Supported decorators (each: true variants apply to array items):
 * - IsArray, ArrayMaxSize, ArrayMinSize, ArrayUnique, ArrayNotEmpty, ArrayContains
 * - IsString, IsNumber, IsInt, IsBoolean, IsObject -> type
 * - Max, Min -> maximum, minimum
 * - IsPositive, IsNegative -> exclusiveMinimum: 0, exclusiveMaximum: 0
 * - IsDivisibleBy -> multipleOf
 * - MinLength, MaxLength, Length -> minLength, maxLength
 * - IsNotEmpty -> minLength: 1 (strings only)
 * - IsUrl, IsEmail, IsUUID -> format: 'uri', 'email', 'uuid'
 * - Matches -> pattern (only when the regex has no flags other than `u`)
 * - IsEnum, IsIn -> enum
 */
export function inferClassValidatorProperties(
  target: any,
  propertyName: string,
): InferredSchemaProperties {
  return analyzeClassValidatorProperty(target, propertyName).inferred;
}
