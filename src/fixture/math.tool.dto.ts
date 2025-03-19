import { Schema } from '../schema-forge';

const toolName = 'simple_math';
const toolDesc = 'please help to sum of the numbers';

@Schema.ToolMeta({
  /** or @ToolDto */
  name: toolName,
  description: toolDesc,
})
export class MathToolDto {
  // or @ToolDtoProp
  @Schema.ToolProp()
  sum: number;
}
