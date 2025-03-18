import { LLM } from '../json-schema.utility';

const toolName = 'simple_math';
const toolDesc = 'please help to sum of the numbers';

@LLM.ToolDto({
  /** or @ToolDto */
  name: toolName,
  description: toolDesc,
})
export class MathToolDto {
  // or @ToolDtoProp
  @LLM.ToolDtoProp()
  sum: number;
}
