/**
 * Decorators for schema-forge
 */

import 'reflect-metadata';
import { 
  JSON_SCHEMA_METADATA_KEY, 
  REQUIRED_PROPS_METADATA_KEY, 
  PropertyOptions,
  PropertyPath
} from './types';
import { 
  cloneMetadata, 
  extractEnumValues, 
  getJsonSchemaType,
  isCustomClass
} from './utils';
import { classToJsonSchema } from './core';

/**
 * Applies property updates for a given property path
 */
export function applyPropertyUpdates(
  properties: any,
  paths: string[],
  updates: Partial<PropertyOptions>,
  target: any,
) {
  const [current, ...rest] = paths;

  // Handle nested path
  if (rest.length > 0) {
    if (!properties[current]) {
      properties[current] = {};
    }

    // Get all metadata along the target property's full path
    const originalMetadata =
      Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

    let currentMetadata = originalMetadata;
    for (const path of paths) {
      currentMetadata =
        currentMetadata?.[path] ||
        currentMetadata?.items?.properties?.[path] ||
        currentMetadata?.properties?.[path] ||
        {};
    }

    // Handle enum update for nested property
    if (updates.enum) {
      const enumValues = extractEnumValues(updates.enum);
      const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';

      const targetProp = properties[current];
      if (targetProp.type === 'array') {
        // Update in items.properties
        if (!targetProp.items.properties) {
          targetProp.items.properties = {};
        }
        let current = targetProp.items.properties;
        for (let i = 0; i < rest.length - 1; i++) {
          const path = rest[i];
          if (!current[path]) {
            current[path] = { type: 'object', properties: {} };
          }
          // If this is an array type property
          if (current[path].type === 'array') {
            if (!current[path].items.properties) {
              current[path].items.properties = {};
            }
            current = current[path].items.properties;
          } else {
            // Object type property
            if (!current[path].properties) {
              current[path].properties = {};
            }
            current = current[path].properties;
          }
        }

        // Get the last path segment
        const lastPath = rest[rest.length - 1];
        
        // Check if the target property should be an array of enums or just an enum
        if (current[lastPath] && current[lastPath].type === 'array') {
          // Update items of an array property
          current[lastPath].items = {
            type: enumType,
            enum: enumValues,
          };
        } else {
          // Direct enum property
          current[lastPath] = {
            ...(current[lastPath] || {}),
            type: enumType,
            enum: enumValues,
            description: current[lastPath]?.description || currentMetadata.description,
          };
        }
      } else if (targetProp.type === 'object') {
        // Update in object properties
        if (!targetProp.properties) {
          targetProp.properties = {};
        }
        let current = targetProp.properties;
        for (let i = 0; i < rest.length - 1; i++) {
          const path = rest[i];
          if (!current[path]) {
            current[path] = { type: 'object', properties: {} };
          }
          // If this is an array type property
          if (current[path].type === 'array') {
            if (!current[path].items.properties) {
              current[path].items.properties = {};
            }
            current = current[path].items.properties;
          } else {
            // Object type property
            if (!current[path].properties) {
              current[path].properties = {};
            }
            current = current[path].properties;
          }
        }
        
        // Get the last path segment
        const lastPath = rest[rest.length - 1];
        
        // Update the enum property
        current[lastPath] = {
          ...(current[lastPath] || {}),
          type: enumType,
          enum: enumValues,
          description: current[lastPath]?.description || currentMetadata.description,
        };
      }
    } else {
      // Update general nested path
      if (properties[current].type === 'array') {
        if (!properties[current].items.properties) {
          properties[current].items.properties = {};
        }
        applyPropertyUpdates(
          properties[current].items.properties,
          rest,
          updates,
          target,
        );
      } 
      // Handle nested object properties
      else if (properties[current].type === 'object') {
        if (!properties[current].properties) {
          properties[current].properties = {};
        }
        applyPropertyUpdates(
          properties[current].properties,
          rest,
          updates,
          target,
        );
      }
    }
    return;
  }

  // Handle non-nested path
  const currentProperty = properties[current] || {};

  if (updates.enum) {
    const enumValues = extractEnumValues(updates.enum);
    const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';

    const type = Reflect.getMetadata('design:type', target.prototype, current);

    if (type === Array) {
      properties[current] = {
        ...currentProperty,
        type: 'array',
        items: {
          type: enumType,
          enum: enumValues,
        },
      };
    } else {
      properties[current] = {
        ...currentProperty,
        type: enumType,
        enum: enumValues,
      };
    }

    const { enum: _, ...remainingUpdates } = updates;
    Object.assign(properties[current], remainingUpdates);
  } else {
    properties[current] = {
      ...currentProperty,
      ...updates,
    };
  }
}

/**
 * Decorator for adding schema metadata to a class property
 */
