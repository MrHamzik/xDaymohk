'use client';

import { useEffect, useState } from 'react';
import { cacheBustAvatarUrl } from '@/lib/media';

const FALLBACK = '/icon.png';

interface TaskAvatarProps {
  src?: string | null;
  className?: string;
}

/**
 * Аватар в разделе заданий.
 *
 * Решает две проблемы, всплывшие в консоли:
 *
 * 1. src="" — React ругается («An empty string was passed to the src
 *    attribute»), а браузер повторно скачивает саму страницу. Пустое
 *    значение подменяется на /icon.png ещё до рендера.
 *
 * 2. Google-аватары (lh3.googleusercontent.com) при частых запросах
 *    отдают 429 и картинка ломается. onError один раз переключает на
 *    запасное изображение — без бесконечного цикла перезапросов,
 *    потому что после подмены src больше не меняется.
 *
 * referrerPolicy="no-referrer" — Google охотнее отдаёт аватар без
 * заголовка Referer с localhost.
 */
export default function TaskAvatar({ src, className = '' }: TaskAvatarProps) {
  const initial = src && src.trim() ? cacheBustAvatarUrl(src) : FALLBACK;
  const [current, setCurrent] = useState(initial);

  // Аватар мог подгрузиться позже (список обновился) — синхронизируем.
  useEffect(() => {
    setCurrent(src && src.trim() ? cacheBustAvatarUrl(src) : FALLBACK);
  }, [src]);

  return (
    <img
      src={current}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        // Только один раз: иначе ошибка на самом FALLBACK зациклила бы.
        if (current !== FALLBACK) setCurrent(FALLBACK);
      }}
      className={className}
    />
  );
}
