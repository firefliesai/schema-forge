import { isEqual } from 'lodash';

import {
  classToLLMTool,
  classToJsonSchema,
  updateSchemaProperty,
  addSchemaProperty,
} from './schema-forge';
import {
  GameCharacter,
  GameCharacterV2,
  GameCharacterToolName,
  GameCharacterToolDesc,
  FirstLevelDto,
} from './fixture/complex-class.tool.dto';
import { User, User2} from './fixture/simple-class.tool.dto';

/** TODO: 
 * 1. add nested nested object case
 * 2. add empty description case (`@ToolDtoProp()`)
 * 3. turn these tests to snapshot tests & remove isEqual
 */
describe('class to json schema test', () => {
  it('1 simple classes: classToJsonSchema, inheritance, classToJsonSchema with temp updated property, updateSchemaProperty (permanently)', async () => {
    const user2JsonSchemaTempChangeID2 = classToJsonSchema(User2, {
      id2: { description: 'temp updated id2 description' },
    });
    expect(user2JsonSchemaTempChangeID2).toMatchSnapshot('1-1 inheritance class: classToJsonSchema with temp updated property');

    const user2JsonSchema = classToJsonSchema(User2);
    expect(user2JsonSchema).toMatchSnapshot('1-2 inheritance class: classToJsonSchema and should not affected by temp updated property');

    updateSchemaProperty(User2, 'id2', {
      description: 'permanently updated id2 description',
    });
    const user2JsonSchemaPersistChangeID2 = classToJsonSchema(User2);
    expect(user2JsonSchemaPersistChangeID2).toMatchSnapshot('1-3 inheritance class: updateSchemaProperty desc (permanently) and classToJsonSchema');

    const userJsonSchema = classToJsonSchema(User);
    expect(userJsonSchema).toMatchSnapshot('1-4 parent class: classToJsonSchema (should not be affected by child class update)');
  });

  it('2 complex: array and enum class: classToJsonSchema, classToLLMTool, updateSchemaProperty (permanently) w/ enum, ', async () => {  
    /** complex json schema case */
    const gameCharSchema = classToJsonSchema(GameCharacter);
    expect(gameCharSchema).toMatchSnapshot('2-1 complex classToJsonSchema');

    const gameCharTool = classToLLMTool(GameCharacter);
    expect(gameCharTool.type).toBe('function');
    expect(gameCharTool.function.name).toBe(GameCharacterToolName);
    expect(gameCharTool.function.description).toBe(GameCharacterToolDesc);
    expect(isEqual(gameCharTool.function.parameters, gameCharSchema)).toBe(true);

    /** updateSchemaProperty: enum, enum array */
    updateSchemaProperty(GameCharacter, 'roles', {
      enum: ['hero'],
    });
    updateSchemaProperty(GameCharacter, 'status', {
      enum: ['unknown'],
    });
    updateSchemaProperty(GameCharacter, 'level', {
      description: 'Updated level description',
    });
    const gameCharUpdatedSchema = classToJsonSchema(GameCharacter);
    gameCharSchema.properties.status.enum = ['unknown'];
    gameCharSchema.properties.roles.items.enum = ['hero'];
    gameCharSchema.properties.level.description =
      'Updated level description';
    expect(isEqual(gameCharUpdatedSchema, gameCharSchema)).toBe(true);
  });

  it('3 complex nested_object class: classToLLMTool, updateSchemaProperty (permanently) w/ enum, ', async () => {  
    /** complex nested json schema case */
    const gameCharV2Tool = classToLLMTool(GameCharacterV2);
    expect(gameCharV2Tool).toMatchSnapshot('3-1 complex nested_object: classToLLMTool');

    updateSchemaProperty(GameCharacterV2, 'banks.bankName', {
      description: 'New bankname description',
    });

    const gameCharV2Tool2 = classToLLMTool(GameCharacterV2, {
      location: {
        description: 'New location description',
      },
      /** FIXME: does not take an effect */
      'location.country': {
        description: 'New country description',
      },
    });
    gameCharV2Tool.function.parameters.properties.location.description =
      'New location description';
    gameCharV2Tool.function.parameters.properties.banks.items.properties.bankName.description =
      'New bankname description';
    gameCharV2Tool.function.parameters.properties.location.properties.country.description =
      'New country description';      
    // expect(gameCharV2Tool2).toMatchSnapshot('3-2 complex nested_object: updateSchemaProperty and classToLLMTool with temp update');
    expect(isEqual(gameCharV2Tool2, gameCharV2Tool)).toBe(true);
  });

  it('4 complex nested nested three layer class: classToLLMTool,updateSchemaProperty (permanently) w/ enum ', async () => {  
    updateSchemaProperty(FirstLevelDto, 'secondLevelObj.thirdLevelObjs.name', {
      enum: ['E', 'F', 'G', 'H'],
    });
    const firstLevelDto = classToLLMTool(FirstLevelDto);
    /** FIXME: it should be ['E', 'F', 'G', 'H'] but it is ['A', 'B', 'C', 'D'] */
    expect(firstLevelDto).toMatchSnapshot('4-1');
  });

  it('5 addSchemaProperty case', async () => {  
    class TicketLLMAnswer {}
    addSchemaProperty(TicketLLMAnswer, 'ticketTitle1', {
      type: 'string',
      description: 'answer',
    });
    addSchemaProperty(TicketLLMAnswer, 'ticketTitle2', {
      enum: ['optionName1', 'optionName2'],
      isOptional: true,
    });
    const ticketLLMAnswerSchema = classToJsonSchema(TicketLLMAnswer);
    expect(ticketLLMAnswerSchema).toMatchSnapshot('4-2');
  });
});
