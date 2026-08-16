import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * DELETE /api/admin/letters/log/[id]
 * Удаляет запись из «Отправленных» (история letter_log) — красная корзина
 * в архиве, вкладка «Отправленные». Само письмо в БД не трогается.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const { error } = await admin.from('letter_log').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
