'use client';

import { useEffect, useRef } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Живое обновление раздела заданий.
 *
 * Без него собеседник не видел чужих действий: исполнитель нажал
 * «Выполнил» — у заказчика в открытой карточке по-прежнему кнопка
 * «Взять», отзыв появлялся только после перезахода. Обновлять по
 * таймеру дорого и всё равно с задержкой, поэтому слушаем Postgres
 * Changes — тот же механизм, что уже используется для уведомлений.
 *
 * Подписываемся на три таблицы:
 *   tasks             — смена статуса, отмена, подтверждение;
 *   task_participants — кто взял задание, отметка явки, исключение;
 *   resident_reviews  — появление взаимной оценки.
 *
 * События приходят пачками (одно действие меняет несколько строк),
 * поэтому перезагрузку склеиваем небольшой задержкой — иначе на один
 * клик ушло бы три-четыре запроса подряд.
 */

const DEBOUNCE_MS = 400;

export function useTasksRealtime(onChange: () => void, enabled = true) {
  // Держим колбэк в ref: иначе новая функция на каждый рендер
  // пересоздавала бы подписку, а это лишние WebSocket-переподключения.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !supabase || !isSupabaseConfigured) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('daymohk-tasks-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_participants' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resident_reviews' }, schedule)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(channel);
    };
  }, [enabled]);
}

/**
 * То же самое для одной открытой карточки: перезагружаем её, когда
 * меняется само задание, его участники или отзывы по нему.
 * Отдельный канал, чтобы фильтровать по task_id на стороне сервера
 * и не будить карточку на каждое чужое событие.
 */
export function useTaskRealtime(taskId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!taskId || !supabase || !isSupabaseConfigured) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`daymohk-task-${taskId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}`,
      }, schedule)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'task_participants', filter: `task_id=eq.${taskId}`,
      }, schedule)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'resident_reviews', filter: `task_id=eq.${taskId}`,
      }, schedule)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(channel);
    };
  }, [taskId]);
}
