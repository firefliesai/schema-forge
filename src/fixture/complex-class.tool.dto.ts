import { ToolMeta, ToolProp } from '../schema-forge';

enum StatusType {
  Online = 'ONLINE',
  Offline = 'OFFLINE',
  Away = 'AWAY',
  Busy = 'BUSY',
}

enum RankType {
  Novice = 1,
  Intermediate = 2,
  Expert = 3,
  Master = 4,
}

export const GameCharacterToolName  = 'Game Character Configuration';
export const GameCharacterToolDesc  = 'Configure a game character with various attributes';

/**
 * tips:
 * 1. for array or enum type, you need to add @ToolProp({items:{type}, or enum instead}. 
 *    for string/number property, you can just use TypeScript type
 * 2. you can pass TypeScript Enum or [1, 2, 3] or ['a', 'b', 'c'] as enum
 */
@ToolMeta({
  name: GameCharacterToolName,
  description: GameCharacterToolDesc,
})
export class GameCharacter {
  // Basic string and number properties
  @ToolProp({ description: 'Character name' })
  name: string;

  @ToolProp({ description: 'Character level' })
  level: number;

  // Arrays with explicit type
  @ToolProp({ description: 'Character titles', items: { type: 'string' } })
  titles: string[];

  @ToolProp({ description: 'Score history', items: { type: 'number' } })
  scores: number[];

  // String enum cases
  @ToolProp({
    description: 'Character current status',
    enum: StatusType,
  })
  status: StatusType;

  @ToolProp({
    description: 'Character allowed statuses',
    enum: StatusType,
  })
  allowedStatuses: StatusType[];

  @ToolProp({
    description: 'Character class type',
    enum: ['Warrior', 'Mage', 'Rogue', 'Priest'],
  })
  classType: string;

  @ToolProp({
    description: 'Character roles',
    enum: ['Tank', 'Healer', 'DPS', 'Support'],
  })
  roles: string[];

  // Number enum cases
  @ToolProp({
    description: 'Character rank',
    enum: RankType,
  })
  rank: RankType;

  @ToolProp({
    description: 'Character available ranks',
    enum: RankType,
  })
  availableRanks: RankType[];

  @ToolProp({
    description: 'Character tier',
    enum: [1, 2, 3, 4, 5],
  })
  tier: number;

  @ToolProp({
    description: 'Character unlocked tiers',
    enum: [1, 2, 3, 4, 5],
  })
  unlockedTiers: number[];
}

class Location {
  @ToolProp({ description: 'country name' })
  country: string;

  @ToolProp({ description: 'city name' })
  city: string;
}

class Bank {
  @ToolProp({ description: 'bank name' })
  bankName: string;

  @ToolProp({ description: 'account number' })
  account: number;
}

@ToolMeta({
  name: 'game_character',
  description: 'Game character with location and bank information',
})
export class GameCharacterV2 {
  // Basic string and number properties
  @ToolProp({ description: 'Character name' })
  name: string;

  @ToolProp({ description: 'Character level' })
  level: number;

  // Arrays with explicit type
  @ToolProp({
    description: 'Character titles',
    items: { type: 'string' },
  })
  titles: string[];

  @ToolProp({
    description: 'Score history',
    items: { type: 'number' },
  })
  scores: number[];

  // String enum cases
  @ToolProp({
    description: 'Character status',
    enum: StatusType,
  })
  status: StatusType;

  @ToolProp({
    description: 'Character rank',
    enum: RankType,
  })
  rank: RankType;

  // Array of enums
  @ToolProp({
    description: 'Available statuses',
    enum: StatusType,
  })
  availableStatuses: StatusType[];

  // Nested objects
  @ToolProp({ description: 'Location info' })
  location: Location;

  @ToolProp({
    description: 'Bank info',
    items: { type: Bank },
  })
  banks: Bank[];
}

export class ThirdLevelDto {
  @ToolProp({
    description: 'ThirdLevelDto name',
    enum: ['A', 'B', 'C', 'D'],
  })
  name: string;
}
export class SecondLevelDto {
  @ToolProp({
    description: 'Character name',
    items: { type: ThirdLevelDto },
  })
  thirdLevelObjs: ThirdLevelDto[];
}
@ToolMeta({
  name: '3_level_dto',
  description: 'First level object',
})
export class FirstLevelDto {
  @ToolProp({ description: '2nd level object' })
  secondLevelObj: SecondLevelDto;
}


