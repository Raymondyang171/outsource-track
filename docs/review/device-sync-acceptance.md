# Device Sync Acceptance

## Client Outbox (P1)
- Offline: create upload while offline, confirm it is queued in IndexedDB and UI shows queued state.
- Retry: reconnect network, confirm queued uploads are retried automatically without manual action.
- Idempotency: retries use the same idempotency key and do not create duplicate server records.
- Device binding: uploaded payload includes device_id from local storage, not a random per-upload value.
- Cleanup: successful uploads are removed from the outbox.
