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
