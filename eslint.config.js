const tseslint = require('typescript-eslint');
const eslintPluginPrettier = require('eslint-plugin-prettier');

module.exports = [
  // Apply TypeScript ESLint configuration
  ...tseslint.configs.recommended,

  // Use Prettier as an ESLint rule
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],

      // Prettier rules
      'prettier/prettier': 'error',

      // General rules
      'quotes': ['error', 'single', { 'avoidEscape': true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'no-console': 'warn',
      'arrow-parens': ['error', 'always'],
      'max-len': ['warn', {
        'code': 100,
        'ignoreUrls': true,
        'ignoreStrings': true,
        'ignoreTemplateLiterals': true,
        'ignoreRegExpLiterals': true
      }],
    },
  },

  // Configure files to ignore
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.js',
      '**/*.d.ts',
    ],
  },
];
