'use client';

/**
 * OnboardingModal — приветствие при первом открытии приложения.
 *
 * Флоу:
 *   welcome (гостю, один раз в кеше; зарег. не показывается)
 *     ├─ «Руководство» → окно-гид по разделам (Назад → welcome)
 *     ├─ «Войти в Даймохк» → окно согласия (оферта/политика/рассылка)
 *     │     → Google-вход → обязательный гид → окно профиля
 *     └─ «Продолжить как гость» → закрыть
 *
 * При входе как гость из мини-профиля открывается то же окно согласия.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Check, Globe2, LogIn } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import FirstTour from '@/components/FirstTour';
import { useI18n } from '@/lib/i18n';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const ONBOARDED_KEY = 'daymohk-onboarded-v1';
// Флаг «сейчас происходит вход через Google». Хранится в sessionStorage,
// потому что signInWithOAuth — это полный редирект на Google и обратно:
// страница перезагружается, useRef сбрасывается, а sessionStorage переживает
// навигацию в той же вкладке.
const AUTHING_KEY = 'daymohk-onboarding-authing';

function isValidFullName(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((p) => /^[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29}$/.test(p));
}

export default function OnboardingModal() {
  const { account, isLoading, updateAccount, signInWithGoogle, signOut } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { settings } = useSettings();
  const [step, setStep] = useState<'welcome' | 'guide' | 'consent' | 'tour' | 'profile'>('welcome');
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [settlement, setSettlement] = useState('Даймохк');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [telegram, setTelegram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappUsePhone, setWhatsappUsePhone] = useState(true);
  // Текст модального окна приветствия — из БД (раздел «Письма» → «Модальное окно»).
  const [modalText, setModalText] = useState<{ title_ru?: string; title_ce?: string; message_ru?: string; message_ce?: string }>({});
  const [hidePhone, setHidePhone] = useState(false);
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Защита от двойной отправки welcome-письма (useEffect + submit).
  const sentRef = useRef(false);
  const authingRef = useRef(false);

  const ce = language === 'ce';

  // --- Функции (объявлены ДО хуков, чтобы не было ReferenceError) ---

  const sendWelcomeNotification = async () => {
    if (!isSupabaseConfigured || !supabase || !account) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      let title = ce ? 'Марша догIийла хьомечу Даймохка' : 'Добро пожаловать в родной Даймохк';
      let message = ce
        ? 'Хьо Даймохк йукъараллашна тIехьа вош вина! Хьайн анкета кечйина ю — хьо тахана дуьйна каталогехь ву.'
        : 'Вы стали частью сообщества Даймохк! Ваша анкета готова — вы уже в каталоге.';
      let ceTitle = title;
      let ceMessage = message;
      let sender = 'Даймохк';

      try {
        const res = await fetch('/api/letters/public', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const welcome = Array.isArray(data.letters)
            ? data.letters.find((l: any) => l.key === 'welcome')
            : undefined;
          if (welcome) {
            title = welcome.title_ru || title;
            ceTitle = welcome.title_ce || welcome.title_ru || ceTitle;
            message = welcome.message_ru || message;
            ceMessage = welcome.message_ce || welcome.message_ru || ceMessage;
            sender = welcome.sender || sender;
          }
        }
      } catch {}

      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipientId: account.id,
          type: 'system',
          title,
          message,
          ceTitle,
          ceMessage,
          sender,
        }),
      });
    } catch {}
  };

  const finishOnboarding = async () => {
    // Отправляем письмо ТОЛЬКО один раз (независимо от того, сколько раз
    // вызывается finishOnboarding — useEffect, submit, кнопка гостя).
    try { window.localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
    if (!sentRef.current) {
      sentRef.current = true;
      await sendWelcomeNotification();
    }
    setOpen(false);
  };

  // --- Хуки (ВСЕГДА в одном порядке, до return null) ---

  // Показываем welcome ТОЛЬКО гостю, один раз (флаг в localStorage).
  useEffect(() => {
    if (isLoading) return; // ждём, пока выяснится, зареган ли пользователь
    if (account) return; // зарег. — не показываем
    try {
      if (window.localStorage.getItem(ONBOARDED_KEY) === '1') return;
    } catch {}
    setStep('welcome');
    setOpen(true);
  }, [account, isLoading]);

  // Загружаем текст модального окна приветствия из «Писем» (welcome_modal).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/letters/public', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const m = Array.isArray(data.letters)
            ? data.letters.find((l: any) => l.key === 'welcome_modal')
            : undefined;
          if (m) setModalText(m);
        }
      } catch {}
    })();
  }, []);

  // Слушаем глобальное событие «открыть окно согласия» (мини-профиль,
  // когда гость кликает «Войти»). Открываем сразу на шаге consent.
  useEffect(() => {
    const handler = () => {
      if (account) return; // зарег. — не нужно
      setStep('consent');
      setOpen(true);
    };
    window.addEventListener('daymohk-open-consent', handler);
    return () => window.removeEventListener('daymohk-open-consent', handler);
  }, [account]);

  // После появления аккаунта (вход через Google): окно профиля открываем
  // ТОЛЬКО если пользователь только что вошёл (authingRef / sessionStorage),
  // иначе — не перебиваем welcome (п.2: профиль не должен появляться раньше
  // welcome). Флаг читаем и из sessionStorage, потому что вход через Google —
  // это редирект с перезагрузкой страницы, и useRef теряется.
  useEffect(() => {
    if (!account) return;
    let authing = authingRef.current;
    try { if (window.sessionStorage.getItem(AUTHING_KEY) === '1') authing = true; } catch {}
    authingRef.current = false;
    try { window.sessionStorage.removeItem(AUTHING_KEY); } catch {}
    if (!authing) return;

    const fillProfileFields = () => {
      const parts = (account.fullName || '').trim().split(/\s+/).filter(Boolean);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setAvatarUrl(account.avatarUrl || '');
      if (account.phone) setPhone(account.phone);
      if (account.settlement) setSettlement(account.settlement);
    };

    const showProfileStep = () => {
      fillProfileFields();
      setStep('profile');
      setOpen(true);
    };

    const startAfterAuth = () => {
      fillProfileFields();
      let seen = false;
      try { seen = window.localStorage.getItem(`daymohk-tour-${account.id}`) === '1'; } catch { /* private */ }
      if (!settings.tourDone && !seen) {
        setStep('tour');
        setOpen(true);
        return;
      }
      showProfileStep();
    };

    if (isValidFullName(account.fullName || '')) {
      // Имя уже есть — гид и профиль только у новой регистрации.
      void (async () => {
        let isNewUser = false;
        try {
          if (isSupabaseConfigured && supabase) {
            const { data } = await supabase.auth.getUser();
            const createdAt = data?.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
            isNewUser = Number.isFinite(createdAt) && Date.now() - createdAt < 3 * 60_000;
          }
        } catch {}
        if (isNewUser) startAfterAuth();
        else void finishOnboarding();
      })();
      return;
    }
    startAfterAuth();
  }, [account, settings.tourDone]);

  if (!open) return null;

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { compressImageFile } = await import('@/lib/media');
      const url = await compressImageFile(file, true);
      setAvatarUrl(url);
    } catch {
      setError(ce ? 'Сурт кечйан цаелира' : 'Не удалось обработать фото');
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    authingRef.current = true; // после входа откроем окно профиля
    // Редирект на Google перезагружает страницу — продублируем флаг в
    // sessionStorage, чтобы после возврата окно профиля всё же открылось.
    try { window.sessionStorage.setItem(AUTHING_KEY, '1'); } catch {}
    try {
      await signInWithGoogle();
    } catch (authError) {
      authingRef.current = false;
      try { window.sessionStorage.removeItem(AUTHING_KEY); } catch {}
      setError(authError instanceof Error ? authError.message : (ce ? 'Хаамаш ца кхочуш' : 'Не удалось войти через Google'));
    }
  };

  // «Назад» из шага профиля = «выйти из профиля»: выходим из аккаунта и
  // перекидываем на главную (не возвращаемся к welcome).
  const backFromProfile = async () => {
    try { window.sessionStorage.removeItem(AUTHING_KEY); } catch {}
    setOpen(false);
    try { await signOut(); } catch {}
    window.location.href = '/';
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const full = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!isValidFullName(full)) {
      setError(ce ? 'Йоза дика язде: цIе а, фамили а кириллицей.' : 'Введите корректно: имя и фамилию кириллицей.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Доп. поля (телеграм/ватсап/био/галочки) — в localStorage пока.
      try {
        window.localStorage.setItem('daymohk-extra-profile', JSON.stringify({
          telegram, whatsapp, whatsappUsePhone, hidePhone, bio,
        }));
      } catch {}
      await updateAccount({
        fullName: full,
        gender: gender ? (gender as 'male' | 'female') : undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
        settlement: settlement.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      await finishOnboarding();
    } catch (err) {
      setError(err instanceof Error ? err.message : (ce ? 'Хьайн профиль ца лаьцна' : 'Не удалось сохранить профиль'));
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = () => setLanguage(language === 'ru' ? 'ce' : 'ru');

  const guideSections = [
    { emoji: '👥', title: ce ? 'Каталог' : 'Каталог', desc: ce ? 'Специалисташ а, жимхош а, отзываш, рейтингаш' : 'Специалисты и жители, отзывы, рейтинги' },
    { emoji: '🗺️', title: ce ? 'Карта' : 'Карта', desc: ce ? 'ЦIенош, объекташ, анкеташ — кластерашца' : 'Дома, объекты, анкеты — с кластерами' },
    { emoji: '📩', title: ce ? 'Письманаш' : 'Письма', desc: ce ? 'Хьехамаш а, дIевзарш а' : 'Уведомления и рассылки от Даймохка' },
    { emoji: '🚕', title: ce ? 'Вай Такси' : 'Вай Такси', desc: ce ? 'Новкъа вахар юьртахула' : 'Поездки по селу и республике' },
    { emoji: '🛠️', title: ce ? 'Аренца Темщик' : 'Аренца Темщик', desc: ce ? 'Белхан тIедилларш' : 'Оплачиваемые задания и поручения' },
    { emoji: '🤝', title: ce ? 'ГIончалла' : 'ГIончалла', desc: ce ? 'Маьхза гIо а, волонтералла' : 'Помощь и волонтёрство' },
    { emoji: '🕌', title: ce ? 'Къилба' : 'Кибла', desc: ce ? 'Компас Кааба тIе' : 'Компас направления на Каабу' },
    { emoji: '🤖', title: ce ? 'Вайнех Джанна' : 'Вайнех Джанна', desc: ce ? 'Кхетам-ассистент нохчийн маттахь' : 'ИИ-ассистент на чеченском (в планах)' },
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="smk-sheet smk-sign relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl">
        {step === 'welcome' && (
          <div className="relative px-6 pb-6 pt-12">
            <div className="mb-5 text-center">
              <div className="smk-emblem mb-3" aria-hidden="true" />
              <h2 id="onb-title" className="text-xl font-black leading-tight text-slate-900 dark:text-white">
                {ce
                  ? (modalText.title_ce || 'Марша догIийла хьомечу Даймохка')
                  : (modalText.title_ru || 'Добро пожаловать в родной Даймохк')}
              </h2>
            </div>

            <hr className="smk-orn mb-4" />

            <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
              {ce
                ? (modalText.message_ce || 'Хьо авторизаци йан а, профиль кечйан а мега, приложенин доца руководство йилла а, я гостера дIадерзо.')
                : (modalText.message_ru || 'Вы можете авторизоваться и заполнить профиль, открыть краткое руководство по приложению или продолжить в режиме гостя.')}
            </p>

            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => setStep('guide')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                <BookOpen className="h-3.5 w-3.5" />
                {ce ? 'Руководство' : 'Руководство'}
              </button>
              <button type="button" onClick={() => setStep('consent')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                <LogIn className="h-3.5 w-3.5" />
                {ce ? 'Чуйаха Даймохк' : 'Войти в Даймохк'}
              </button>
              <button
                type="button"
                onClick={() => { void finishOnboarding(); window.location.href = '/'; }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {ce ? 'Гостера дIадерзо' : 'Продолжить как гость'}
              </button>
            </div>

            {error && <p className="smk-note smk-note-danger mt-3 px-3 py-2">{error}</p>}

            <div className="mt-4 flex items-center justify-center">
              <button type="button" onClick={toggleLanguage} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Globe2 className="h-3.5 w-3.5" />
                {ce ? 'Русский' : 'Нохчийн'}
              </button>
            </div>
          </div>
        )}

        {step === 'guide' && (
          <div className="relative px-6 pb-6 pt-10">
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setStep('welcome')} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{ce ? 'Руководство' : 'Руководство'}</h2>
            </div>
            <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">{ce ? 'Хьажа, хIара хIун ду Даймохкехь.' : 'Что есть в Даймохке.'}</p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto no-scrollbar">
              {guideSections.map((s) => (
                <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="text-lg">{s.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{s.title}</p>
                    <p className="smk-text-label text-slate-500 dark:text-zinc-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setStep('consent')} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
              <LogIn className="h-3.5 w-3.5" />
              {ce ? 'Чуйаха Даймохк' : 'Войти в Даймохк'}
            </button>
          </div>
        )}

        {step === 'consent' && (
          <div className="relative px-6 pb-6 pt-10">
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setStep('welcome')} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{ce ? 'Бакъо' : 'Согласие'}</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
              {ce ? (
                <>
                  Google чуйаьллачул тIехьа, хьо тIелоцу{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Услови</Link> а,{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Къайлаха политика</Link> а, ткъа иштта бакъо ло{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">рассылке</Link> тIе.
                </>
              ) : (
                <>
                  Войдя через Google, вы принимаете{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Условия</Link> и{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Политику конфиденциальности</Link>, а также соглашаетесь на{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">рассылку</Link>.
                </>
              )}
            </p>
            <button type="button" onClick={() => void handleGoogleAuth()} className="smk-btn-google mt-2 smk-text-label">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white smk-text-label font-black text-blue-600">G</span>
              {ce ? 'Google чуйаха' : 'Войти через Google'}
            </button>
            {error && <p className="smk-note smk-note-danger mt-3 px-3 py-2">{error}</p>}
          </div>
        )}

        {step === 'profile' && (
          <form onSubmit={handleSubmitProfile} className="relative px-6 pb-6 pt-10">
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={backFromProfile} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{ce ? 'Хьайн анкета' : 'Ваш профиль'}</h2>
            </div>
            <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
              {ce ? 'ЦIе а, фамили а язъе — иза массо анкеташкахь хир ду. Кхин дерриг — хьайн лаамца.' : 'Имя и фамилия обязательны. Остальное — по желанию.'}
            </p>
            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1 no-scrollbar">
              {/* Аватарка */}
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{ce ? 'Сурт' : 'Аватарка'}</label>
                <div className="flex items-center gap-3">
                  <img src={avatarUrl || '/icon.png'} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <input type="file" accept="image/*" className="sr-only" onChange={onAvatarChange} />
                    {ce ? 'Харжа' : 'Выбрать'}
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Имя / ЦIе *</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={ce ? 'Имам' : 'Имя'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Фамилия / Фамили *</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={ce ? 'Хьадаев' : 'Фамилия'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Пол / Стен-боьршалла</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
                  <option value="">—</option>
                  <option value="male">{ce ? 'Къан' : 'Мужской'}</option>
                  <option value="female">{ce ? 'Зуда' : 'Женский'}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Дата рождения / Вин терахь</label>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Телефон / Телефон</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{ce ? 'Адрес / Адрес' : 'Адрес (населённый пункт)'}</label>
                <input value={settlement} onChange={(e) => setSettlement(e.target.value)} placeholder={ce ? 'Даймохк' : 'Даймохк'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">Telegram</label>
                <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">WhatsApp</label>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+7 (___) ___-__-__" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
                  <input type="checkbox" checked={whatsappUsePhone} onChange={(e) => setWhatsappUsePhone(e.target.checked)} className="h-3.5 w-3.5 rounded text-emerald-600" />
                  {ce ? 'Дерригчура телефон лелае' : 'Использовать общий номер (телефон)'}
                </label>
              </div>
              <label className="flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
                <input type="checkbox" checked={hidePhone} onChange={(e) => setHidePhone(e.target.checked)} className="h-3.5 w-3.5 rounded text-emerald-600" />
                {ce ? 'Сан номер ма гайта' : 'Не показывать мой номер'}
              </label>
              <div>
                <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{ce ? 'Хьоца лаьцна' : 'О себе'}</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder={ce ? 'Хьайн хьокъехь...' : 'Пару слов о себе…'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </div>
              {(whatsapp || telegram) && (
                <p className="smk-note smk-note-warn px-3 py-2">
                  {ce
                    ? 'Хьажа: хьайн ватсап а, телеграм а язйина дацахь, уьш телефонан номераца хир ду.'
                    : 'Если оставите поля WhatsApp и Telegram пустыми, они будут дублировать номер телефона.'}
                </p>
              )}
            </div>
            {error && (
              <p className="smk-note smk-note-danger mt-3 px-3 py-2">{error}</p>
            )}
            <div className="mt-5 flex items-center gap-2">
              <button type="button" onClick={backFromProfile} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                ←
              </button>
              <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
                <Check className="h-3.5 w-3.5" />
                {saving ? (ce ? 'Лоьху...' : 'Сохраняем…') : (ce ? 'Чуйаккха' : 'Готово')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
