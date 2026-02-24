/**
 * Unit tests for class-validator integration
 */
import 'reflect-metadata';

import { inferClassValidatorProperties } from './class-validator-integration';
import { ToolProp } from './decorators';

describe('class-validator integration', () => {
  it('infers array constraints when class-validator decorators are used', () => {
    let ArrayMinSize: (min: number, options?: any) => PropertyDecorator;
    let ArrayMaxSize: (max: number, options?: any) => PropertyDecorator;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cv = require('class-validator');
      ArrayMinSize = cv.ArrayMinSize;
      ArrayMaxSize = cv.ArrayMaxSize;
    } catch {
      return;
    }

    class TestDto {
      @ArrayMinSize(1)
      @ArrayMaxSize(5)
      @ToolProp({ items: { type: 'string' } })
      tags: string[];
    }

    const inferred = inferClassValidatorProperties(TestDto.prototype, 'tags');

    expect(inferred.minItems).toBe(1);
    expect(inferred.maxItems).toBe(5);
    expect(inferred.isArray).toBe(true);
  });
});
