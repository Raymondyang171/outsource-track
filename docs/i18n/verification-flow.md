# Note translation verification flow

This document describes how note translations are created, verified, and displayed.

## Scope

- Notes on progress logs, assist requests, and cost requests are eligible for translation.
- Translations are stored alongside org and unit metadata to enforce access boundaries.

## Data lifecycle

1. A user submits a translation for an existing note.
2. The system stores a snapshot of the source note and metadata about who translated it and when.
3. The translation is marked as pending.
4. An org admin or manager reviews the translation in the admin console.
5. The reviewer verifies or rejects the translation and supplies an optional review note.
6. Verified translations are used for rendering when the UI is in Vietnamese or dual-language mode.

## Verification rules

- Only org admins or managers (or platform admins) can verify or reject.
- Translations retain translated_by, translated_at, verified_by, and verified_at for auditability.
- Only verified translations are shown to end users when Vietnamese is active.

## Access boundaries

- Notes and translations are scoped by org and unit.
- Cross-org access is blocked by RLS.
- Cross-unit access is blocked for non-admin roles, while org admins can review across units.

## Admin review checklist

- Confirm the source note matches the intended record.
- Confirm the translation matches the original meaning.
- Add a short review note if the translation requires revision or clarification.

## Failure handling

- Rejected translations remain visible in the admin list for audit purposes.
- Translators can submit a new pending translation after rejection.
