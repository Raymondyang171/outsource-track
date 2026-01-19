import React from 'react';
import { messages } from './messages';
import { LanguageMode, getPrimaryLanguage, getSecondaryLanguage, isDualLanguage } from './mode';

export function t(key: string, lang: LanguageMode, values?: Record<string, string | number>): string {
  const primaryLang = getPrimaryLanguage(lang);
  let translation = messages[key]?.[primaryLang] ?? key;

  if (values) {
    Object.entries(values).forEach(([valueKey, value]) => {
      translation = translation.replace(`{${valueKey}}`, String(value));
    });
  }

  return translation;
}

export function tDual(key: string, lang: LanguageMode, values?: Record<string, string | number>): React.ReactNode {
  if (!isDualLanguage(lang)) {
    return t(key, lang, values);
  }
  const primaryLang = getPrimaryLanguage(lang);
  const secondaryLang = getSecondaryLanguage(lang);

  let primaryText = messages[key]?.[primaryLang] ?? key;
  let secondaryText = secondaryLang ? (messages[key]?.[secondaryLang] ?? primaryText) : null;

  if (values) {
    Object.entries(values).forEach(([valueKey, value]) => {
      primaryText = primaryText.replace(`{${valueKey}}`, String(value));
      if (secondaryText) {
        secondaryText = secondaryText.replace(`{${valueKey}}`, String(value));
      }
    });
  }
  
  if (secondaryText && primaryText !== secondaryText) {
    return (
      <>
        {primaryText}
        <br />
        {secondaryText}
      </>
    );
  }
  return primaryText;
}