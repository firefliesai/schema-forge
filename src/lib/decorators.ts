/**
 * Decorators for schema-forge
 */

import {
  allowsNull,
  DEFERRED_UPDATES_METADATA_KEY,
  DeferredUpdate,
  DesignKind,
  makeNullable,
  markExplicit,
  NESTED_CLASS_METADATA_KEY,
  PROPERTY_SOURCES_METADATA_KEY,
  removeNullable,
  PropertySource,
  typeIncludes,
  valueSchemaOf,
  withoutNullWrapper,
} from './resolve';
import {
  JSON_SCHEMA_METADATA_KEY,
  PropertyOptions,
  PropertyPath,
  REQUIRED_PROPS_METADATA_KEY,
} from './types';
import {
  assertNoClassInUpdate,
  assertSafePropertyPath,
  cloneMetadata,
  enumSchemaType,
  extractEnumValues,
  isCustomClass,
  isDateType,
  normalizeItemsType,
} from './utils';

/** Update keys that replace what a property's value is, rather than annotate or bound it */
const VALUE_KEYS = ['type', 'enum', 'const', 'anyOf', 'oneOf', 'allOf', 'items'] as const;

/**
 * The properties map a nested property path continues in, seen through a null wrapper (a
 * nullable property's schema may hold its value in an `anyOf` branch, see `valueSchemaOf`): an
 * array's item properties or an object's own, created when missing. For a schema that is neither,
 * `undefined`, unless `asObject` is set, which treats it as an object. An array without `items`
 * throws: its items may still come from class-validator when the schema is generated, so they
 * are not invented here.
 */
function nestedPropertiesOf(
  schema: Record<string, any>,
  asObject: boolean,
  name: string,
): Record<string, any> | undefined {
  const value = valueSchemaOf(schema);
  if (typeIncludes(value.type, 'array')) {
    if (!value.items || typeof value.items !== 'object') {
      throw new Error(
        `schema-forge: cannot reach into "${name}": it is an array without \`items\`. ` +
          'Describe its items in @ToolProp (for example items: { type: SomeClass }) first.',
      );
    }
    const items = valueSchemaOf(value.items);
    if (!items.properties) items.properties = {};
    return items.properties;
  }
  if (asObject || typeIncludes(value.type, 'object')) {
    if (!value.properties) value.properties = {};
    return value.properties;
  }
  return undefined;
}

/**
 * Applies property updates for a given property path
 */
export function applyPropertyUpdates(
  properties: any,
  paths: string[],
  updates: Partial<PropertyOptions>,
  target: any,
  sources?: Record<string, PropertySource>,
  /** The property schemas as they were before these updates (default: the stored ones) */
  metadataRoot?: any,
) {
  assertSafePropertyPath(paths);
  const [current, ...rest] = paths;

  // Handle nested path
  if (rest.length > 0) {
    if (!properties[current]) {
      properties[current] = {};
    }

    // Get all metadata along the target property's full path
    const originalMetadata =
      metadataRoot ?? (Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {});

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

      // The properties map the rest of the path starts in: an array's item properties, or an
      // object's properties. Everything below is shared, so both kinds of parent treat the
      // target the same way.
      let container = nestedPropertiesOf(properties[current], false, current);

      if (container) {
        for (let i = 0; i < rest.length - 1; i++) {
          const path = rest[i];
          if (!container[path]) {
            container[path] = { type: 'object', properties: {} };
          }
          container = nestedPropertiesOf(
            container[path],
            true,
            [current, ...rest.slice(0, i + 1)].join('.'),
          )!;
        }

        // Get the last path segment
        const lastPath = rest[rest.length - 1];
        const previous = container[lastPath];
        const previousValue = valueSchemaOf(previous);

        // An array target keeps being an array: the enum applies to its items, which keep
        // accepting null if they did, while `nullable` in the update is about the array itself
        if (previousValue && typeIncludes(previousValue.type, 'array')) {
          const previousItems = previousValue.items;
          previousValue.items = {
            type: enumType,
            enum: enumValues,
          };
          keepNullable(previousValue.items, previousItems, {});
          keepNullable(previous, previous, { nullable: updates.nullable });
        } else {
          // Direct enum property: the enum replaces the value, so it starts from the schema
          // without its null wrapper, and null is put back when the property accepted it
          const base = previous ? withoutNullWrapper(previous) : {};
          container[lastPath] = {
            ...base,
            type: enumType,
            enum: enumValues,
            description: base.description || currentMetadata.description,
          };
          keepNullable(container[lastPath], previous, updates);
        }
      }
    } else {
      // Update general nested path: an array's item properties or an object's properties
      const nested = nestedPropertiesOf(properties[current], false, current);
      if (nested) applyPropertyUpdates(nested, rest, updates, target);
    }
    return;
  }

  // Handle non-nested path
  const currentProperty = properties[current] || {};
  if (sources) markExplicit(sources, current, updates as Record<string, unknown>);
  // A resolved schema (a nested class's property: no recorded source) may hold its value in a
  // null wrapper. An update that replaces the value starts from the schema without it; null is
  // put back below when the property accepted it.
  const base =
    !sources?.[current] && VALUE_KEYS.some((key) => updates[key] !== undefined)
      ? withoutNullWrapper(currentProperty)
      : currentProperty;

  if (updates.enum) {
    const enumValues = extractEnumValues(updates.enum);
    const enumType = enumSchemaType(enumValues);

    // An array keeps being an array, as for a path into a nested property: the enum applies to
    // its items, which keep accepting null if they did. The schema says it is an array; or, when
    // the schema has no type yet, the design type does. The design type alone is not enough:
    // under `strictNullChecks`, `string[] | null` has design type Object.
    const value = valueSchemaOf(base);
    const isArray =
      typeIncludes(value?.type, 'array') ||
      (value?.type === undefined &&
        Reflect.getMetadata('design:type', target.prototype, current) === Array);

    if (isArray) {
      const items: Record<string, any> = { type: enumType, enum: enumValues };
      keepNullable(items, value?.items, {});
      properties[current] = {
        ...base,
        type: 'array',
        items,
      };
    } else {
      properties[current] = {
        ...base,
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
      ...base,
      ...normalizedUpdates,
    };
  }

  // Option-only keys never belong in the emitted schema. `nullable` is applied when the schema
  // is resolved (or right away for a property with no recorded source).
  delete properties[current].isOptional;
  delete properties[current].nullable;
  if (!sources?.[current]) keepNullable(properties[current], currentProperty, updates);
}

