import { ToolDto, ToolDtoProp } from '../json-schema.utility';

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

/**
 * tip1:
 * 1. for array type, you need to add @ToolDtoProp({items:{type}, or enum instead}. for string/number property, you can just use TypeScript type
 * 2. you can pass TypeScript Enum or [1, 2, 3] or ['a', 'b', 'c'] as enum
 */
@ToolDto({
  name: 'Game Character Configuration',
  description: 'Configure a game character with various attributes',
})
export class GameCharacter {
  // Basic string and number properties
  @ToolDtoProp({ description: 'Character name' })
  name: string;

  @ToolDtoProp({ description: 'Character level' })
  level: number;

  // Basic arrays
  @ToolDtoProp({ description: 'Character titles', items: { type: 'string' } })
  titles: string[];

  @ToolDtoProp({ description: 'Score history', items: { type: 'number' } })
  scores: number[];

  // String enum cases
  @ToolDtoProp({
    description: 'Character current status',
    enum: StatusType,
  })
  status: StatusType;

  @ToolDtoProp({
    description: 'Character allowed statuses',
    enum: StatusType,
  })
  allowedStatuses: StatusType[];

  @ToolDtoProp({
    description: 'Character class type',
    enum: ['Warrior', 'Mage', 'Rogue', 'Priest'],
  })
  classType: string;

  @ToolDtoProp({
    description: 'Character roles',
    enum: ['Tank', 'Healer', 'DPS', 'Support'],
  })
  roles: string[];

  // Number enum cases
  @ToolDtoProp({
    description: 'Character rank',
    enum: RankType,
  })
  rank: RankType;

  @ToolDtoProp({
    description: 'Character available ranks',
    enum: RankType,
  })
  availableRanks: RankType[];

  @ToolDtoProp({
    description: 'Character tier',
    enum: [1, 2, 3, 4, 5],
  })
  tier: number;

  @ToolDtoProp({
    description: 'Character unlocked tiers',
    enum: [1, 2, 3, 4, 5],
  })
  unlockedTiers: number[];
}

export const expGameCharSchemaObj = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Character name',
    },
    level: {
      type: 'number',
      description: 'Character level',
    },
    titles: {
      type: 'array',
      description: 'Character titles',
      items: {
        type: 'string',
      },
    },
    scores: {
      type: 'array',
      description: 'Score history',
      items: {
        type: 'number',
      },
    },
    status: {
      type: 'string',
      description: 'Character current status',
      enum: ['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'],
    },
    allowedStatuses: {
      type: 'array',
      description: 'Character allowed statuses',
      items: {
        type: 'string',
        enum: ['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'],
      },
    },
    classType: {
      type: 'string',
      description: 'Character class type',
      enum: ['Warrior', 'Mage', 'Rogue', 'Priest'],
    },
    roles: {
      type: 'array',
      description: 'Character roles',
      items: {
        type: 'string',
        enum: ['Tank', 'Healer', 'DPS', 'Support'],
      },
    },
    rank: {
      type: 'number',
      description: 'Character rank',
      enum: [1, 2, 3, 4],
    },
    availableRanks: {
      type: 'array',
      description: 'Character available ranks',
      items: {
        type: 'number',
        enum: [1, 2, 3, 4],
      },
    },
    tier: {
      type: 'number',
      description: 'Character tier',
      enum: [1, 2, 3, 4, 5],
    },
    unlockedTiers: {
      type: 'array',
      description: 'Character unlocked tiers',
      items: {
        type: 'number',
        enum: [1, 2, 3, 4, 5],
      },
    },
  },
  required: [
    'name',
    'level',
    'titles',
    'scores',
    'status',
    'allowedStatuses',
    'classType',
    'roles',
    'rank',
    'availableRanks',
    'tier',
    'unlockedTiers',
  ],
};

export const expGameCharToolObj = {
  type: 'function',
  function: {
    name: 'Game Character Configuration',
    description: 'Configure a game character with various attributes',
    parameters: expGameCharSchemaObj,
  },
};

class Location {
  @ToolDtoProp({ description: 'country name' })
  country: string;

