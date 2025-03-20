import { Schema } from '../schema-forge';

const toolName = 'simple_math';
const toolDesc = 'please help to sum of the numbers';

@Schema.ToolMeta({
  /** or @ToolMeta */
  name: toolName,
  description: toolDesc,
})
export class MathToolDto {
  // or @ToolProp
  @Schema.ToolProp()
  sum: number;
}
