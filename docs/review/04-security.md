# 04 Security Review

## Findings
- P1/M 跨單位檔案存取繞過（RLS 被 service role 取代）
  - 現況：檔案讀寫 API 使用 admin client + `checkPermission`（只驗 org），未驗 unit。任何同 org 成員可讀/刪/上傳其他 unit 的任務檔案。
  - 影響：違反「unit 隔離」需求，可能造成資料外洩。
  - 建議：改用 user client + RLS，或補上 `task.unit_id` membership 驗證。
  - Evidence: `app/projects/[id]/page.tsx`#L136, `app/api/drive/upload/route.ts`#L124, `app/api/drive/delete/route.ts`#L47, `app/api/drive/thumbnail/route.ts`#L47, `lib/permissions.ts`#L68

- P1/M 裝置白名單未生效
  - 現況：裝置檢查在 `updateSession` 中，但未掛 `middleware.ts`，`proxy.ts` 不會被 Next.js 執行。
  - 影響：device allowlist 形同無效。
  - 建議：改名為 `middleware.ts`，確保每次請求都執行。
  - Evidence: `utils/supabase/updateSession.ts`#L5, `proxy.ts`#L1

- P2/S Debug JWT 頁面暴露 JWT payload
  - 現況：`/debug/jwt` 只檢查登入，任何使用者可看到 JWT payload。
  - 影響：暴露角色/claims，攻擊者更容易推測權限。
  - 建議：限 admin、或移除 production。
  - Evidence: `app/debug/jwt/page.tsx`#L18

- P3/S device_id cookie 未設定 secure
  - 現況：註冊裝置時設 cookie，未加 `secure: true`。
  - 影響：在非 HTTPS 情境可能被截取。
  - 建議：正式環境加 `secure: true`。
  - Evidence: `app/api/device/register/route.ts`#L69

- P3/S Activity logs API 無 payload 大小限制
  - 現況：`/api/logs` 接收任意 JSON，未限制 meta 大小/欄位。
  - 影響：日誌汙染/膨脹風險。
  - 建議：限制欄位與 payload 大小，加入 rate limit。
  - Evidence: `app/api/logs/route.ts`#L11
