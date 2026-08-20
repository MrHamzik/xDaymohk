import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Тесты критичных путей: авторизация админки, приём вебхука
 * пожертвований, ограничение частоты запросов.
 *
 * Окружение node, а не jsdom: проверяются серверные route-обработчики,
 * DOM им не нужен.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Каждый файл в своём процессе: роуты читают process.env на уровне
    // модуля, и общий процесс тянул бы состояние из теста в тест.
    isolate: true,
    restoreMocks: true,
  },
});
