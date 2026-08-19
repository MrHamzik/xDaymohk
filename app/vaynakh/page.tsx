'use client';

/**
 * /vaynakh — «Нохчалла»: язык, обычаи, адаты и история.
 *
 * Раньше здесь стояла заглушка «в разработке». Раздел устроен так же,
 * как «Сира» и «Руководство»: главы пишутся из админки и хранятся в
 * таблице articles (раздел 'nohchalla').
 */

import { Landmark } from 'lucide-react';
import ReadingPage from '@/components/reading/ReadingPage';

export default function VaynakhPage() {
  return (
    <ReadingPage
      section="nohchalla"
      icon={Landmark}
      title="Нохчалла"
      titleCe="Нохчалла"
      subtitle="Язык, обычаи, адаты и история"
      subtitleCe="Мотт, гlиллакхаш, адаташ, истори"
      emptyHint="Главы готовятся к публикации."
      emptyHintCe="Дийцарш зорбане кечдеш ду."
    />
  );
}
