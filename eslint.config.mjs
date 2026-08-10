// Flat ESLint config (ESLint 9) for Next.js 15 projects.
// Uses the new official @next/eslint-plugin-next instead of legacy extends.

import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'data/**'],
  },
];
