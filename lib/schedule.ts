import { Profile, UserMasterStatus, ProfileStatusType } from './types';

export interface WorkingStatusInfo {
  status: ProfileStatusType;
  color: 'emerald' | 'amber' | 'zinc' | 'sky';
  colorHex: string;
  label: string;
  badgeLabel: string;
  details?: string;
  isSpecialist: boolean;
}

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_INDEX_TO_NAME: Record<number, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

export function calculateWorkingStatus(
  profile: Profile,
  userMasterStatus?: UserMasterStatus,
): WorkingStatusInfo {
  // Non-specialists are ordinary residents
  if (!profile.isSpecialist) {
    return {
      status: 'active',
      color: 'emerald',
      colorHex: '#059669',
      label: profile.settlement ? `Житель ${profile.settlement}` : 'Житель Самашки',
      badgeLabel: profile.settlement ? `Житель ${profile.settlement}` : 'Житель Самашки',
      isSpecialist: false,
    };
  }

  // 1. Flexible schedule is always blue (sky) and exempt from strict open/break/closed overrides
  if (profile.isFlexibleSchedule) {
    return {
      status: 'flexible',
      color: 'sky',
      colorHex: '#0284c7',
      label: 'Произвольный график',
      badgeLabel: 'Произвольный',
      details: undefined,
      isSpecialist: true,
    };
  }

  // 2. Manual master override takes priority for scheduled specialists
  if (userMasterStatus === 'break') {
    return {
      status: 'break',
      color: 'amber',
      colorHex: '#d97706',
      label: 'На перерыве',
      badgeLabel: 'Перерыв',
      details: 'Временно отошёл по делам',
      isSpecialist: true,
    };
  }
  if (userMasterStatus === 'offline') {
    return {
      status: 'offline',
      color: 'zinc',
      colorHex: '#6b7280',
      label: 'Не работает',
      badgeLabel: 'Не работает',
      details: 'Выходной / не работает',
      isSpecialist: true,
    };
  }
  if (userMasterStatus === 'active') {
    return {
      status: 'active',
      color: 'emerald',
      colorHex: '#059669',
      label: 'Работает сейчас',
      badgeLabel: 'Работает',
      details: 'Принимает звонки и заказы',
      isSpecialist: true,
    };
  }

  // 3. Automatic calculation based on profile's working hours & days in Samashki time (Europe/Moscow, UTC+3)
  const now = new Date();
  const moscowTimeString = now.toLocaleTimeString('en-US', {
    timeZone: 'Europe/Moscow',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hourStr, minuteStr] = moscowTimeString.split(':');
  const currentMinutes = (parseInt(hourStr, 10) || 0) * 60 + (parseInt(minuteStr, 10) || 0);

  const moscowDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const todayName = DAY_INDEX_TO_NAME[moscowDate.getDay()] || 'Пн';

  // Check working days
  if (profile.workDays && profile.workDays.length > 0 && !profile.workDays.includes(todayName)) {
    return {
      status: 'offline',
      color: 'zinc',
      colorHex: '#6b7280',
      label: 'Выходной сегодня',
      badgeLabel: 'Выходной',
      details: undefined,
      isSpecialist: true,
    };
  }

  // Check working hours
  if (profile.workHoursStart && profile.workHoursEnd) {
    const [sH, sM] = profile.workHoursStart.split(':').map((v) => parseInt(v, 10) || 0);
    const [eH, eM] = profile.workHoursEnd.split(':').map((v) => parseInt(v, 10) || 0);
    const startMinutes = sH * 60 + sM;
    const endMinutes = eH * 60 + eM;

    // Check break time
    if (profile.breakStart && profile.breakEnd) {
      const [bsH, bsM] = profile.breakStart.split(':').map((v) => parseInt(v, 10) || 0);
      const [beH, beM] = profile.breakEnd.split(':').map((v) => parseInt(v, 10) || 0);
      const bStartMinutes = bsH * 60 + bsM;
      const bEndMinutes = beH * 60 + beM;

      if (currentMinutes >= bStartMinutes && currentMinutes < bEndMinutes) {
        return {
          status: 'break',
          color: 'amber',
          colorHex: '#d97706',
          label: 'Обед / перерыв',
          badgeLabel: 'Перерыв',
          details: `Перерыв до ${profile.breakEnd}`,
          isSpecialist: true,
        };
      }
    }

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return {
        status: 'active',
        color: 'emerald',
        colorHex: '#059669',
        label: 'Работает сейчас',
        badgeLabel: 'Работает',
        details: `до ${profile.workHoursEnd}`,
        isSpecialist: true,
      };
    } else {
      return {
        status: 'offline',
        color: 'zinc',
        colorHex: '#6b7280',
        label: 'Сейчас закрыто',
        badgeLabel: 'Не работает',
        details: `Откроется в ${profile.workHoursStart}`,
        isSpecialist: true,
      };
    }
  }

  // Default specialist status: active
  return {
    status: 'active',
    color: 'emerald',
    colorHex: '#059669',
    label: 'Работает сейчас',
    badgeLabel: 'Работает',
    details: 'На связи',
    isSpecialist: true,
  };
}
