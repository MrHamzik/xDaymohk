import {
  Baby, Briefcase, Camera, Car, Dumbbell, GraduationCap, Hammer, Home,
  Laptop, Leaf, Music, Paintbrush, Scale, Scissors, ShoppingBag, Sprout,
  Stethoscope, Truck, Utensils, Wrench,
} from 'lucide-react';

/**
 * Иконки фильтров: общий справочник для админ-панели и лент.
 *
 * Раньше список жил внутри AdminFiltersSection, поэтому иконку можно
 * было ВЫБРАТЬ в админке, но нигде не увидеть: фильтр заданий рисовал
 * только подпись. Теперь источник один и читают его оба места.
 *
 * Список закрытый намеренно: имя приходит из БД (app_filters.icon) и
 * попадает в разметку. Произвольное значение здесь означало бы, что
 * содержимое базы решает, какой компонент отрисовать.
 */
export const FILTER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Stethoscope, Hammer, GraduationCap, Wrench, Scissors,
  ShoppingBag, Sprout, Car, Home, Utensils, Truck, Baby, Scale,
  Paintbrush, Laptop, Camera, Music, Dumbbell, Leaf,
};

export const FILTER_ICON_NAMES = Object.keys(FILTER_ICONS);

/**
 * Иконка по умолчанию для сферы, у которой админ ничего не выбрал.
 *
 * Ключ — значение фильтра (app_filters.value), то есть код категории.
 * Без этой таблицы все сферы выглядели одинаковыми «портфелями», и
 * иконка не помогала различать их в списке.
 */
const DEFAULT_BY_VALUE: Record<string, string> = {
  // Бытовые работы и ремонт
  repair: 'Hammer',
  construction: 'Hammer',
  plumbing: 'Wrench',
  electric: 'Wrench',
  cleaning: 'Home',
  household: 'Home',
  // Транспорт и доставка
  delivery: 'Truck',
  transport: 'Car',
  taxi: 'Car',
  moving: 'Truck',
  // Люди и услуги
  medicine: 'Stethoscope',
  health: 'Stethoscope',
  education: 'GraduationCap',
  tutor: 'GraduationCap',
  childcare: 'Baby',
  beauty: 'Scissors',
  legal: 'Scale',
  // Торговля, еда, земля
  shopping: 'ShoppingBag',
  purchase: 'ShoppingBag',
  food: 'Utensils',
  cooking: 'Utensils',
  garden: 'Sprout',
  agriculture: 'Sprout',
  nature: 'Leaf',
  // Творчество и техника
  it: 'Laptop',
  computer: 'Laptop',
  photo: 'Camera',
  music: 'Music',
  design: 'Paintbrush',
  sport: 'Dumbbell',
};

/**
 * Компонент иконки фильтра.
 *
 * Порядок: выбранная админом → подобранная по коду категории →
 * «портфель» как нейтральный запасной вариант.
 */
export function filterIcon(
  iconName?: string | null,
  value?: string,
): React.ComponentType<{ className?: string }> {
  if (iconName && FILTER_ICONS[iconName]) return FILTER_ICONS[iconName];
  const guessed = value ? DEFAULT_BY_VALUE[value.toLowerCase()] : undefined;
  if (guessed && FILTER_ICONS[guessed]) return FILTER_ICONS[guessed];
  return Briefcase;
}
