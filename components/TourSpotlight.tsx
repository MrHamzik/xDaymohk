'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Подсветка живой кнопки во время гида.
 *
 * Раньше гид просто рассказывал: «внизу пять кнопок, средняя с плюсом».
 * Человеку постарше этого мало — он читает текст и не понимает, о какой
 * кнопке речь. Здесь гид показывает пальцем: экран затемняется, а вокруг
 * настоящей кнопки остаётся светлое окно с рамкой.
 *
 * Как ищем цель: по атрибуту data-tour, проставленному в нижней панели и
 * в полосе виджетов. Раскладка телефона и компьютера разная, поэтому
 * принимаем список меток и берём первую ВИДИМУЮ (у скрытых элементов
 * ширина и высота равны нулю).
 *
 * Если ни одна метка не нашлась — не рисуем ничего. Шаг тогда выглядит
 * обычной карточкой: гид не должен ломаться из-за перевёрстанной панели.
 */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Ищет первый видимый элемент из списка меток. */
function findTarget(marks: string[]): HTMLElement | null {
  for (const mark of marks) {
    const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${mark}"]`);
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return node;
    }
  }
  return null;
}

export default function TourSpotlight({
  marks,
  interactive = false,
}: {
  marks: string[];
  /**
   * true — разрешить нажать подсвеченную кнопку и прокрутить страницу.
   * Нужно шагам, где человек сам открывает «Каталог» или «Меню».
   * По умолчанию интерфейс под подсветкой заблокирован.
   */
  interactive?: boolean;
}) {
  const [box, setBox] = useState<Box | null>(null);

  // Блокировка страницы на время гида.
  //
  // Затемнение — это просто тень, сквозь неё прекрасно нажимались
  // кнопки и крутилась страница: человек уезжал от подсвеченного
  // элемента и терял нить. Прокрутку глушим на <html>, а клики
  // перехватывает отдельный слой-ловушка ниже.
  useEffect(() => {
    if (interactive) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = previous; };
  }, [interactive]);

  useEffect(() => {
    if (marks.length === 0) {
      setBox(null);
      return;
    }

    // Рамка чуть больше самой кнопки, иначе подсветка липнет к краям.
    const PAD = 8;

    const measure = () => {
      const target = findTarget(marks);
      if (!target) {
        setBox(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setBox({
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      });
    };

    measure();

    // Панель может переехать: поворот экрана, появление клавиатуры,
    // прокрутка страницы под окном гида. Пересчитываем на каждое такое
    // событие, иначе окно подсветки уедет от кнопки.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    // Ленивая отрисовка панели (шрифты, иконки) сдвигает элементы уже
    // после первого замера — следим за размерами через ResizeObserver.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [marks]);

  if (typeof document === 'undefined') return null;

  // Ловушка нажатий.
  //
  // Затемнение — это просто тень, сквозь неё прекрасно нажимались кнопки.
  // Поэтому поверх интерфейса кладём прозрачный слой, который съедает
  // нажатия и прокрутку колесом или пальцем.
  //
  // В интерактивном режиме нужен слой С ДЫРКОЙ: человек должен нажать
  // «Каталог» и прокрутить список, но не разбредаться по остальному
  // интерфейсу. Дырку делаем четырьмя полосами вокруг подсвеченного
  // места — над ним, под ним, слева и справа. Так до самой кнопки
  // нажатие доходит, а мимо неё — нет.
  const swallow = {
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onWheel: (event: React.WheelEvent) => { if (!interactive) event.preventDefault(); },
    onTouchMove: (event: React.TouchEvent) => { if (!interactive) event.preventDefault(); },
  };

  const blocker = !interactive ? (
    <div className="fixed inset-0 z-[93]" {...swallow} aria-hidden />
  ) : box ? (
    <div className="pointer-events-none fixed inset-0 z-[93]" aria-hidden>
      <div className="pointer-events-auto absolute inset-x-0 top-0" style={{ height: Math.max(box.top, 0) }} {...swallow} />
      <div className="pointer-events-auto absolute inset-x-0 bottom-0" style={{ top: box.top + box.height }} {...swallow} />
      <div className="pointer-events-auto absolute left-0" style={{ top: box.top, height: box.height, width: Math.max(box.left, 0) }} {...swallow} />
      <div className="pointer-events-auto absolute right-0" style={{ top: box.top, height: box.height, left: box.left + box.width }} {...swallow} />
    </div>
  ) : null;

  if (!box) {
    return blocker ? createPortal(blocker, document.body) : null;
  }

  // Портал в body: внутри окна гида подсветка обрезалась бы рамками
  // модального окна. Слой 94 — ниже самого окна (95), но выше нижней
  // панели (40): затемнение ложится на интерфейс, а карточка гида
  // остаётся поверх него и читается.
  return createPortal(
    <>
      {blocker}
      <div className="smk-tour-spotlight pointer-events-none fixed inset-0 z-[94]" aria-hidden>
        {/* Затемнение сделано огромной тенью вокруг выреза: так «дырка»
            получается одним элементом, без четырёх полос по краям и без
            щелей между ними на дробных пикселях. */}
        <div
          className="smk-tour-hole absolute rounded-2xl"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        />
      </div>
    </>,
    document.body,
  );
}
