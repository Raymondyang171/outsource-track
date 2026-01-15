# 02 Pages / Imports / Auth / Config

## Route Inventory (App Router)
Public:
- `/` → `app/page.tsx` (public landing). (`app/page.tsx`#L1)
- `/login` → `app/login/page.tsx` (public auth). (`app/login/page.tsx`#L1)
- `/reset-password` → `app/reset-password/page.tsx` (public). (`app/reset-password/page.tsx`#L1)
- `/costs` → `app/costs/page.tsx` redirects to `/admin/costs`. (`app/costs/page.tsx`#L1)

Authenticated (org-aware):
- `/dashboard` → `app/dashboard/page.tsx` (auth + org filter). (`app/dashboard/page.tsx`#L98)
- `/projects` → `app/projects/page.tsx` (auth). (`app/projects/page.tsx`#L19)
- `/projects/[id]` → `app/projects/[id]/page.tsx` (auth + permission). (`app/projects/[id]/page.tsx`#L19)
- `/projects/[id]/costs` → `app/projects/[id]/costs/page.tsx` (auth + membership). (`app/projects/[id]/costs/page.tsx`#L41)
- `/settings` → `app/settings/page.tsx` (auth). (`app/settings/page.tsx`#L94)
- `/device/register` → `app/device/register/page.tsx` (auth). (`app/device/register/page.tsx`#L7)

Admin:
- `/admin/*` pages use service role + permissions. Example: `app/admin/projects/page.tsx`#L14, `app/admin/users/page.tsx`#L62. All依賴 `SUPABASE_SERVICE_ROLE_KEY`。

Debug:
- `/debug/jwt` → `app/debug/jwt/page.tsx` 只驗證登入、未限制 admin。(`app/debug/jwt/page.tsx`#L18)

## Import / Boundary / Config Issues
- 重複路由來源：`/me` 同時存在 `app/me/page.tsx` 與 `src/app/me/page.tsx`，可能導致路由衝突與型別錯誤。(`app/me/page.tsx`#L1, `src/app/me/page.tsx`#L1)
- Supabase server helper 重複且行為不一致：`/lib/supabase/server.ts` 為 async + cookies()，`/src/lib/supabase/server.ts` 為 sync；造成 typecheck 失敗且混用風險。(`lib/supabase/server.ts`#L1, `src/lib/supabase/server.ts`#L1)
- Device allowlist middleware 未掛入：`proxy.ts` 並非 Next.js `middleware.ts`，導致 `updateSession` 未生效。(`proxy.ts`#L1, `utils/supabase/updateSession.ts`#L5)
- Debug JWT 頁面在正式環境可能暴露 JWT payload（建議加 admin 限制或移除）。(`app/debug/jwt/page.tsx`#L33)

## Auth / Permission Gaps
- `/debug/jwt` 只有登入判斷，未檢查 admin role。
- 部分頁面為了方便授權而改用 service role (admin client)，但未補 unit 驗證（詳見 04-security）。

## Config Dependencies
- 多數 /admin 頁面在缺少 `SUPABASE_SERVICE_ROLE_KEY` 時直接回傳錯誤頁。(`app/admin/projects/page.tsx`#L142)
- Google Drive API 依賴 `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`，缺值直接失敗。(`app/api/drive/upload/route.ts`#L27)