export function ToolProp(options: PropertyOptions = {}) {
  return function (target: any, propertyKey: string) {
    const type = Reflect.getMetadata('design:type', target, propertyKey);
    // Exclude isOptional, keep only other options
    const { isOptional, ...finalOptions } = options;

    const ownProperties =
      Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target) || {};
    const ownRequiredProps =
      Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target) || [];

    const parentTarget = Object.getPrototypeOf(target);
    let currentProperties = {};
    let currentRequiredProps: string[] = [];

    if (parentTarget && parentTarget !== Object.prototype) {
      const parentProperties = cloneMetadata(
        Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, parentTarget) || {},
      );
      const parentRequiredProps = [
        ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, parentTarget) ||
          []),
      ];

      currentProperties = { ...parentProperties };
      currentRequiredProps = [...parentRequiredProps];
    }

    currentProperties = { ...currentProperties, ...ownProperties };
    currentRequiredProps = [
      ...new Set([...currentRequiredProps, ...ownRequiredProps]),
    ];

    if (type === Array) {
      if (options.enum) {
        const enumValues = extractEnumValues(options.enum);
        const enumType =
          typeof enumValues[0] === 'string' ? 'string' : 'number';
        finalOptions.type = 'array';
        finalOptions.items = {
          type: enumType,
          enum: enumValues,
        };
        delete finalOptions.enum;
      } else if (!options.items) {
        throw new Error(
          `Array property "${propertyKey}" needs explicit type information.`,
        );
      } else if (isCustomClass(options.items.type)) {
        const nestedSchema = classToJsonSchema(
          options.items.type as any,
        );
        finalOptions.type = 'array';
        finalOptions.items = nestedSchema;
      } else {
        finalOptions.type = 'array';
        finalOptions.items = options.items;
      }
    } else if (options.enum) {
      const enumValues = extractEnumValues(options.enum);
      const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';
      finalOptions.type = enumType;
      finalOptions.enum = enumValues;
    } else if (isCustomClass(type)) {
      const nestedSchema = classToJsonSchema(type);
      finalOptions.type = 'object';
      finalOptions.properties = nestedSchema.properties;
      finalOptions.required = nestedSchema.required;
    }

    currentProperties[propertyKey] = {
      ...finalOptions,
      type: finalOptions.type || getJsonSchemaType(type),
    };

    // Handle required props only, don't store isOptional
    if (!options.isOptional) {
      if (!currentRequiredProps.includes(propertyKey)) {
        currentRequiredProps.push(propertyKey);
      }
    } else {
      currentRequiredProps = currentRequiredProps.filter(
        (prop) => prop !== propertyKey,
      );
    }

    Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, currentProperties, target);
    Reflect.defineMetadata(
      REQUIRED_PROPS_METADATA_KEY,
      currentRequiredProps,
      target,
    );
  };
}

/**
 * Decorator for adding schema metadata to a class
 */
export function ToolMeta(
  options: {
    name?: string;
    description?: string;
  } = {},
) {
  return function (target: any) {
    Reflect.defineMetadata('jsonSchema:options', options, target);
  };
}

/**
 * Updates a property in a schema with new options
 */
export function updateSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: PropertyPath<T>,
  updates: Partial<PropertyOptions>,
): void {
  const paths = (propertyPath as string).split('.');
  const existingProperties =
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  applyPropertyUpdates(existingProperties, paths, updates, target);

  Reflect.defineMetadata(
    JSON_SCHEMA_METADATA_KEY,
    existingProperties,
    target.prototype,
  );
}

/**
 * Adds a new property to a schema
 */
export function addSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: string,
  options: PropertyOptions,
): void {
  const finalOptions = { ...options };
  if (options.enum) {
    const enumValues = extractEnumValues(options.enum);
    const enumType = typeof enumValues[0] === 'string' ? 'string' : 'number';
    finalOptions.type = enumType;
  } else if (!options.type) {
    throw new Error('Either type or enum must be specified');
  }

  const paths = propertyPath.split('.');
  const existingProperties =
    Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  let current = existingProperties;
  for (let i = 0; i < paths.length - 1; i++) {
    const path = paths[i];
    if (current[path]?.type === 'array') {
      if (!current[path].items.properties) {
        current[path].items.properties = {};
      }
      current = current[path].items.properties;
    } else {
      if (!current[path]?.properties) {
        current[path] = {
          type: 'object',
          properties: {},
        };
      }
      current = current[path].properties;
    }
  }

  const propertyKey = paths[paths.length - 1];
  current[propertyKey] = {
    type: finalOptions.type,
    description: finalOptions.description,
  };

  if (finalOptions.enum) {
    const enumValues = extractEnumValues(finalOptions.enum);
    current[propertyKey].enum = enumValues;
  }

  if (finalOptions.items) {
    current[propertyKey] = {
      type: 'array',
      description: finalOptions.description,
      items: finalOptions.items,
    };
  }

  Reflect.defineMetadata(
    JSON_SCHEMA_METADATA_KEY,
    existingProperties,
    target.prototype,
  );

  if (!finalOptions.isOptional) {
    const requiredProps =
      Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || [];
    if (!requiredProps.includes(propertyKey)) {
      requiredProps.push(propertyKey);
      Reflect.defineMetadata(
        REQUIRED_PROPS_METADATA_KEY,
        requiredProps,
        target.prototype,
      );
    }
  }
}