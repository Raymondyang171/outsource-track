'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  LanguageMode,
  defaultLanguage,
  isDualLanguage,
  getPrimaryLanguage,
  getSecondaryLanguage,
} from './mode';
import { messages } from './messages';

import { getLanguageModeFromCookie, setLanguageModeInCookie } from './storage';

import { t as translate, tDual as translateDual } from './t.tsx';

interface I18nContextType {
  languageMode: LanguageMode;
  setLanguageMode: (mode: LanguageMode) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  tDual: (key: string, values?: Record<string, string | number>) => React.ReactNode;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(getLanguageModeFromCookie());

  useEffect(() => {
    setLanguageModeState(getLanguageModeFromCookie());
  }, []);

  const setLanguageMode = (mode: LanguageMode) => {
    setLanguageModeInCookie(mode);
    setLanguageModeState(mode);
  };

  const t = useCallback((key: string, values?: Record<string, string | number>) => translate(key, languageMode, values), [languageMode]);
  const tDual = useCallback((key: string, values?: Record<string, string | number>) => translateDual(key, languageMode, values), [languageMode]);

  return (
    <I18nContext.Provider value={{ languageMode, setLanguageMode, t, tDual }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
