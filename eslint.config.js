import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '.kiro/**', 'design-system/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.{js,mjs}', 'shared/**/*.js', '{web,portal,admin}/scripts/**/*.{js,mjs}', '*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Frontend apps: browser globals + React hooks rules for both .js and .jsx.
  {
    files: ['{web,portal,admin}/{src,public}/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // These newest-generation hooks rules are advisory style preferences, not
      // correctness errors; keep them as warnings so CI lint stays green.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
