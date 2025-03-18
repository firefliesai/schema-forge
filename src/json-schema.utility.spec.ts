import { isEqual } from 'lodash';

import {
  addProperty,
  ToolDtoProp,
  toolDtoToAPIParam,
  toolDtoToSchema,
  updateProperty,
} from './json-schema.utility';
import {
  expGameCharSchemaObj,
  expGameCharToolObj,
  expGameCharV2ToolObj,
  FirstLevelDto,
  firstLevelDtoToolObj,
  GameCharacter,
  GameCharacterV2,
} from './json-schma-examples/json-schema.example';

jest.setTimeout(60 * 1000);

describe('client test', () => {
  it('class to json schema test ', async () => {
    /** test-1:
     *   a. define simple class case in the block case
     *   b. inheritance case
     *   c. toolDtoToSchema with passing temp updated property case
     *   d. updateProperty (permanently) test case */
    class User {
      @ToolDtoProp({
        description: 'The unique identifier of the user',
      })
      id: number;

      @ToolDtoProp({
        description: 'The username of the user',
        isOptional: true,
      })
      username?: string;
    }

    class User2 extends User {
      @ToolDtoProp({
        description: 'The unique identifier2 of the user',
      })
      id2: number;
      @ToolDtoProp({
        description: 'username field',
        isOptional: true,
      })
      username?: string;
    }

    const user2JsonSchemaTempChangeID2 = toolDtoToSchema(User2, {
      id2: { description: 'temp updated id2 description' },
    });
    const user2JsonSchema = toolDtoToSchema(User2);
    updateProperty(User2, 'id2', {
      description: 'permanently updated id2 description',
    });
    const user2JsonSchemaPersistChangeID2 = toolDtoToSchema(User2);

    /** user check */
    const userJsonSchema = toolDtoToSchema(User);

    expect(
      isEqual(userJsonSchema, {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'The unique identifier of the user',
          },
          username: {
            type: 'string',
            description: 'The username of the user',
          },
        },
        required: ['id'],
      }),
    ).toBe(true);

    /** user2 check */
    expect(
      isEqual(user2JsonSchema, {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'The unique identifier of the user',
          },
          username: {
            type: 'string',
            description: 'username field',
          },
          id2: {
            type: 'number',
            description: 'The unique identifier2 of the user',
          },
        },
        required: ['id', 'id2'],
      }),
    );

    expect(
      isEqual(user2JsonSchemaTempChangeID2, {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'The unique identifier of the user',
          },
          username: {
            type: 'string',
            description: 'username field',
          },
          id2: {
            type: 'number',
            description: 'temp updated id2 description',
          },
        },
        required: ['id', 'id2'],
      }),
    );

    expect(
      isEqual(user2JsonSchemaPersistChangeID2, {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'The unique identifier of the user',
          },
          username: {
            type: 'string',
            description: 'username field',
          },
          id2: {
            type: 'number',
            description: 'permanently updated id2 description',
          },
        },
        required: ['id', 'id2'],
      }),
    );

    /** test-2 complex json schema case */
    const gameCharSchema = toolDtoToSchema(GameCharacter);
    expect(isEqual(gameCharSchema, expGameCharSchemaObj));

    const gameCharTool = toolDtoToAPIParam(GameCharacter);
    expect(isEqual(gameCharTool, expGameCharToolObj));

    /** test-2-2: updateProperty:  enum, enum array */
    updateProperty(GameCharacter, 'roles', {
      // affect child class
      enum: ['hero'],
    });
    updateProperty(GameCharacter, 'status', {
      // affect child class
      enum: ['unknown'],
    });
    updateProperty(GameCharacter, 'level', {
      description: 'Updated level description',
    });
    const gameCharUpdatedSchema = toolDtoToSchema(GameCharacter);
    /** TODO: deepcopy expGameCharSchemaObj */
    expGameCharSchemaObj.properties.status.enum = ['unknown'];
    expGameCharSchemaObj.properties.roles.items.enum = ['hero'];
    expGameCharSchemaObj.properties.level.description =
      'Updated level description';
    expect(isEqual(gameCharUpdatedSchema, expGameCharSchemaObj));

    /** test-2-2 complex nested json schema case */
    const gameCharV2Tool = toolDtoToAPIParam(GameCharacterV2);
    expect(isEqual(gameCharV2Tool, expGameCharV2ToolObj));

    updateProperty(GameCharacterV2, 'banks.bankName', {
      description: 'New bankname description',
    });

    const gameCharV2Tool2 = toolDtoToAPIParam(GameCharacterV2, {
      location: {
        description: 'New location description',
      },
      'location.country': {
        description: 'New country description',
      },
    });
    /** TODO: deepcopy expGameCharV2ToolObj */
    expGameCharV2ToolObj.function.parameters.properties.location.description =
      'New location description';
    expGameCharV2ToolObj.function.parameters.properties.location.properties.country.description =
      'New country description';
    expGameCharV2ToolObj.function.parameters.properties.banks.items.properties.bankName.description =
      'New bankname description';
    expect(isEqual(gameCharV2Tool2, expGameCharV2ToolObj));

    /** test-2-3 three level object */
    updateProperty(FirstLevelDto, 'secondLevelObj.thirdLevelObjs.name', {
      enum: ['E', 'F', 'G', 'H'],
    });
    const firstLevelDto = toolDtoToAPIParam(FirstLevelDto);
    expect(isEqual(firstLevelDto, firstLevelDtoToolObj));

    /** test-3: addProperty case */
    class TicketLLMAnswer {}
    addProperty(TicketLLMAnswer, 'ticketTitle1', {
      type: 'string',
      description: 'answer',
    });
    addProperty(TicketLLMAnswer, 'ticketTitle2', {
      enum: ['optionName1', 'optionName2'],
      isOptional: true,
    });
    const ticketLLMAnswerSchema = toolDtoToSchema(TicketLLMAnswer);
    expect(
      isEqual(ticketLLMAnswerSchema, {
        type: 'object',
        properties: {
          ticketTitle1: {
            type: 'string',
            description: 'answer',
          },
          ticketTitle2: {
            type: 'string',
            enum: ['optionName1', 'optionName2'],
          },
        },
        required: ['ticketTitle1'],
      }),
    );
  });
});
