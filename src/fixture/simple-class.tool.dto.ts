import { ToolMeta, ToolProp } from '../schema-forge';

@ToolMeta({
  name: 'user',
  description: 'A user entity with basic information',
})
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

@ToolMeta({
  name: 'user2',
  description: 'An extended user entity with additional information',
})
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
