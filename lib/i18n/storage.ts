'use client';

import { LanguageMode, defaultLanguage } from './mode';

const COOKIE_KEY = 'languageMode';

export function getLanguageModeFromCookie(): LanguageMode {
  if (typeof document === 'undefined') {
    return defaultLanguage;
  }
  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_KEY}=`))
    ?.split('=')[1];
  
  if (cookieValue) {
    if (cookieValue.includes("+")) {
      const primary = cookieValue.split("+")[0] ?? "";
      if (Object.values(LanguageMode).includes(primary as LanguageMode)) {
        return primary as LanguageMode;
      }
    }
    if (Object.values(LanguageMode).includes(cookieValue as LanguageMode)) {
      return cookieValue as LanguageMode;
    }
  }
  return defaultLanguage;
}

export function setLanguageModeInCookie(mode: LanguageMode) {
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
  }
}
