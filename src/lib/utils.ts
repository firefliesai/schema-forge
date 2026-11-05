/**
 * Helper functions for schema-forge
 */

/**
 * Clones metadata using JSON serialization/deserialization
 */
export function cloneMetadata(metadata: any): any {
  return JSON.parse(JSON.stringify(metadata));
}

/**
 * A deep copy of an update's options that keeps functions (`items: { type: String }`, an enum
 * object): applying an update shares its objects with the generated schema, which later steps
 * change in place (`additionalProperties: false`), so each generation starts from a copy.
 */
export function cloneUpdate<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneUpdate) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneUpdate(entry)]),
    ) as T;
  }
  return value;
}

/**
 * Throws when a property path given by a caller (`updateSchemaProperty`, `addSchemaProperty`,
 * `propertyOverrides`) has a segment that, used as an object key, would reach an object's
 * prototype instead of a property schema.
 */
export function assertSafePropertyPath(paths: readonly string[]): void {
  for (const segment of paths) {
    if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
      throw new Error(
        `schema-forge: "${segment}" cannot be used as a property name or path segment ` +
          `(in "${paths.join('.')}").`,
      );
    }
  }
}

/**
 * Throws when an update (`updateSchemaProperty`, `addSchemaProperty`, a `propertyOverrides`
 * entry) names a class in `type` or `items.type`. Only `@ToolProp` declares a nested class, and
 * its schema is built from that declaration; a class an update names would be left in the schema
 * unbuilt (it serializes to nothing), so the result would silently lose the property's shape.
 */
export function assertNoClassInUpdate(updates: any, where: string): void {
  const named = [updates?.type, updates?.items?.type].find(isCustomClass);
  if (!named) return;
  throw new Error(
    `schema-forge: ${where} names the class ${named.name || 'anonymous class'}, which an update ` +
      'cannot add: only @ToolProp declares a nested class and builds its schema. Declare the ' +
      `property with @ToolProp (items: { type: ${named.name || 'TheClass'} } for an array, or ` +
      'the class as its TypeScript type), for example in a subclass.',
  );
}

/**
 * Type inference helper
 */
export function inferType<T>(_target: new (...args: any[]) => any): T {
  return null as any;
}

/**
 * Checks if a type is a custom class
 */
export function isCustomClass(type: any): boolean {
  return (
    typeof type === 'function' &&
    type.prototype &&
    type !== String &&
    type !== Number &&
    type !== Boolean &&
    type !== Array &&
    type !== Object &&
    type !== Date
  );
}

/**
 * Extracts values from an enum type
 */
export function extractEnumValues(enumType: any): any[] {
  if (Array.isArray(enumType)) {
    return enumType;
  }

  if (typeof enumType === 'object' && enumType !== null) {
    const enumKeys = Object.keys(enumType).filter((key) => isNaN(Number(key)));
    return enumKeys.map((key) => enumType[key]);
  }

  return [];
}

/**
 * The JSON Schema type of an enum, from all of its values: `string`, `number` or `boolean`, or a
 * type array when the values mix types (`null` values are ignored).
 */
export function enumSchemaType(values: unknown[]): any {
  const types: string[] = [];
  for (const value of values) {
    if (value === null) continue;
    const type =
      typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'boolean' : 'number';
    if (!types.includes(type)) types.push(type);
  }
  if (types.length === 0) return 'string';
  return types.length === 1 ? types[0] : types;
}

/**
 * Checks if a type is a Date type
 */
export function isDateType(type: any): boolean {
  return type === Date;
}

/**
 * Normalizes array items type, converting constructors to string literals
 * Date -> { type: 'string', format: 'date-time' }
 * String -> { type: 'string' }
 * Number -> { type: 'number' }
 * Boolean -> { type: 'boolean' }
 */
export function normalizeItemsType(items: any): any {
  if (!items || typeof items !== 'object') {
    return items;
  }

  // If items has a type property that's a constructor, normalize it
  if (items.type) {
    const normalizedItems = { ...items };

    if (items.type === Date) {
      normalizedItems.type = 'string';
      if (!normalizedItems.format) {
        normalizedItems.format = 'date-time';
      }
      return normalizedItems;
    } else if (items.type === String) {
      normalizedItems.type = 'string';
      return normalizedItems;
    } else if (items.type === Number) {
      normalizedItems.type = 'number';
      return normalizedItems;
    } else if (items.type === Boolean) {
      normalizedItems.type = 'boolean';
      return normalizedItems;
    }
  }

  return items;
}
