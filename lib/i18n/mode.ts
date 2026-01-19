export enum LanguageMode {
  'zh-Hant' = 'zh-Hant',
  'vi' = 'vi',
  'zh-Hans' = 'zh-Hans',
  'en' = 'en',
}

export const LanguageOptions = [
  { value: LanguageMode['zh-Hant'], label: '繁體中文' },
  { value: LanguageMode.vi, label: 'Tiếng Việt' },
  { value: LanguageMode['zh-Hans'], label: '简体中文' },
  { value: LanguageMode.en, label: 'English' },
];

export const defaultLanguage = LanguageMode['zh-Hant'];

export const isDualLanguage = (mode: LanguageMode) => mode.includes('+');

export const getPrimaryLanguage = (mode: LanguageMode) => {
  if (isDualLanguage(mode)) {
    return mode.split('+')[0] as LanguageMode;
  }
  return mode;
};

export const getSecondaryLanguage = (mode: LanguageMode) => {
  if (isDualLanguage(mode)) {
    return mode.split('+')[1] as LanguageMode;
  }
  return null;
};
