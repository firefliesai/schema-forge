/**
 * Class-validator integration for schema-forge
 *
 * This module provides utilities to infer JSON Schema properties from class-validator decorators.
 */

/**
 * Validation type names used by class-validator
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
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  IS_URL: 'isUrl',
  IS_EMAIL: 'isEmail',
  IS_POSITIVE: 'isPositive',
} as const;

/**
 * Interface for class-validator metadata
 */
interface ClassValidatorMetadata {
  type: string;
  name: string;
  target: any;
  propertyName: string;
  constraints?: any[];
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
  minLength?: number;
  maxLength?: number;
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
  type?: 'integer' | 'string' | 'number' | 'array';
  minLength?: number;
  maxLength?: number;
  format?: string;
}

/**
 * Tries to get the class-validator metadata storage if available
 */
function getClassValidatorMetadataStorage(): any | null {
  try {
    // Prefer getMetadataStorage() if class-validator is loaded - ensures same instance
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator');
    if (typeof cv.getMetadataStorage === 'function') {
      return cv.getMetadataStorage();
    }
    // Fallback to global storage (populated when class-validator decorators run)
    const global = globalThis as any;
    return global.classValidatorMetadataStorage || null;
  } catch {
    const global = globalThis as any;
    return global.classValidatorMetadataStorage || null;
  }
}

/**
 * Gets validation metadata for a specific property from class-validator
 */
function getPropertyValidationMetadata(
  target: any,
  propertyName: string,
): ClassValidatorMetadata[] {
  const storage = getClassValidatorMetadataStorage();
  if (!storage) {
    return [];
  }

  try {
    // Get all validation metadata for the target class
    const allMetadata = storage.getTargetValidationMetadatas(target, '', false, false, undefined);

    // Filter for the specific property
    return allMetadata.filter(
      (metadata: ClassValidatorMetadata) => metadata.propertyName === propertyName,
    );
  } catch {
    return [];
  }
}

/**
 * Infers JSON Schema properties from class-validator decorators
 *
 * Supported decorators:
 * - IsArray -> isArray: true, type: 'array'
 * - ArrayMaxSize -> maxItems
 * - ArrayMinSize -> minItems
 * - ArrayUnique -> uniqueItems: true
 * - ArrayNotEmpty -> minItems: 1
 * - ArrayContains -> items.enum (when values are primitive)
 * - Max -> maximum (for numbers) or items.maximum (with each: true)
 * - Min -> minimum (for numbers) or items.minimum (with each: true)
 * - IsInt -> type: 'integer' or items.type (with each: true)
 * - MinLength -> minLength (for strings) or items.minLength (with each: true)
 * - MaxLength -> maxLength (for strings) or items.maxLength (with each: true)
 * - IsUrl -> format: 'uri' or items.format (with each: true)
 * - IsEmail -> format: 'email' or items.format (with each: true)
 * - IsPositive -> minimum: 1 or items.minimum (with each: true)
 */
export function inferClassValidatorProperties(
  target: any,
  propertyName: string,
): InferredSchemaProperties {
  const metadata = getPropertyValidationMetadata(target.constructor, propertyName);
  const inferred: InferredSchemaProperties = {};
  const items: InferredArrayItems = {};

  for (const meta of metadata) {
    const appliesToItems = meta.each === true;
    // class-validator may use 'name' or 'type' for validation type
    const metaType = meta.name || meta.type;

    switch (metaType) {
      case VALIDATION_TYPES.IS_ARRAY:
        inferred.isArray = true;
        inferred.type = 'array';
        break;

      case VALIDATION_TYPES.ARRAY_MAX_SIZE:
        inferred.isArray = true;
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maxItems = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.ARRAY_MIN_SIZE:
        inferred.isArray = true;
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minItems = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.ARRAY_UNIQUE:
        inferred.isArray = true;
        inferred.uniqueItems = true;
        break;

      case VALIDATION_TYPES.ARRAY_NOT_EMPTY:
        inferred.isArray = true;
        inferred.minItems = 1;
        break;

      case VALIDATION_TYPES.ARRAY_CONTAINS:
        inferred.isArray = true;
        if (meta.constraints && Array.isArray(meta.constraints[0])) {
          const values = meta.constraints[0];
          const allPrimitive = values.every(
            (v: unknown) =>
              typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
          );
          if (allPrimitive && values.length > 0) {
            const firstType = typeof values[0];
            items.type =
              firstType === 'string' ? 'string' : firstType === 'number' ? 'number' : 'boolean';
            items.enum = values as (string | number | boolean)[];
          }
        }
        break;

      case VALIDATION_TYPES.MAX:
        if (appliesToItems) {
          if (meta.constraints && meta.constraints[0] !== undefined) {
            items.maximum = meta.constraints[0];
          }
        } else if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maximum = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.MIN:
        if (appliesToItems) {
          if (meta.constraints && meta.constraints[0] !== undefined) {
            items.minimum = meta.constraints[0];
          }
        } else if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minimum = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.IS_INT:
        if (appliesToItems) {
          items.type = 'integer';
        } else {
          inferred.type = 'integer';
        }
        break;

      case VALIDATION_TYPES.MIN_LENGTH:
        if (appliesToItems) {
          if (meta.constraints && meta.constraints[0] !== undefined) {
            items.minLength = meta.constraints[0];
          }
        } else if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minLength = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.MAX_LENGTH:
        if (appliesToItems) {
          if (meta.constraints && meta.constraints[0] !== undefined) {
            items.maxLength = meta.constraints[0];
          }
        } else if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maxLength = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.IS_URL:
        if (appliesToItems) {
          items.format = 'uri';
        } else {
          inferred.format = 'uri';
        }
        break;

      case VALIDATION_TYPES.IS_EMAIL:
        if (appliesToItems) {
          items.format = 'email';
        } else {
          inferred.format = 'email';
        }
        break;

      case VALIDATION_TYPES.IS_POSITIVE:
        if (appliesToItems) {
          items.minimum = 1;
        } else {
          inferred.minimum = 1;
        }
        break;
    }
  }

  if (Object.keys(items).length > 0) {
    inferred.items = items;
    inferred.isArray = true;
  }

  return inferred;
}