  @ToolDtoProp({ description: 'city name' })
  city: string;
}

class Bank {
  @ToolDtoProp({ description: 'bank name' })
  bankName: string;

  @ToolDtoProp({ description: 'account number' })
  account: number;
}

@ToolDto({
  name: 'game_character',
  description: 'Game character with location and bank information',
})
export class GameCharacterV2 {
  // Basic types
  @ToolDtoProp({ description: 'Character name' })
  name: string;

  @ToolDtoProp({ description: 'Character level' })
  level: number;

  // Arrays with explicit type
  @ToolDtoProp({
    description: 'Character titles',
    items: { type: 'string' },
  })
  titles: string[];

  @ToolDtoProp({
    description: 'Score history',
    items: { type: 'number' },
  })
  scores: number[];

  // Enums
  @ToolDtoProp({
    description: 'Character status',
    enum: StatusType,
  })
  status: StatusType;

  @ToolDtoProp({
    description: 'Character rank',
    enum: RankType,
  })
  rank: RankType;

  // Array of enums
  @ToolDtoProp({
    description: 'Available statuses',
    enum: StatusType,
  })
  availableStatuses: StatusType[];

  // Nested objects
  @ToolDtoProp({ description: 'Location info' })
  location: Location;

  @ToolDtoProp({
    description: 'Bank info',
    items: { type: Bank },
  })
  banks: Bank[];
}

export class ThirdLevelDto {
  @ToolDtoProp({
    description: 'ThirdLevelDto name',
    enum: ['A', 'B', 'C', 'D'],
  })
  name: string;
}
export class SecondLevelDto {
  @ToolDtoProp({
    description: 'Character name',
    items: { type: ThirdLevelDto },
  })
  thirdLevelObjs: ThirdLevelDto[];
}
@ToolDto({
  name: '3_level_dto',
  description: 'First level object',
})
export class FirstLevelDto {
  @ToolDtoProp({ description: '2nd level object' })
  secondLevelObj: SecondLevelDto;
}
export const firstLevelDtoToolObj = {
  type: 'function',
  function: {
    name: '3_level_dto',
    description: 'First level object',
    parameters: {
      type: 'object',
      properties: {
        secondLevelObj: {
          type: 'object',
          description: '2nd level object',
          properties: {
            thirdLevelObjs: {
              type: 'array',
              description: 'Character name',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'ThirdLevelDto name',
                    enum: ['E', 'F', 'G', 'H'],
                  },
                },
                required: ['name'],
              },
            },
          },
          required: ['thirdLevelObjs'],
        },
      },
      required: ['secondLevelObj'],
    },
  },
};

export const expGameCharV2ToolObj = {
  type: 'function',
  function: {
    name: 'game_character',
    description: 'Game character with location and bank information',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Character name',
        },
        level: {
          type: 'number',
          description: 'Character level',
        },
        titles: {
          type: 'array',
          description: 'Character titles',
          items: {
            type: 'string',
          },
        },
        scores: {
          type: 'array',
          description: 'Score history',
          items: {
            type: 'number',
          },
        },
        status: {
          type: 'string',
          description: 'Character status',
          enum: ['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'],
        },
        rank: {
          type: 'number',
          description: 'Character rank',
          enum: [1, 2, 3, 4],
        },
        availableStatuses: {
          type: 'array',
          description: 'Available statuses',
          items: {
            type: 'string',
            enum: ['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'],
          },
        },
        location: {
          type: 'object',
          description: 'Location info',
          properties: {
            country: {
              type: 'string',
              description: 'country name',
            },
            city: {
              type: 'string',
              description: 'city name',
            },
          },
          required: ['country', 'city'],
        },
        banks: {
          type: 'array',
          description: 'Bank info',
          items: {
            type: 'object',
            properties: {
              bankName: {
                type: 'string',
                description: 'bank name',
              },
              account: {
                type: 'number',
                description: 'account number',
              },
            },
            required: ['bankName', 'account'],
          },
        },
      },
      required: [
        'name',
        'level',
        'titles',
        'scores',
        'status',
        'rank',
        'availableStatuses',
        'location',
        'banks',
      ],
    },
  },
};
