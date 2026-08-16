import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * GET /api/letters/public
 * Публичное чтение шаблонов писем, нужных клиенту (без админ-токена):
 *   - welcome        — текст приветственного письма (отправляется после регистрации)
 *   - welcome_modal  — тексты модального окна приветствия (онбординг)
 *
 * Отдаёт только публичные поля (заголовки/тексты/отправитель) — никаких
 * внутренних данных и без авторизации. Используется гостем в OnboardingModal
 * (раньше он дёргал /api/admin/letters и получал 401 — тексты из админки
 * никогда не доходили до реального модального окна).
 */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'letters-public' });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 120 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  try {
    const { data, error } = await admin
      .from('letters')
      .select('key, title_ru, title_ce, message_ru, message_ce, sender')
      .in('key', ['welcome', 'welcome_modal'])
      .limit(20);
    if (error) {
      // Таблицы писем ещё не созданы (SQL 09 не применён) — не роняем клиент.
      return NextResponse.json({ letters: [] });
    }
    const letters = (data || []).map((r: any) => ({
      key: r.key ?? null,
      title_ru: r.title_ru ?? '',
      title_ce: r.title_ce ?? '',
      message_ru: r.message_ru ?? '',
      message_ce: r.message_ce ?? '',
      sender: r.sender ?? 'Даймохк',
    }));
    return NextResponse.json({ letters });
  } catch {
    return NextResponse.json({ letters: [] });
  }
}
