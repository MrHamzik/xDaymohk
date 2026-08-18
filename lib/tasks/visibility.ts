import type { Task } from '@/lib/types';

/**
 * Видно ли ещё закрытое задание сторонам сделки.
 *
 * Отмена больше не прячет задание мгновенно (обновление 38). Раньше
 * `is_archived = true` выкидывало его из ленты у заказчика, а у
 * исполнителя оно продолжало висеть в «В работе» как живое: ни следа,
 * ни объяснения ни одной из сторон.
 *
 * Теперь при отмене ставится `visible_until = now + 7 суток`, и обе
 * стороны видят карточку с пометкой «Отменено». Правило проверяется и
 * здесь, на клиенте: до применения миграции колонки нет, и тогда
 * возвращаем true — прежнее поведение, а не пустой экран.
 */
export function isTaskStillVisible(task: Task): boolean {
  if (!task.visibleUntil) return true;
  const until = Date.parse(task.visibleUntil);
  if (!Number.isFinite(until)) return true;
  return until > Date.now();
}

/** Задание закрыто отменой и показывается только ради пометки «Отменено». */
export function isTaskCancelled(task: Task): boolean {
  return task.status === 'cancelled';
}
