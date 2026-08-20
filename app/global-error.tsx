'use client';

import { useEffect } from 'react';

/**
 * Аварийный экран верхнего уровня.
 *
 * app/error.tsx ловит ошибки ВНУТРИ страницы, но не ошибки самого
 * корневого layout: провайдеры (тема, настройки, авторизация) живут выше
 * него. Если падает провайдер, Next.js не находит границу ошибки и
 * показывает пустую белую страницу — ровно то, что было видно после
 * авторизации: белый экран, на котором ничего не происходит и не за что
 * зацепиться.
 *
 * global-error.tsx заменяет собой весь документ (поэтому здесь свои
 * <html> и <body>) и хотя бы объясняет человеку, что случилось, и даёт
 * кнопки. Без него единственным выходом была перезагрузка вслепую.
 *
 * Экран намеренно без Tailwind-классов и без иконок: если упал layout,
 * стили и шрифты могут быть не загружены. Только инлайновый стиль.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Root layout error:', error);
  }, [error]);

  // Прокрутку мог заблокировать модальный экран или гид, упавший
  // посередине. Снимаем блокировку, иначе аварийная страница тоже
  // окажется не прокручиваемой.
  useEffect(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }, []);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Приложение не смогло запуститься
          </h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#475569', margin: '0 0 1rem' }}>
            Это сбой в самом приложении, а не в ваших данных. Ничего не потеряно.
            Попробуйте открыть заново — если экран останется белым, пришлите
            код ниже в поддержку, по нему видно, что именно сломалось.
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.75rem',
                color: '#64748b',
                background: '#e2e8f0',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                margin: '0 0 1rem',
                wordBreak: 'break-all',
              }}
            >
              Код ошибки: {error.digest}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: '2.75rem',
                padding: '0 1.25rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Попробовать снова
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              style={{
                minHeight: '2.75rem',
                padding: '0 1.25rem',
                borderRadius: '0.75rem',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              На главную
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
