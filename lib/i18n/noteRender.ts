import { getPrimaryLanguage, getSecondaryLanguage, isDualLanguage, type LanguageMode } from "@/lib/i18n/mode";

export type NoteTranslation = {
  target_lang: string;
  translated_note: string;
  status: string;
};

export type RenderedNote = {
  primary: string;
  secondary: string | null;
  hasTranslation: boolean;
};

function findVerifiedTranslation(translations: NoteTranslation[] | null | undefined, targetLang: string) {
  if (!translations || translations.length === 0) return null;
  return translations.find((row) => row.target_lang === targetLang && row.status === "verified") ?? null;
}

export function renderNoteTranslation(
  note: string | null | undefined,
  languageMode: LanguageMode,
  translations?: NoteTranslation[] | null
): RenderedNote {
  const baseNote = (note ?? "").trim();
  if (!baseNote) {
    return { primary: "", secondary: null, hasTranslation: false };
  }

  const primaryLang = getPrimaryLanguage(languageMode);
  const secondaryLang = getSecondaryLanguage(languageMode);
  const targetLang = primaryLang === "vi" || secondaryLang === "vi" ? "vi" : null;

  if (!targetLang) {
    return { primary: baseNote, secondary: null, hasTranslation: false };
  }

  const translation = findVerifiedTranslation(translations, targetLang);
  if (!translation) {
    return { primary: baseNote, secondary: null, hasTranslation: false };
  }

  if (primaryLang === "vi" && !isDualLanguage(languageMode)) {
    return { primary: translation.translated_note, secondary: null, hasTranslation: true };
  }

  if (isDualLanguage(languageMode)) {
    return { primary: baseNote, secondary: translation.translated_note, hasTranslation: true };
  }

  return { primary: baseNote, secondary: translation.translated_note, hasTranslation: true };
}
