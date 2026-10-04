import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, google: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { caughtErrors: 'none' }] },
  },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['proxy/**/*.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules: { 'no-undef': 'error' } },
];
