'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LanguageMode, LanguageOptions } from '@/lib/i18n/mode';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function LanguageModeSwitcher() {
  const { languageMode, setLanguageMode, t } = useI18n();
  const router = useRouter();

  const handleValueChange = (value: string) => {
    const newMode = value as LanguageMode;
    setLanguageMode(newMode);
    router.refresh();
  };

  return (
    <Select value={languageMode} onValueChange={handleValueChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t('language.switcher.label')} />
      </SelectTrigger>
      <SelectContent>
        {LanguageOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}