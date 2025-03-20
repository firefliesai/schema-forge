import { isEqual } from 'lodash';

import {
  classToOpenAITool,
  classToGeminiTool,
  classToAnthropicTool,
  classToGeminiResponseSchema,
  classToJsonSchema,
  classToOpenAIResponseFormatJsonSchema,
  updateSchemaProperty,
  addSchemaProperty,
  ToolProp,
} from './schema-forge';
import {
  GameCharacter,
  GameCharacterV2,
  GameCharacterToolName,
  GameCharacterToolDesc,
  FirstLevelDto,
} from './fixture/complex-class.tool.dto';
import { User, User2 } from './fixture/simple-class.tool.dto';

describe('schema-forge test', () => {
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

  it('2 complex: array and enum class: classToJsonSchema, classToOpenAITool, updateSchemaProperty (permanently) w/ enum, ', async () => {  
    const gameCharSchema = classToJsonSchema(GameCharacter);
    expect(gameCharSchema).toMatchSnapshot('2-1 complex classToJsonSchema');

    const gameCharTool = classToOpenAITool(GameCharacter);
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

  it('3 complex nested_object class: classToOpenAITool, updateSchemaProperty (permanently) w/ enum, ', async () => {  
    const gameCharV2Tool = classToOpenAITool(GameCharacterV2);
    expect(gameCharV2Tool).toMatchSnapshot('3-1 complex nested_object: classToOpenAITool');

    updateSchemaProperty(GameCharacterV2, 'banks.bankName', {
      description: 'New bankname description',
    });

    const gameCharV2Tool2 = classToOpenAITool(GameCharacterV2, {
      location: {
        description: 'New location description',
      },
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
    expect(isEqual(gameCharV2Tool2, gameCharV2Tool)).toBe(true);
  });

  it('4 complex nested nested three layer class: classToOpenAITool,updateSchemaProperty (permanently) w/ enum ', async () => {  
    updateSchemaProperty(FirstLevelDto, 'secondLevelObj.thirdLevelObjs.name', {
      enum: ['E', 'F', 'G', 'H'],
    });
    const firstLevelDto = classToOpenAITool(FirstLevelDto);
    expect(firstLevelDto).toMatchSnapshot('4-1 complex nested nested three layer class: updateSchemaProperty and classToOpenAITool');
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
    expect(ticketLLMAnswerSchema).toMatchSnapshot('5-1 addSchemaProperty case');
  });  

  it('6 class with ToolProp() case', async () => {  
    class SimpleAnswer {
      @ToolProp()
      answer: string;
    }

    const schema = classToJsonSchema(SimpleAnswer);
    expect(schema).toMatchSnapshot('6-1 class with ToolProp()');
  }); 

  it('7 structured output enhancement', async () => {
    // Test enhanced JSON Schema
    const userSchemaEnhanced = classToJsonSchema(User, undefined, true);
    expect(userSchemaEnhanced).toMatchSnapshot('7-1 enhanced JSON Schema');
    
    // Test OpenAI function calling format
    const userToolEnhanced = classToOpenAITool(User, undefined, true);
    expect(userToolEnhanced).toMatchSnapshot('7-2 enhanced OpenAI function calling format');
    
    // Test OpenAI response_format
    const userJsonSchemaFormat = classToOpenAIResponseFormatJsonSchema(User, undefined, true);
    expect(userJsonSchemaFormat).toMatchSnapshot('7-3 OpenAI JSON Schema format for response_format');
  });

  it('8 different LLM formats', async () => {
    // Test Gemini tool format
    const geminiTool = classToGeminiTool(User);
    expect(geminiTool).toMatchSnapshot('8-1 Gemini tool format');
    
    // Test Anthropic tool format
    const anthropicTool = classToAnthropicTool(User);
    expect(anthropicTool).toMatchSnapshot('8-2 Anthropic tool format');
    
    // Test Gemini response schema
    const geminiResponseSchema = classToGeminiResponseSchema(User);
    expect(geminiResponseSchema).toMatchSnapshot('8-3 Gemini response schema');
  });
});
