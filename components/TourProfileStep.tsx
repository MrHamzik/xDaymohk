'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, MapPin } from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMapLazy';
import { fetchEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { extractPhoneDigits } from '@/lib/phone';
import { AVATAR_PRESETS } from '@/lib/types';
import { humanErrorMessage } from '@/lib/errors';
import AddressAutocomplete, { type DbAddressSuggestion } from '@/components/AddressAutocomplete';

/**
 * Шаг «Ваш профиль» внутри гида.
 *
 * Порядок полей (решение владельца от 21.08, ночь): Аватарка, Имя,
 * Фамилия, Пол, Дата рождения, Адрес, Описание анкеты, затем в самом
 * конце контакты — Телефон для звонков, WhatsApp, Telegram — и три
 * галочки «не показывать в анкетах».
 *
 * Адрес — с подсказками из БД (дома и объекты, как в анкетах и на
 * карте) и кнопкой «Открыть на карте». Галочки и все контакты
 * становятся ДЕФОЛТАМИ: каждая новая анкета (личная, специалиста,
 * задание) создаётся с ними автоматически.
 *
 * Подписи полей одноязычные (t.firstName и т.д.).
 *
 * Автозаполнение из Google: поля заполняются, когда настоящий профиль
 * доедет из базы. Трогаем только ПУСТЫЕ поля.
 */
export default function TourProfileStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}) {
  const { t, language } = useI18n();
  const ce = language === 'ce';
  const { account, updateAccount } = useAuth();
  const { profiles, updateProfile } = useProfiles();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  /**
   * Адрес (ТЗ, п.1): подсказки из БД + мини-карта с домами из базы.
   * Клик по метке дома → полный адрес; клик по пустому месту →
   * «Даймохк» и примечание «адрес отсутствует в базе данных».
   */
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [addressMissing, setAddressMissing] = useState(false);
  /** Дома из БД: слой карты рисует их сам, нам нужен список для
   *  распознавания клика — по метке дома приходят ЕЁ координаты. */
  const [houses, setHouses] = useState<Awaited<ReturnType<typeof fetchEffectiveHouseAddresses>>>([]);

  // Дома для мини-карты грузятся один раз, при первом открытии.
  useEffect(() => {
    if (!showMap || houses.length > 0) return;
    let cancelled = false;
    fetchEffectiveHouseAddresses().then((list) => {
      if (!cancelled && Array.isArray(list)) setHouses(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showMap, houses.length]);

  /**
   * Клик по карте (ТЗ, п.1): клик по метке дома приносит координаты
   * самого дома — находим его в списке и подставляем полный адрес.
   * Клик мимо метки — любых координат дома нет: «Даймохк» и примечание.
   */
  const onMapSelect = (position: { lat: number; lng: number }) => {
    const exact = houses.find((house) => (
      Math.abs(Number(house.lat) - position.lat) < 1e-7
      && Math.abs(Number(house.lng) - position.lng) < 1e-7
    ));
    if (exact) {
      setAddress(exact.fullAddress);
      setAddressCoords({ lat: Number(exact.lat), lng: Number(exact.lng) });
      setAddressMissing(false);
      return;
    }
    setAddress('Даймохк');
    setAddressCoords(null);
    setAddressMissing(true);
  };

  /** Никнейм — в личную анкету (ТЗ-2, п.3): вместо ФИО, если включено. */
  const [nickname, setNickname] = useState('');
  const [showNickname, setShowNickname] = useState(false);
  /** Контакты. */
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');

  /** Дефолты видимости контактов для всех новых анкет: галочки
   *  «НЕ показывать» по умолчанию ПОСТАВЛЕНЫ (правка от 22.08, п.4). */
  const [hidePhone, setHidePhone] = useState(true);
  const [hideWhatsapp, setHideWhatsapp] = useState(true);
  const [hideTelegram, setHideTelegram] = useState(true);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  /** Дозаполнение из аккаунта, когда настоящие данные доедут. */
  useEffect(() => {
    if (!account) return;
    const full = (account.fullName || '').trim();
    const looksReal = full && full !== 'Пользователь' && !/^\+?\d+$/.test(full);
    if (looksReal) {
      const parts = full.split(/\s+/).filter(Boolean);
      setFirstName((current) => current || parts[0] || '');
      setLastName((current) => current || parts.slice(1).join(' ') || '');
    }
    const avatar = account.avatarUrl || '';
    if (avatar && !AVATAR_PRESETS.includes(avatar)) {
      setAvatarUrl((current) => current || avatar);
    }
    if (account.phone) setPhone((current) => current || account.phone);
    if (account.settlement) setAddress((current) => current || account.settlement || '');
    setHidePhone(account.hidePhone !== false);
    setHideWhatsapp(account.hideWhatsapp !== false);
    setHideTelegram(account.hideTelegram !== false);
  }, [account]);

  /** Аватар: персетные картинки за фото из Google не считаем. */
  const [avatarUrl, setAvatarUrl] = useState('');

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

  const isValidFullName = (name: string): boolean => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    return parts.every((p) => /^[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29}$/.test(p));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const full = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!isValidFullName(full)) {
      setError(ce ? 'Йоза дика язде: цIе а, фамили а кириллицей.' : 'Введите корректно: имя и фамилию кириллицей.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateAccount({
        fullName: full,
        phone: phone || undefined,
        whatsapp: extractPhoneDigits(whatsapp) ? `7${extractPhoneDigits(whatsapp)}` : '',
        telegram: telegram.trim() ? `@${telegram.trim().replace(/^@/, '')}` : '',
        settlement: address.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        hidePhone,
        hideWhatsapp,
        hideTelegram,
      });

      // Личная анкета создаётся триггером при регистрации — здесь мы её
      // ДОЗАПОЛНЯЕМ. Контакты подчиняются галочкам: скрытое в анкету
      // не идёт вовсе.
      const personalId = account ? `personal-${account.id}` : '';
      let personal = profiles.find((item) => item.id === personalId)
        ?? profiles.find((item) => item.ownerId === account?.id && item.isPersonal);

      if (!personal && supabase) {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (token) {
            const res = await fetch('/api/account/ensure-personal-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) {
              const data = await res.json().catch(() => null);
              if (data?.profile) personal = data.profile;
            }
          }
        } catch {
          // Анкету дозаполнить не удалось, но аккаунт уже сохранён —
          // регистрацию из-за этого обрывать нельзя.
        }
      }

      if (personal) {
        const whatsappDigits = extractPhoneDigits(whatsapp);

        updateProfile(personal.id, {
          fullName: full,
          avatarUrl: avatarUrl || personal.avatarUrl,
          phone: hidePhone ? undefined : (phone || personal.phone),
          hidePhone,
          hideWhatsapp,
          hideTelegram,
          whatsapp: hideWhatsapp ? undefined : (whatsappDigits ? `7${whatsappDigits}` : undefined),
          telegram: hideTelegram
            ? undefined
            : (telegram.trim() ? `@${telegram.trim().replace(/^@/, '')}` : undefined),
          settlement: address.trim() || personal.settlement,
          nickname: nickname.trim() || undefined,
          showNickname,
        });
      }

      onComplete();
    } catch (err) {
      setError(humanErrorMessage(err, ce ? 'ce' : 'ru', 'Сохранение анкеты в гиде'));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';
  const labelClass = 'mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400';

  const onAddressSelect = (suggestion: DbAddressSuggestion) => {
    setAddressCoords({ lat: suggestion.lat, lng: suggestion.lng });
  };

  const mapHref = addressCoords
    ? `geo:${addressCoords.lat},${addressCoords.lng}?q=${addressCoords.lat},${addressCoords.lng}`
    : '/map';

  return (
    <form onSubmit={submit} className="mt-4">
      {/* p-1.5: у полей с focus:ring обводка на 2px шире самого поля,
          без внутренних отступов контейнер прокрутки её обрезал по
          краям (жалоба №7 от 21.08, ночь). */}
      <div className="max-h-[42vh] space-y-3 overflow-y-auto p-1.5">
        {/* Аватарка */}
        <div>
          <label className={labelClass}>{t.tourAvatarLabel}</label>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl || '/icon.png'} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <input type="file" accept="image/*" className="sr-only" onChange={onAvatarChange} />
              {t.avatarChange}
            </label>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t.firstName} *</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t.firstNamePlaceholder} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.lastName} *</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t.lastNamePlaceholder} className={inputClass} />
        </div>

        {/* Адрес: подсказки из БД + мини-карта (ТЗ, п.1). */}
        <div>
          <label className={labelClass} htmlFor="tour-profile-address">{t.tourAddressLabel}</label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AddressAutocomplete
                id="tour-profile-address"
                value={address}
                onChange={(value) => { setAddress(value); setAddressMissing(false); }}
                onSelect={onAddressSelect}
                required={false}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowMap((shown) => !shown)}
              title={t.tourPickOnMap}
              aria-label={t.tourPickOnMap}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-emerald-700 transition hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              <MapPin className="h-4 w-4" />
            </button>
          </div>
          {addressMissing && (
            <p className="mt-1 smk-text-label font-bold text-amber-600 dark:text-amber-400">{t.tourAddressMissing}</p>
          )}
          {showMap && (
            <div className="mt-2">
              {/* Штатный слой домов БД (тот же, что в анкетах):
                  пользовательские markers рисуются только со слоем
                  анкет — поэтому раньше дома не были видны. Клик по
                  метке дома приводит onSelect с координатами дома. */}
              <InteractiveMap
                selectedPosition={addressCoords}
                onSelect={onMapSelect}
                showControls={false}
                showProfiles={false}
                showHouses
                showPlaces={false}
                objectMode="houses"
                className="h-56 sm:h-64"
              />
            </div>
          )}
        </div>

        {/* Никнейм — в личную анкету (ТЗ-2, п.3). */}
        <div>
          <label className={labelClass} htmlFor="tour-profile-nick">{t.tourNicknameLabel}</label>
          <input
            id="tour-profile-nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 16))}
            maxLength={16}
            placeholder={t.notRequiredHint}
            className={inputClass}
          />
          {/* Отступи (правка от 22.08, п.2): чекбокс — отдельная строка
              с воздухом вокруг, не прилипает к полю. */}
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 smk-text-label font-bold text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300">
            <input type="checkbox" checked={showNickname} onChange={(e) => setShowNickname(e.target.checked)} className="h-4 w-4 shrink-0 rounded accent-emerald-600" />
            {t.tourShowNickname}
          </label>
        </div>

        {/* Контакты — в самом конце (ТЗ, п.2/6). */}
        <div>
          <label className={labelClass}>{t.phoneGeneral}</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.phoneWhatsappLabel}</label>
          <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+7 (___) ___-__-__" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.phoneTelegramLabel}</label>
          <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" className={inputClass} />
        </div>

        {/* Дефолты видимости для всех новых анкет (п.3). */}
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-900/60">
          <label className="flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
            <input type="checkbox" checked={hidePhone} onChange={(e) => setHidePhone(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
            {t.tourHidePhone}
          </label>
          <label className="flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
            <input type="checkbox" checked={hideWhatsapp} onChange={(e) => setHideWhatsapp(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
            {t.tourHideWhatsapp}
          </label>
          <label className="flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
            <input type="checkbox" checked={hideTelegram} onChange={(e) => setHideTelegram(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
            {t.tourHideTelegram}
          </label>
        </div>

        {error && <p className="smk-note smk-note-danger px-3 py-2">{error}</p>}
      </div>

      {/* Подвал шага: «Назад» и «Сохранить и продолжить» в одном ряду. */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.tourBack}
          className="smk-hit flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? (ce ? 'Лоьху…' : 'Сохраняем…') : t.tourProfileButton}
        </button>
      </div>
    </form>
  );
}
