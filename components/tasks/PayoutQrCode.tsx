'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n';
import {
  isPaymentMethod, payoutQrHref,
  type PaymentMethod, type PayoutMethods,
} from '@/lib/payments';

interface PayoutQrCodeProps {
  method: PaymentMethod | string;
  payout: PayoutMethods | null | undefined;
  amount: number;
  comment?: string;
  /** Сторона квадрата в CSS-пикселях. */
  size?: number;
}

/**
 * QR со ссылкой на реквизиты.
 *
 * Белый квадрат — тихая зона кода (камера без неё не читает), не рамка
 * карточки. Ссылку собираем после монтирования: для СБП/карты нужен
 * origin, на SSR его нет.
 */
export default function PayoutQrCode({
  method, payout, amount, comment, size = 168,
}: PayoutQrCodeProps) {
  const { t } = useI18n();
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!payout || !isPaymentMethod(method) || method === 'cash') {
      setSvg('');
      return;
    }
    const href = payoutQrHref(method, payout, amount, comment);
    if (!href) {
      setSvg('');
      return;
    }

    let cancelled = false;
    void QRCode.toString(href, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      // 4 модуля тихой зоны — требование к QR, не декоративная обводка.
      margin: 4,
      width: size,
      color: {
        dark: '#18181b',
        light: '#ffffff',
      },
    }).then((out) => {
      if (cancelled) return;
      setSvg(out.startsWith('<svg') ? out : '');
    }).catch(() => {
      if (!cancelled) setSvg('');
    });

    return () => { cancelled = true; };
  }, [method, payout, amount, comment, size]);

  if (!svg) return null;

  return (
    <div className="flex justify-center py-2">
      <div
        className="bg-white"
        style={{ boxShadow: '0 0 36px -10px rgb(var(--smk-gold-rgb) / 0.55)' }}
        role="img"
        aria-label={t.payoutQrTitle}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

interface PayoutQrBlockProps extends PayoutQrCodeProps {
  /**
   * Скрыть код за кнопкой. Нужно исполнителю: он показывает телефон
   * заказчику, а в карточке код не должен занимать экран сразу.
   */
  reveal?: boolean;
}

/** Заголовок, код и честная подсказка — без обещания «оплаты по QR». */
export function PayoutQrBlock({
  method, payout, amount, comment, size, reveal = false,
}: PayoutQrBlockProps) {
  const { t } = useI18n();
  const [canShow, setCanShow] = useState(false);
  const [open, setOpen] = useState(!reveal);

  useEffect(() => {
    if (!payout || !isPaymentMethod(method) || method === 'cash') {
      setCanShow(false);
      return;
    }
    setCanShow(Boolean(payoutQrHref(method, payout, amount, comment)));
  }, [method, payout, amount, comment]);

  if (!canShow) return null;

  const yoo = method === 'yoomoney';
  const body = (
    <>
      {reveal && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          {open ? t.close : t.taskPayoutQrShow}
        </button>
      )}

      {open && (
        <>
          <h4 className={`smk-sheet-label ${reveal ? 'mt-3' : ''} mb-1.5`}>
            {t.payoutQrTitle}
          </h4>
          <PayoutQrCode
            method={method}
            payout={payout}
            amount={amount}
            comment={comment}
            size={size ?? (reveal ? 220 : 168)}
          />
          <p className="smk-meta mt-1.5 smk-text-label leading-relaxed">
            {yoo ? t.payoutQrYooHint : t.payoutQrHint}
          </p>
        </>
      )}
    </>
  );

  if (reveal) {
    return <div className="smk-sheet-section px-4 py-3.5">{body}</div>;
  }

  return (
    <div>
      <hr className="smk-orn my-3" />
      {body}
    </div>
  );
}
