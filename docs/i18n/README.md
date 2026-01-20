# Internationalization (i18n)

This document outlines the i18n implementation for the application.

## Language Modes

The application supports the following language modes, defined in `lib/i18n/mode.ts`:

- `zh-Hant`: Traditional Chinese
- `vi`: Vietnamese
- `zh-Hans`: Simplified Chinese
- `zh-Hant+vi`: Traditional Chinese + Vietnamese (dual language)
- `zh-Hans+vi`: Simplified Chinese + Vietnamese (dual language)
- `en`: English
- `en+vi`: English + Vietnamese (dual language)

## Storage

The user's selected language is persisted in `localStorage` via functions in `lib/i18n/storage.ts`.

## `LanguageModeSwitcher` Component

The `LanguageModeSwitcher` component, located in `app/components/LanguageModeSwitcher.tsx`, is implemented using the `shadcn/ui Select` component. When a new language is selected, the choice is persisted to `localStorage`, and the application automatically refreshes to apply the new language setting.

## Translation Files

Translation strings are stored in `lib/i18n/messages.ts`. The `messages` object contains a mapping of keys to their translations in each supported language.

## Usage

The i18n functionality is provided through the `I18nProvider` and `useI18n` hook.

### `I18nProvider`

The `I18nProvider` component, located in `lib/i18n/I18nProvider.tsx`, should wrap the root of the application to provide the i18n context.

### `useI18n` Hook

The `useI18n` hook provides access to the following:

- `languageMode`: The current language mode.
- `setLanguageMode`: A function to change the language mode.
- `t`: A function to get the translation for a given key in the primary language.
- `tDual`: A function that returns a React Node. If the current mode is dual-language, it displays both the primary and secondary language translations. Otherwise, it behaves like `t`.

### Adding New Translations

1.  Add a new key to the `messages` object in `lib/i18n/messages.ts`.
2.  Provide the translation for the new key in all supported languages.
3.  Use the `t` or `tDual` function to display the translation in the UI.
