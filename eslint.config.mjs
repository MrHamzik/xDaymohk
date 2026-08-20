// Flat ESLint config (ESLint 9) for Next.js 15 projects.
// Uses the new official @next/eslint-plugin-next instead of legacy extends.

import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'data/**', 'next-env.d.ts'],
  },

  // Парсер TypeScript. Без него ESLint разбирал только JS: файлы .ts/.tsx
  // молча пропускались с «no matching configuration», и правила Next по
  // ним НЕ работали — прогон был зелёным просто потому, что ничего не
  // проверялось. Отсюда же падал pre-commit на --max-warnings=0.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),

  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      // В коде уже стоят точечные eslint-disable для
      // react-hooks/exhaustive-deps, но сам плагин подключён не был:
      // ESLint падал с «Definition for rule was not found». Правила
      // хуков заодно ловят реальные ошибки зависимостей в useEffect.
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // Правило живёт отдельным блоком: плагин @typescript-eslint
    // подключается только конфигами выше, для .ts/.tsx.
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Неиспользуемые переменные — признак недоделанной правки.
      // Имена с префиксом _ разрешены: так помечают намеренно
      // пропущенные параметры.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Пока предупреждение, а не ошибка: в коде 39 мест с any, и они
      // накопились за всё время — разгребать их надо отдельной задачей,
      // а не блокировать ими каждый коммит. Правило включено, чтобы
      // новые any были видны в прогоне.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
