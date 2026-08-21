import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const MAX_BODY_BYTES = 64 * 1024; // 64 KB upper bound for CloudTips payload

function getMonthKey(value: string) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safeDate.getUTCFullYear()}-${String(safeDate.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isValidSignature(body: string, provided: string, secret: string) {
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  // Rate limit: 120 req / minute per IP (CloudTips may burst during incidents)
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000 , scope: 'donations' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      Response.json({ code: 1, error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 }
    );
  }

  const secret = process.env.CLOUDTIPS_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return Response.json({ code: 1, error: 'CloudTips webhook is not configured' }, { status: 503 });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ code: 1, error: 'Payload too large' }, { status: 413 });
  }
  const signature = request.headers.get('x-content-hmac') ?? '';
  if (!signature || !isValidSignature(body, signature, secret)) {
    return Response.json({ code: 1, error: 'Invalid signature' }, { status: 403 });
  }

  const form = new URLSearchParams(body);
  const success = form.get('success')?.toLowerCase() === 'true' || form.get('success') === '1';
  const amount = Number(form.get('amount'));
  const transactionId = form.get('transactionid')?.trim();
  const currency = form.get('currency')?.trim() || 'RUB';
  const receivedAt = form.get('createddate') || new Date().toISOString();

  if (!success || !transactionId || !Number.isFinite(amount) || amount <= 0 || currency !== 'RUB') {
    return Response.json({ code: 1, error: 'Invalid donation data' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const operationId = `cloudtips-${transactionId}`;
  const { error: donationError } = await adminClient.from('donations').upsert({
    operation_id: operationId,
    amount,
    currency,
    sender: form.get('name') || null,
    label: form.get('invoiceid') || null,
    received_at: receivedAt,
    raw_payload: Object.fromEntries(form.entries()),
  }, { onConflict: 'operation_id' });

  if (donationError) {
    log.error('Failed to store CloudTips donation:', donationError.message);
    return Response.json({ code: 1, error: 'Storage error' }, { status: 500 });
  }

  const monthKey = getMonthKey(receivedAt);
  const [year, month] = monthKey.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const { data: donations, error: totalError } = await adminClient
    .from('donations')
    .select('amount')
    .gte('received_at', `${monthKey}-01T00:00:00.000Z`)
    .lt('received_at', `${nextMonth}-01T00:00:00.000Z`);

  if (totalError) {
    log.error('Failed to calculate CloudTips total:', totalError.message);
    return Response.json({ code: 1, error: 'Calculation error' }, { status: 500 });
  }

  const total = (donations ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const { data: existingBudget } = await adminClient
    .from('project_support')
    .select('other_costs_rub')
    .eq('month_key', monthKey)
    .maybeSingle();
  const { error: budgetError } = await adminClient.from('project_support').upsert({
    month_key: monthKey,
    collected_rub: total,
    other_costs_rub: Number(existingBudget?.other_costs_rub) || 500,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'month_key' });

  if (budgetError) {
    log.error('Failed to update support progress:', budgetError.message);
    return Response.json({ code: 1, error: 'Progress error' }, { status: 500 });
  }

  return Response.json({ code: 0 });
}
