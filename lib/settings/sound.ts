'use client';

/**
 * Звук уведомления.
 *
 * Генерируется через Web Audio API, а не грузится файлом. Причины:
 *  - в проекте нет папки public/, отдавать статику было бы негде;
 *  - короткий сигнал в mp3 — это лишние 10–20 КБ и ещё один запрос;
 *  - синтез даёт одинаковый результат во всех браузерах.
 *
 * Браузеры блокируют автовоспроизведение до первого действия
 * пользователя, поэтому ошибки глушим: беззвучное уведомление лучше
 * исключения в консоли.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioContext) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioContext = new Ctor();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/** Короткий двухнотный сигнал: мягкий, не резкий. */
export function playNotificationSound(): void {
  const context = getContext();
  if (!context) return;

  try {
    // Контекст засыпает, когда вкладка была неактивна.
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    // Плавные фронты: щелчок на резком старте/стопе слышен сильнее
    // самого сигнала.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    for (const [index, frequency] of [880, 1174.7].entries()) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.2);
    }
  } catch {
    // автовоспроизведение запрещено — молчим
  }
}
