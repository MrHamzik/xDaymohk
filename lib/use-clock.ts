'use client';

import { useEffect, useState } from 'react';

/**
 * Тикер для пересчёта рабочего статуса.
 *
 * calculateWorkingStatus() читает текущее время, но React об этом не
 * знает: без внешнего триггера компонент не перерисуется никогда.
 * Из-за этого кольцо статуса «застывало» в том состоянии, каким оно
 * было в момент загрузки страницы — специалист с графиком 9:00–21:00
 * оставался зелёным и в полночь, пока вкладку не обновят вручную.
 *
 * Возвращает метку времени, меняющуюся раз в минуту. Секундная
 * точность здесь не нужна: расписание задаётся в минутах, а лишние
 * перерисовки списка анкет стоят дороже.
 *
 * Тик выравнивается по границе минуты — иначе статус переключался бы
 * с задержкой до 59 секунд после 21:00.
 */
export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = setTimeout(() => {
      setTick((value) => value + 1);
      intervalId = setInterval(() => setTick((value) => value + 1), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return tick;
}
