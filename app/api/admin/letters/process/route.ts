import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * POST /api/admin/letters/process
 * Доставляет запланированные письма, чьё время наступило.
 *
 * Два пути доставки:
 *  1) RPC  — SQL-функция process_letter_schedule() (из supabase/update/
 *            15-letters-deliver-delete.sql). Основной путь, вызывается также
 *            pg_cron каждые 5 минут.
 *  2) node — если RPC недоступен (функция не создана/ошибка в БД), доставка
 *            выполняется здесь же средствами приложения (insert в
 *            notifications, журнал letter_log, удаление из очереди). Это
 *            гарантирует, что запланированные письма отправятся, даже если
 *            SQL-функция не была применена.
 *
 * Возвращает { success, processed, method: 'rpc'|'node', rpcError? } — чтобы
 * админ видел, каким способом доставлено и не нужно ли применить SQL 15.
 */

/** Доставка в Node: выбирает готовые строки очереди, шлёт уведомления,
 *  пишет в журнал и удаляет из очереди (повторяющиеся письма планирует снова). */
async function deliverInNode(admin: ReturnType<typeof createAdminClient> & NonNullable<unknown>): Promise<number> {
  if (!admin) throw new Error('Service role not configured');
  const now = new Date().toISOString();

  const { data: due, error: dueError } = await admin
    .from('letter_schedule')
    .select('id, letter_id, run_at')
    .eq('processed', false)
    .lte('run_at', now)
    .limit(50);
  if (dueError) throw new Error(`Очередь: ${dueError.message}`);
  if (!due || due.length === 0) return 0;

  const letterIds = Array.from(new Set(due.map((r: any) => String(r.letter_id)).filter(Boolean)));
  let letterMap = new Map<string, any>();
  if (letterIds.length > 0) {
    const { data: letterRows, error: letterError } = await admin.from('letters').select('*').in('id', letterIds);
    if (letterError) throw new Error(`Шаблоны: ${letterError.message}`);
    letterMap = new Map((letterRows || []).map((l: any) => [String(l.id), l]));
  }

  let processed = 0;
  for (const row of due as any[]) {
    const letter = letterMap.get(String(row.letter_id));
    if (!letter) continue; // шаблон удалён — пропускаем (и удаляем из очереди ниже)

    // Получатели: все пользователи (для 'selected' выбранные в UI не хранятся в БД).
    const { data: users } = await admin.from('user_profiles').select('id');
    const recipientIds = (users || []).map((u: any) => String(u.id));

    // 1) Уведомления чанками.
    if (recipientIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < recipientIds.length; i += CHUNK) {
        const chunk = recipientIds.slice(i, i + CHUNK);
        const notifRows = chunk.map((uid: string) => ({
          id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          recipient_id: uid,
          type: 'system',
          title: letter.title_ru || 'Уведомление',
          message: letter.message_ru || '',
          title_ce: letter.title_ce || null,
          message_ce: letter.message_ce || null,
          sender: letter.sender || 'Даймохк',
          is_read: false,
          created_at: now,
        }));
        const { error: insError } = await admin.from('notifications').insert(notifRows);
        if (insError) throw new Error(`Уведомления: ${insError.message}`);
      }
    }

    // 2) Журнал = «Отправленные».
    await admin.from('letter_log').insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      letter_id: letter.id,
      title_ru: letter.title_ru || '',
      title_ce: letter.title_ce || null,
      message_ru: letter.message_ru || '',
      message_ce: letter.message_ce || null,
      sender: letter.sender || 'Даймохк',
      preset: letter.preset || 'green',
      color: letter.color || null,
      icon: letter.icon || '📩',
      recipient_ids: recipientIds,
      count: recipientIds.length,
      sent_at: now,
    });

    // 3) Счётчик отправок.
    const sentSoFar = Number(letter.schedule_sent) || 0;
    await admin.from('letters').update({ schedule_sent: sentSoFar + 1 }).eq('id', letter.id);

    // 4) Повторяющиеся письма — планируем следующий запуск.
    if (letter.schedule_repeat && letter.schedule_repeat !== 'once' && (Number(letter.schedule_count) === 0 || sentSoFar + 1 < Number(letter.schedule_count))) {
      const intervalDays = letter.schedule_repeat === 'daily' ? 1 : (Number(letter.schedule_days) || 1);
      await admin.from('letter_schedule').insert({
        id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        letter_id: letter.id,
        run_at: new Date(Date.now() + intervalDays * 86_400_000).toISOString(),
        processed: false,
      });
    }

    // 5) Доставленное — УДАЛЯЕМ из очереди (перешло в «Отправленные»).
    await admin.from('letter_schedule').delete().eq('id', String(row.id));

    processed += 1;
  }
  return processed;
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 30 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // 1) Основной путь — SQL-функция.
  let rpcError: string | null = null;
  try {
    const { data, error } = await admin.rpc('process_letter_schedule');
    if (!error) {
      return NextResponse.json({ success: true, processed: Number(data ?? 0), method: 'rpc' });
    }
    rpcError = error.message;
  } catch (e) {
    rpcError = e instanceof Error ? e.message : String(e);
  }

  // 2) Fallback — доставка средствами приложения.
  try {
    const processed = await deliverInNode(admin);
    return NextResponse.json({
      success: true,
      processed,
      method: 'node',
      rpcError,
    });
  } catch (e) {
    const fallbackError = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      error: `Доставка не удалась. SQL-функция: ${rpcError}. Приложение: ${fallbackError}`,
    }, { status: 500 });
  }
}
