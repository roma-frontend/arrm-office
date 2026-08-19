import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Ignore generated files
    'convex/_generated/**',
    'analyze-translations.js',
    // Ignore config files
    '*.config.js',
    '*.config.mjs',
    '*.config.ts',
    // Jest transformer for convex-test (plain CommonJS tooling file)
    'jest.convexTestTransform.js',
    // Standalone script not in tsconfig
    'ocr_extract.mjs',
    // Ignore scripts
    'scripts/**',
    'remove-console-logs.js',
    // Ignore tests
    'src/__tests__/**',
    'tests/**',
    // Ignore storybook
    '.storybook/**',
    '**/*.stories.tsx',
    // Ignore coverage
    'coverage/**',
    // Ignore public
    'public/**',
  ]),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Warn on explicit any — gradually migrate to strict types
      '@typescript-eslint/no-explicit-any': 'warn',

      // Warning for unsafe operations (migrate to strict types gradually)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Catch unused variables (allow _ prefix for intentionally unused)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Warn on console usage (error/warn are allowed)
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Allow anonymous default exports for Next.js pages
      'import/no-anonymous-default-export': 'off',

      // React rules — CRITICAL: rules-of-hooks must be error!
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'off',
      'react/jsx-no-undef': 'error',
      'react-hooks/refs': 'warn',

      // TypeScript rules
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
]);

export default eslintConfig;
