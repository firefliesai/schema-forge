import {
  ToolProp,
} from '../schema-forge';

export class User {
  @ToolProp({
    description: 'The unique identifier of the user',
  })
  id: number;

  @ToolProp({
    description: 'The username of the user',
    isOptional: true,
  })
  username?: string;
}

export class User2 extends User {
  @ToolProp({
    description: 'The unique identifier2 of the user',
  })
  id2: number;
  @ToolProp({
    description: 'username field',
    isOptional: true,
  })
  username?: string;
}