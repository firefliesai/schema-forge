/**
 * Decorators for schema-forge
 */

import { classToJsonSchema } from './core';
import {
  DesignKind,
  makeNullable,
  markExplicit,
  PROPERTY_SOURCES_METADATA_KEY,
  PropertySource,
} from './resolve';
import {
  JSON_SCHEMA_METADATA_KEY,
  PropertyOptions,
  PropertyPath,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import {
  cloneMetadata,
  enumSchemaType,
  extractEnumValues,
  isCustomClass,
  isDateType,
  normalizeItemsType,
} from './utils';

/**
 * Applies property updates for a given property path
 */
export function applyPropertyUpdates(
  properties: any,
  paths: string[],
  updates: Partial<PropertyOptions>,
  target: any,
  sources?: Record<string, PropertySource>,
) {
  const [current, ...rest] = paths;

  // Handle nested path
  if (rest.length > 0) {
    if (!properties[current]) {
      properties[current] = {};
    }

    // Get all metadata along the target property's full path
    const originalMetadata = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

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
      const enumType = enumSchemaType(enumValues);

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
        applyPropertyUpdates(properties[current].items.properties, rest, updates, target);
      }
      // Handle nested object properties
      else if (properties[current].type === 'object') {
        if (!properties[current].properties) {
          properties[current].properties = {};
        }
        applyPropertyUpdates(properties[current].properties, rest, updates, target);
      }
    }
    return;
  }

  // Handle non-nested path
  const currentProperty = properties[current] || {};
  if (sources) markExplicit(sources, current, updates as Record<string, unknown>);

  if (updates.enum) {
    const enumValues = extractEnumValues(updates.enum);
    const enumType = enumSchemaType(enumValues);

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
    // Normalize items if present in updates
    if (remainingUpdates.items) {
      remainingUpdates.items = normalizeItemsType(remainingUpdates.items);
    }
    Object.assign(properties[current], remainingUpdates);
  } else {
    const normalizedUpdates = { ...updates };
    // Normalize items if present in updates
    if (normalizedUpdates.items) {
      normalizedUpdates.items = normalizeItemsType(normalizedUpdates.items);
    }
    properties[current] = {
      ...currentProperty,
      ...normalizedUpdates,
    };
  }

  // Option-only keys never belong in the emitted schema. `nullable` is applied when the schema
  // is resolved (or right away for a property with no recorded source).
  delete properties[current].isOptional;
  delete properties[current].nullable;
  if (updates.nullable && !sources?.[current]) makeNullable(properties[current]);
}

/**
 * The kind of TypeScript design type a property has
 */
function designKindOf(type: any): DesignKind {
  if (type === undefined) return 'unknown';
  if (type === String) return 'string';
  if (type === Number) return 'number';
  if (type === Boolean) return 'boolean';
  if (isDateType(type)) return 'date';
  if (type === Array) return 'array';
  if (type === Object) return 'object';
  if (isCustomClass(type)) return 'class';
  return 'unknown';
}

function assertNotSelfReference(target: any, propertyKey: string, type: unknown): void {
  if (type !== undefined && type === target.constructor) {
    throw new Error(
      `schema-forge: ${target.constructor.name}.${propertyKey} refers to its own class. ` +
        'Recursive classes are not supported; describe the field explicitly ' +
        "(e.g. type: 'object' or items: { type: 'object' }).",
    );
  }
}

/**
 * Decorator for adding schema metadata to a class property.
 *
 * It records the explicit options and the TypeScript design type. class-validator decorators are
 * read later, when a schema is generated, so their position relative to @ToolProp does not matter.
 */
