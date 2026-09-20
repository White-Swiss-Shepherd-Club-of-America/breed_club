import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'src/db/migrations/**'],
  },
  {
    files: ['src/**/*.ts'],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        // Type-aware linting is intentionally off: slow, and not needed for these rules.
        project: false,
      },
    },
    rules: {
      // Pre-existing debt (18 `any`, 31 unused). Warn so the CI gate is green
      // from day one and real errors are not buried; tracked for cleanup.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
