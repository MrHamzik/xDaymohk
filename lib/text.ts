export function formatCount(value: number, one: string, few: string, many: string) {
  const absoluteValue = Math.abs(value) % 100;
  const lastDigit = absoluteValue % 10;

  if (absoluteValue >= 11 && absoluteValue <= 19) {
    return `${value} ${many}`;
  }

  if (lastDigit === 1) {
    return `${value} ${one}`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${value} ${few}`;
  }

  return `${value} ${many}`;
}

export function formatReviews(value: number) {
  return formatCount(value, 'отзыв', 'отзыва', 'отзывов');
}

/**
 * Возраст по дате рождения. Полная дата 'YYYY-MM-DD' — точный расчёт
 * (с учётом того, был ли день рождения в этом году); если известен
 * только год 'YYYY' — грубо по году. Невалидный ввод → null.
 */
export function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const match = String(birthDate).trim().match(/^(\d{4})(?:-(\d{1,2})-(\d{1,2}))?/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1900) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  if (match[2] && match[3]) {
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const birthdayPassed = now.getMonth() > month
        || (now.getMonth() === month && now.getDate() >= day);
      if (!birthdayPassed) age -= 1;
    }
  }
  return age >= 0 && age < 130 ? age : null;
}

export function formatDisplayName(fullName: string, isMobile = false) {
  const clean = (fullName || '').trim();
  if (!clean) return 'Житель';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const rest = parts.slice(1).join(' ');
    if (isMobile || clean.length > 17) {
      return `${first[0]}. ${rest}`;
    }
  }
  return clean;
}
