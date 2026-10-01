import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Type-aware rules resolve each file through its nearest tsconfig (TS-02).
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/generated/**',
      'apps/api/prisma/migrations/**',
      // Validated by `prisma validate`, not ESLint.
      '**/*.prisma',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Config files and the seed sit outside every tsconfig include.
        // This option does not accept `**` globs.
        projectService: {
          allowDefaultProject: [
            '*.js',
            'apps/*/vitest.config.ts',
            'packages/*/vitest.config.ts',
            'apps/*/prisma/*.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Flat config needs the plugin prefix; rules.md TS-02 lists bare names.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-readonly': 'error',

      // Console is for scripts, not request-path code (OPS-07).
      'no-console': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Seeds legitimately use console; they are not request-path code.
    files: ['apps/*/prisma/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Default-project files have no tsconfig, so `process` and
    // `import.meta.dirname` are unresolved and the unsafe-* rules are noise.
    files: [
      '*.js',
      'apps/*/vitest.config.ts',
      'packages/*/vitest.config.ts',
      'apps/*/prisma/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);