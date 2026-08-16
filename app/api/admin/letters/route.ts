import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

interface LetterRow {
  id: string;
  key: string | null;
  letter_type: string;
  title_ru: string;
  title_ce: string;
  message_ru: string;
  message_ce: string;
  sender: string;
  preset: string;
  color: string | null;
  icon: string;
  recipients: string;
  created_at: string;
  updated_at: string;
}

function mapLetter(r: any): LetterRow {
  return {
    id: String(r.id),
    key: r.key ?? null,
    letter_type: r.letter_type ?? 'custom',
    title_ru: r.title_ru ?? '',
    title_ce: r.title_ce ?? '',
    message_ru: r.message_ru ?? '',
    message_ce: r.message_ce ?? '',
    sender: r.sender ?? 'Даймохк',
    preset: r.preset ?? 'green',
    color: r.color ?? null,
    icon: r.icon ?? '📩',
    recipients: r.recipients ?? 'all',
    created_at: r.created_at ?? '',
    updated_at: r.updated_at ?? '',
  };
}

/** GET /api/admin/letters — список шаблонов писем. */
export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // Устойчивость: если таблиц ещё нет (SQL 09–10 не применены) — не падаем,
  // а отдаём пустые массивы и пишем в лог причину.
  let letters: any[] = [];
  let queue: any[] = [];
  let sent: any[] = [];
  try {
    const { data, error } = await admin.from('letters').select('*').order('created_at', { ascending: true });
    if (error) {
      log.warn('letters:GET', 'letters query failed', { message: error.message });
    } else {
      letters = data || [];
    }
  } catch (e) {
    log.warn('letters:GET', 'letters query threw', { message: e instanceof Error ? e.message : String(e) });
  }

  try {
    // Очередь без вложенного запроса letters(title_ru): PostgREST требует
    // внешний ключ letter_schedule.letter_id → letters.id, а по SQL 10 его нет,
    // из-за чего запрос падал и очередь всегда была пустой. Читаем строки
    // расписания и названия шаблонов отдельно и соединяем в коде.
    const { data, error } = await admin
      .from('letter_schedule')
      .select('id, letter_id, run_at')
      .eq('processed', false)
      .order('run_at', { ascending: true })
      .limit(50);
    if (error) {
      log.warn('letters:GET', 'letter_schedule query failed', { message: error.message });
    } else {
      const rows = data || [];
      let titleMap = new Map<string, string>();
      const letterIds = Array.from(new Set(rows.map((r: any) => String(r.letter_id)).filter(Boolean)));
      if (letterIds.length > 0) {
        const { data: letterRows, error: letterError } = await admin
          .from('letters')
          .select('id, title_ru')
          .in('id', letterIds);
        if (!letterError && letterRows) {
          titleMap = new Map(letterRows.map((l: any) => [String(l.id), String(l.title_ru || '')]));
        }
      }
      queue = rows.map((r: any) => ({
        id: String(r.id),
        letter_id: String(r.letter_id),
        run_at: r.run_at,
        title_ru: titleMap.get(String(r.letter_id)) || 'Письмо',
      }));
    }
  } catch (e) {
    log.warn('letters:GET', 'letter_schedule query threw', { message: e instanceof Error ? e.message : String(e) });
  }

  // «Отправленные» — история из журнала letter_log (доставленные/отправленные
  // письма). Показываем последние 50.
  try {
    const { data, error } = await admin
      .from('letter_log')
      .select('id, letter_id, title_ru, title_ce, sender, count, sent_at')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (error) {
      log.warn('letters:GET', 'letter_log query failed', { message: error.message });
    } else {
      sent = (data || []).map((r: any) => ({
        id: String(r.id),
        letter_id: String(r.letter_id || ''),
        title_ru: r.title_ru || '',
        title_ce: r.title_ce || '',
        sender: r.sender || 'Даймохк',
        count: Number(r.count ?? 0),
        sent_at: r.sent_at,
      }));
    }
  } catch (e) {
    log.warn('letters:GET', 'letter_log query threw', { message: e instanceof Error ? e.message : String(e) });
  }

  return NextResponse.json({
    letters: letters.map(mapLetter),
    queue: queue.map((r: any) => ({
      id: String(r.id),
      letter_id: String(r.letter_id),
      run_at: r.run_at,
      title_ru: r.letters?.title_ru || 'Письмо',
    })),
    sent,
  });
}

/** PUT /api/admin/letters — создать или обновить шаблон. */
export async function PUT(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Partial<LetterRow> = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 }); }

  const id = String(body.id || `letter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const payload = {
    id,
    key: body.key ?? null,
    letter_type: body.letter_type ?? 'custom',
    title_ru: String(body.title_ru || '').slice(0, 200),
    title_ce: String(body.title_ce || '').slice(0, 200),
    message_ru: String(body.message_ru || '').slice(0, 4000),
    message_ce: String(body.message_ce || '').slice(0, 4000),
    sender: String(body.sender || 'Даймохк').slice(0, 60),
    preset: ['green', 'yellow', 'red', 'custom'].includes(String(body.preset)) ? String(body.preset) : 'green',
    color: body.color ? String(body.color).slice(0, 20) : null,
    icon: String(body.icon || '📩').slice(0, 10),
    recipients: body.recipients === 'selected' ? 'selected' : 'all',
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });
  const { error } = await admin.from('letters').upsert(payload, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, letter: payload });
}
