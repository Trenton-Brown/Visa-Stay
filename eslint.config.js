import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
}

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  module: 'readonly',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
}

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  // Node scripts / config files
  {
    files: ['scripts/**/*.{ts,tsx}', '*.config.{js,cjs,mjs}', 'tailwind.config.js', '.eslintrc.cjs'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'script',
    },
  },
  // ESM config files (this repo is "type": "module") - override the script defaults above
  {
    files: ['eslint.config.js', 'postcss.config.js'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...(tsPlugin.configs.recommended?.rules ?? {}),
      ...(reactHooks.configs.recommended?.rules ?? {}),
      // TS already checks globals/types; this rule causes false positives like HTMLDivElement, React, etc.
      'no-undef': 'off',
      // Keep lint useful without forcing a full refactor right now
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Avoid failing CI on common fast-refresh patterns in shadcn/ui files
      'react-refresh/only-export-components': 'off',
      // Avoid failing CI on warnings while we stabilize tooling
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]

