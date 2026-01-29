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
  MAX: 'max',
  MIN: 'min',
  IS_INT: 'isInt',
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  IS_URL: 'isUrl',
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
}

/**
 * Interface for inferred JSON Schema properties from class-validator
 */
export interface InferredSchemaProperties {
  maxItems?: number;
  minItems?: number;
  maximum?: number;
  minimum?: number;
  type?: 'integer' | 'string' | 'number';
  minLength?: number;
  maxLength?: number;
  format?: string;
}

/**
 * Tries to get the class-validator metadata storage if available
 */
function getClassValidatorMetadataStorage(): any | null {
  try {
    // Try to access the global class-validator metadata storage
    const global = globalThis as any;
    if (global.classValidatorMetadataStorage) {
      return global.classValidatorMetadataStorage;
    }
    return null;
  } catch {
    return null;
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
 * - ArrayMaxSize -> maxItems
 * - ArrayMinSize -> minItems
 * - Max -> maximum (for numbers)
 * - Min -> minimum (for numbers)
 * - IsInt -> type: 'integer'
 * - MinLength -> minLength (for strings)
 * - MaxLength -> maxLength (for strings)
 * - IsUrl -> format: 'uri'
 * - IsPositive -> minimum: 1
 */
export function inferClassValidatorProperties(
  target: any,
  propertyName: string,
): InferredSchemaProperties {
  const metadata = getPropertyValidationMetadata(target.constructor, propertyName);
  const inferred: InferredSchemaProperties = {};

  for (const meta of metadata) {
    switch (meta.name) {
      case VALIDATION_TYPES.ARRAY_MAX_SIZE:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maxItems = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.ARRAY_MIN_SIZE:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minItems = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.MAX:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maximum = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.MIN:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minimum = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.IS_INT:
        inferred.type = 'integer';
        break;

      case VALIDATION_TYPES.MIN_LENGTH:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.minLength = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.MAX_LENGTH:
        if (meta.constraints && meta.constraints[0] !== undefined) {
          inferred.maxLength = meta.constraints[0];
        }
        break;

      case VALIDATION_TYPES.IS_URL:
        inferred.format = 'uri';
        break;

      case VALIDATION_TYPES.IS_POSITIVE:
        inferred.minimum = 1;
        break;
    }
  }

  return inferred;
}