/**
 * For a property schema that is already resolved (a property of a nested class, or one added by
 * `addSchemaProperty`): `nullable` in the update applies right away, and a schema that accepted
 * null keeps accepting it when the update replaces its type or enum, unless the update says
 * `nullable: false`.
 */
function keepNullable(
  schema: Record<string, any>,
  previous: unknown,
  updates: Partial<PropertyOptions>,
): void {
  if (updates.nullable === false) {
    removeNullable(schema);
  } else if ((updates.nullable === true || allowsNull(previous)) && !allowsNull(schema)) {
    makeNullable(schema);
  }
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

/**
 * Whether the first segment of a property path is a property whose schema is a nested class's.
 * Such a property's nested properties exist only once a schema is generated, so an update that
 * reaches into them is recorded and replayed then.
 */
function nestedClassAt(target: any, paths: string[]): unknown {
  const nested = Reflect.getMetadata(NESTED_CLASS_METADATA_KEY, target.prototype, paths[0]);
  return typeof nested === 'function' ? nested : undefined;
}

/** Deep equality where functions (classes, enum-like objects' members) compare by identity */
function sameUpdateValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) =>
      sameUpdateValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/**
 * Records an update into a nested class's properties. A call identical to the last one recorded
 * adds nothing (applying it twice in a row gives the same schema), so repeating the same call does
 * not grow the list. Different updates are all kept, in order: replaying them in that order is
 * what decides the result.
 */
function deferUpdate(target: any, update: DeferredUpdate): void {
  const deferred: DeferredUpdate[] =
    Reflect.getOwnMetadata(DEFERRED_UPDATES_METADATA_KEY, target.prototype) || [];
  if (deferred.length > 0 && sameUpdateValue(deferred[deferred.length - 1], update)) return;
  Reflect.defineMetadata(DEFERRED_UPDATES_METADATA_KEY, [...deferred, update], target.prototype);
}