export function ToolProp(options: PropertyOptions = {}) {
  return function (target: any, propertyKey: string) {
    const type = Reflect.getMetadata('design:type', target, propertyKey);
    const design = designKindOf(type);
    const {
      isOptional: _isOptional,
      nullable,
      ...finalOptions
    } = options as PropertyOptions & Record<string, any>;

    const ownProperties = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target) || {};
    const ownRequiredProps = Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target) || [];
    const ownSources = Reflect.getMetadata(PROPERTY_SOURCES_METADATA_KEY, target) || {};

    const parentTarget = Object.getPrototypeOf(target);
    let currentProperties = {};
    let currentRequiredProps: string[] = [];
    let currentSources: Record<string, PropertySource> = {};

    if (parentTarget && parentTarget !== Object.prototype) {
      const parentProperties = cloneMetadata(
        Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, parentTarget) || {},
      );
      const parentRequiredProps = [
        ...(Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, parentTarget) || []),
      ];
      const parentSources = cloneMetadata(
        Reflect.getMetadata(PROPERTY_SOURCES_METADATA_KEY, parentTarget) || {},
      );

      currentProperties = { ...parentProperties };
      currentRequiredProps = [...parentRequiredProps];
      currentSources = { ...parentSources };
    }

    currentProperties = { ...currentProperties, ...ownProperties };
    currentRequiredProps = [...new Set([...currentRequiredProps, ...ownRequiredProps])];
    currentSources = { ...currentSources, ...ownSources };

    const isArray = type === Array || options.type === 'array' || options.items !== undefined;

    if (isArray) {
      finalOptions.type = 'array';
      if (options.enum) {
        const enumValues = extractEnumValues(options.enum);
        finalOptions.items = {
          type: enumSchemaType(enumValues),
          enum: enumValues,
        };
        delete finalOptions.enum;
      } else if (options.items && isCustomClass(options.items.type)) {
        assertNotSelfReference(target, propertyKey, options.items.type);
        const nestedSchema = classToJsonSchema(options.items.type as any);
        finalOptions.items = nestedSchema;
      } else if (options.items) {
        // Normalize constructor types (Date, String, Number, Boolean) to string literals
        finalOptions.items = normalizeItemsType(options.items);
      }
      // No `items`: class-validator may still supply them when the schema is generated
    } else if (options.enum) {
      const enumValues = extractEnumValues(options.enum);
      finalOptions.enum = enumValues;
      if (!options.type) finalOptions.type = enumSchemaType(enumValues);
    } else if (design === 'class' && (!options.type || options.type === 'object')) {
      assertNotSelfReference(target, propertyKey, type);
      const nestedSchema = classToJsonSchema(type);
      finalOptions.type = 'object';
      finalOptions.properties = nestedSchema.properties;
      if (nestedSchema.required) finalOptions.required = nestedSchema.required;
    } else if (design === 'date' && (!options.type || options.type === 'string')) {
      finalOptions.type = 'string';
      if (!options.format) finalOptions.format = 'date-time';
    } else if (options.type) {
      // An explicit type wins over the design type
    } else if (options.anyOf || options.oneOf || options.allOf || options.const !== undefined) {
      // A composition describes the value; no type is forced next to it
    } else if (design === 'string' || design === 'number' || design === 'boolean') {
      finalOptions.type = design;
    }
    // design 'object' / 'unknown' with nothing explicit: left without a type, resolved (or
    // reported) when the schema is generated

    currentProperties[propertyKey] = finalOptions;
    currentSources[propertyKey] = {
      explicit: Object.keys(options).filter((key) => key !== 'description'),
      design,
      ...(nullable && { nullable: true }),
    };

    // Handle required props only, don't store isOptional
    if (!options.isOptional) {
      if (!currentRequiredProps.includes(propertyKey)) {
        currentRequiredProps.push(propertyKey);
      }
    } else {
      currentRequiredProps = currentRequiredProps.filter((prop) => prop !== propertyKey);
    }

    Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, currentProperties, target);
    Reflect.defineMetadata(REQUIRED_PROPS_METADATA_KEY, currentRequiredProps, target);
    Reflect.defineMetadata(PROPERTY_SOURCES_METADATA_KEY, currentSources, target);
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
  const existingProperties = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  const existingSources =
    Reflect.getMetadata(PROPERTY_SOURCES_METADATA_KEY, target.prototype) || {};

  applyPropertyUpdates(existingProperties, paths, updates, target, existingSources);

  Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, existingProperties, target.prototype);
  Reflect.defineMetadata(PROPERTY_SOURCES_METADATA_KEY, existingSources, target.prototype);
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
    const enumType = enumSchemaType(enumValues);
    finalOptions.type = enumType;
  } else if (!options.type) {
    throw new Error('Either type or enum must be specified');
  }

  const paths = propertyPath.split('.');
  const existingProperties = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

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
    // Normalize constructor types (Date, String, Number, Boolean) to string literals
    const normalizedItems = normalizeItemsType(finalOptions.items);
    current[propertyKey] = {
      type: 'array',
      description: finalOptions.description,
      items: normalizedItems,
    };
  }

  if (finalOptions.nullable) makeNullable(current[propertyKey]);

  Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, existingProperties, target.prototype);

  if (!finalOptions.isOptional) {
    const requiredProps = Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || [];
    if (!requiredProps.includes(propertyKey)) {
      requiredProps.push(propertyKey);
      Reflect.defineMetadata(REQUIRED_PROPS_METADATA_KEY, requiredProps, target.prototype);
    }
  }
}
