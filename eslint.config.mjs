import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Sources covered by a tsconfig: linted with type information. */
const TYPED = [
  'packages/*/src/**/*.{ts,tsx}',
  'examples/demo/src/**/*.{ts,tsx}',
];

/** Raw `pxPerMs` arithmetic: time↔screen math outside the scale module. */
const pxPerMsMath = (node) =>
  `:matches(BinaryExpression[operator='*'], BinaryExpression[operator='/']) > ${node}`;

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      'docs/api/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: TYPED,
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: TYPED,
    rules: {
      // Rethrowing a caught `unknown` (after finishing a batch) is deliberate.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allowThrowingUnknown: true },
      ],
    },
  },
  {
    // Asymmetric matchers (expect.any, …) are typed any by design.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
  {
    files: ['**/*.{jsx,tsx}', 'packages/react/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // Package boundaries (DESIGN.md §2): the engine is framework-free.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'The core engine must not depend on React (§2).',
            },
            {
              group: ['@event-timeline/*'],
              message: 'The core engine must not import other packages (§2).',
            },
          ],
        },
      ],
    },
  },
  // Single source of coordinate truth (DESIGN.md §3): time↔screen arithmetic
  // lives in the scale module; everything else calls the Camera helpers.
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/core/src/scale/**',
      'packages/core/src/testing/**',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "Identifier[name='pxPerMs']",
          "MemberExpression[property.name='pxPerMs']",
        ].map((node) => ({
          selector: pxPerMsMath(node),
          message:
            'Convert time↔screen through the Camera (timeToScreenX, durationToPx, …), not raw pxPerMs math (§3).',
        })),
      ],
    },
  },
  prettier,
);
