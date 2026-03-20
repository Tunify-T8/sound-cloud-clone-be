import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default {
  ignores: ['eslint.config.mjs', 'dist', 'node_modules'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.js'],
      parser: tsParser,
      plugins: {
        '@typescript-eslint': tsPlugin,
      },
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        'prettier/prettier': ['error', { endOfLine: 'auto' }],
      },
    },
  ],
};