/**
 * Decorator for adding schema metadata to a class property.
 *
 * It only records: the explicit options, the TypeScript design type and, for a property whose
 * type is a class, that class. Everything else happens when a schema is generated: class-validator
 * decorators are read then (so their position relative to @ToolProp does not matter), nested class
 * schemas are built then, and every check runs then. Decorating a class never throws, so classes
 * that no schema reaches can carry @ToolProp freely.
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
    const hasComposition = Boolean(
      options.anyOf || options.oneOf || options.allOf || options.const !== undefined,
    );
    let nestedClass: unknown = null;

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
        // `items` is the nested class's schema, built when a schema is generated
        delete finalOptions.items;
        nestedClass = options.items.type;
      } else if (options.items) {
        // Normalize constructor types (Date, String, Number, Boolean) to string literals
        finalOptions.items = normalizeItemsType(options.items);
      }
      // No `items`: class-validator may still supply them when the schema is generated
    } else if (options.enum) {
      const enumValues = extractEnumValues(options.enum);
      finalOptions.enum = enumValues;
      if (!options.type) finalOptions.type = enumSchemaType(enumValues);
    } else if (
      design === 'class' &&
      ((!options.type && !hasComposition) || options.type === 'object')
    ) {
      // `properties` and `required` are the nested class's, filled when a schema is generated
      nestedClass = type;
      finalOptions.type = 'object';
    } else if (
      design === 'date' &&
      ((!options.type && !hasComposition) || options.type === 'string')
    ) {
      finalOptions.type = 'string';
      if (!options.format) finalOptions.format = 'date-time';
    } else if (options.type) {
      // An explicit type wins over the design type
    } else if (hasComposition) {
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
    // `null` shadows a nested class an overridden parent property had
    Reflect.defineMetadata(NESTED_CLASS_METADATA_KEY, nestedClass, target, propertyKey);
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
 * Updates a property in a schema with new options, permanently.
 *
 * A path into the properties of a nested class (`'address.city'`) is recorded and applied each
 * time a schema of `target` is generated, while the nested class's schema is built for it and
 * before its properties are checked; the nested class itself does not change.
 */
export function updateSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: PropertyPath<T>,
  updates: Partial<PropertyOptions>,
): void {
  const paths = (propertyPath as string).split('.');
  assertSafePropertyPath(paths);
  assertNoClassInUpdate(updates, `updateSchemaProperty(${target.name}, '${paths.join('.')}')`);
  const nestedClass = nestedClassAt(target, paths);
  if (nestedClass) {
    deferUpdate(target, { kind: 'update', paths, updates, nestedClass });
    return;
  }

  const existingProperties = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};

  const existingSources =
    Reflect.getMetadata(PROPERTY_SOURCES_METADATA_KEY, target.prototype) || {};

  applyPropertyUpdates(existingProperties, paths, updates, target, existingSources);

  Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, existingProperties, target.prototype);
  Reflect.defineMetadata(PROPERTY_SOURCES_METADATA_KEY, existingSources, target.prototype);
}

/**
 * Adds a property at `propertyPath` to the given property schemas and required list
 */
export function addPropertyTo(
  properties: Record<string, any>,
  requiredProps: string[],
  propertyPath: string,
  options: PropertyOptions,
): void {
  assertSafePropertyPath(propertyPath.split('.'));
  const finalOptions = { ...options };
  if (options.enum) {
    finalOptions.type = enumSchemaType(extractEnumValues(options.enum));
  }

  const paths = propertyPath.split('.');
  let current = properties;
  for (let i = 0; i < paths.length - 1; i++) {
    const path = paths[i];
    // Seen through a null wrapper; anything that is neither an array nor an object with
    // properties is replaced by a new object
    const value = valueSchemaOf(current[path]);
    if (!value || (!typeIncludes(value.type, 'array') && !value.properties)) {
      current[path] = {
        type: 'object',
        properties: {},
      };
    }
    current = nestedPropertiesOf(current[path], true, paths.slice(0, i + 1).join('.'))!;
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

  if (!finalOptions.isOptional && !requiredProps.includes(propertyKey)) {
    requiredProps.push(propertyKey);
  }
}

/**
 * Adds a new property to a schema, permanently.
 *
 * A path into the properties of a nested class (`'address.zip'`) is recorded and applied each
 * time a schema of `target` is generated, while the nested class's schema is built for it and
 * before its properties are checked; the nested class itself does not change.
 */
export function addSchemaProperty<T extends object>(
  target: new (...args: any[]) => T,
  propertyPath: string,
  options: PropertyOptions,
): void {
  if (!options.enum && !options.type) {
    throw new Error('Either type or enum must be specified');
  }

  assertSafePropertyPath(propertyPath.split('.'));
  assertNoClassInUpdate(options, `addSchemaProperty(${target.name}, '${propertyPath}')`);
  const nestedClass = nestedClassAt(target, propertyPath.split('.'));
  if (nestedClass) {
    deferUpdate(target, { kind: 'add', path: propertyPath, options, nestedClass });
    return;
  }

  const existingProperties = Reflect.getMetadata(JSON_SCHEMA_METADATA_KEY, target.prototype) || {};
  const requiredProps = Reflect.getMetadata(REQUIRED_PROPS_METADATA_KEY, target.prototype) || [];
  const requiredBefore = requiredProps.length;

  addPropertyTo(existingProperties, requiredProps, propertyPath, options);

  Reflect.defineMetadata(JSON_SCHEMA_METADATA_KEY, existingProperties, target.prototype);
  if (requiredProps.length !== requiredBefore) {
    Reflect.defineMetadata(REQUIRED_PROPS_METADATA_KEY, requiredProps, target.prototype);
  }
}
