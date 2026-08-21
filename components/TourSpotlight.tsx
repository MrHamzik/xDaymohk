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

export default function TourSpotlight({ marks }: { marks: string[] }) {
  const [box, setBox] = useState<Box | null>(null);
  // Родитель отдаёт новый массив на каждый рендер. Зависеть от него
  // напрямую нельзя — эффект пересоздавал бы наблюдателей без конца.
  const marksKey = marks.join('|');

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

      // Отступ прижимаем к границам экрана.
      //
      // Нижняя панель занимает всю ширину и стоит вплотную к низу.
      // Прибавляя PAD со всех сторон, мы уводили вырез за края экрана:
      // рамка обрезалась, и маска заметно не совпадала с самой панелью.
      // Теперь вырез не вылезает за видимую область — по краям он
      // ложится ровно на границу элемента.
      const top = Math.max(rect.top - PAD, 0);
      const left = Math.max(rect.left - PAD, 0);
      const right = Math.min(rect.right + PAD, window.innerWidth);
      const bottom = Math.min(rect.bottom + PAD, window.innerHeight);

      const next = {
        top,
        left,
        width: Math.max(right - left, 0),
        height: Math.max(bottom - top, 0),
      };
      // Обновляем состояние ТОЛЬКО при реальном сдвиге. Замер приходит
      // на каждый скролл и каждый кадр наблюдателя; без этой проверки
      // одинаковые значения всё равно рождали новый объект, React
      // перерисовывал портал, и цикл замер-перерисовка не кончался.
      setBox((prev) => (
        prev
          && prev.top === next.top
          && prev.left === next.left
          && prev.width === next.width
          && prev.height === next.height
          ? prev
          : next
      ));
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
    //
    // Наблюдаем ЗА ЦЕЛЬЮ, а не за document.body. Раньше слушали body, и
    // получалась петля: измерили → setBox → перерисовали слои подсветки
    // → изменилась высота body → ResizeObserver → измерили снова.
    // React упирался в «Maximum update depth exceeded», а браузер
    // молотил вхолостую — отсюда же и общая медлительность страниц.
    const target = findTarget(marks);
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  if (typeof document === 'undefined') return null;

  // Ловушек нажатий здесь больше нет.
  //
  // Раньше поверх интерфейса лежали прозрачные слои, съедавшие клики, и
  // на интерактивных шагах в них прорезалась «дырка» из четырёх полос.
  // Слой работал только до тех пор, пока над ним не оказывалось окно с
  // большим z-index (выезд меню, шторка, анкета), а на шаге с каталогом
  // его снимали целиком — оттуда и жалобы п.17/п.18.
  //
  // Теперь запретом занимается useTourLock: один обработчик на document
  // в фазе перехвата, которому z-index безразличен. Здесь остаётся
  // только картинка — затемнение, размытие и вырез.

  // Размытие фона (п.35): четыре полосы ВОКРУГ выреза. Повесить
  // backdrop-filter на слой с дыркой нельзя — размылась бы и сама
  // подсвеченная кнопка. Полосы не перехватывают события: за нажатия
  // отвечает useTourLock.
  const blur = box ? (
    <div className="pointer-events-none fixed inset-0 z-[92]" aria-hidden>
      <div className="smk-tour-blur absolute inset-x-0 top-0" style={{ height: Math.max(box.top, 0) }} />
      <div className="smk-tour-blur absolute inset-x-0 bottom-0" style={{ top: box.top + box.height }} />
      <div className="smk-tour-blur absolute left-0" style={{ top: box.top, height: box.height, width: Math.max(box.left, 0) }} />
      <div className="smk-tour-blur absolute right-0" style={{ top: box.top, height: box.height, left: box.left + box.width }} />
    </div>
  ) : (
    // Шаг без подсветки: размываем экран целиком.
    <div className="smk-tour-blur pointer-events-none fixed inset-0 z-[92]" aria-hidden />
  );

  if (!box) {
    return createPortal(
      <>
        {blur}
        {/* Шаг без подсветки всё равно должен затемнять фон, иначе
            карточка висит на светлом интерфейсе и читается плохо. */}
        <div className="pointer-events-none fixed inset-0 z-[94] bg-zinc-950/70" aria-hidden />
      </>,
      document.body,
    );
  }

  // Портал в body: внутри окна гида подсветка обрезалась бы рамками
  // модального окна. Слой 94 — ниже самого окна (95), но выше нижней
  // панели (40): затемнение ложится на интерфейс, а карточка гида
  // остаётся поверх него и читается.
  return createPortal(
    <>
      {blur}
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
