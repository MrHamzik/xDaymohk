'use client';

/**
 * /sira — «Сира Пророка ﷺ»: жизнеописание по главам.
 *
 * Содержимое не в коде, а в таблице articles (обновление 30): главы
 * публикуются из админки, без правки файлов и деплоя.
 */

import { BookMarked } from 'lucide-react';
import ReadingPage from '@/components/reading/ReadingPage';

export default function SiraPage() {
  return (
    <ReadingPage
      section="sira"
      icon={BookMarked}
      title="Сира Пророка ﷺ"
      titleCe="Пайхамаран Сира ﷺ"
      subtitle="Жизнеописание по главам"
      subtitleCe="Дахаран дийцар, дакъошца"
      emptyHint="Главы готовятся к публикации."
      emptyHintCe="Дийцарш зорбане кечдеш ду."
    />
  );
}
