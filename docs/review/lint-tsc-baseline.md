# Lint/TS Baseline

## Lint 目前既有錯誤摘要
- `app/admin/cost-types/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/logs/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/orgs/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/projects/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/roles/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/tasks/page.tsx`：`no-explicit-any`、`no-unused-vars`、`@next/next/no-img-element`
- `app/admin/units/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/users/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/api/logs/route.ts`：`no-explicit-any`
- `app/dashboard/page.tsx`：`no-explicit-any`
- `app/device/register/DeviceRegisterClient.tsx`：`no-explicit-any`、`react-hooks/set-state-in-effect`、`react-hooks/exhaustive-deps`
- `app/page.tsx`：`@next/next/no-html-link-for-pages`
- `app/projects/[id]/ProjectWorkspace.tsx`：`no-explicit-any`、`react-hooks/purity`、`react-hooks/exhaustive-deps`、`@next/next/no-img-element`
- `app/projects/[id]/TaskEditorSheet.tsx`：`no-explicit-any`
- `app/projects/[id]/actions.ts`：`no-explicit-any`
- `app/projects/[id]/costs/CostRequestFormModal.tsx`：`react-hooks/set-state-in-effect`
- `app/projects/[id]/costs/CostRequestsClient.tsx`：`react-hooks/set-state-in-effect`、`no-explicit-any`
- `app/settings/page.tsx`：`no-explicit-any`
- `components/app-shell.tsx`：`no-explicit-any`、`no-unused-vars`、`@next/next/no-html-link-for-pages`
- `components/sidebar-toggle.tsx`：`react-hooks/set-state-in-effect`
- `components/theme-switcher.tsx`：`react-hooks/set-state-in-effect`
- `lib/org.ts`：`no-explicit-any`
- `lib/system-log.ts`：`no-explicit-any`
- `utils/supabase/updateSession.ts`：`prefer-const`、`no-explicit-any`

## TSC 目前既有錯誤摘要
- `app/admin/tasks/page.tsx`：`tasks` 可能為 `null`（TS18047）
- `app/admin/users/page.tsx`：參數隱式 `any`（TS7006）
- `app/dashboard/page.tsx`：`TaskRow` 缺 `seq`（TS2339）
- `app/projects/[id]/ProjectWorkspace.tsx`：大量 `nullability`（TS18047）、缺 `setSubtaskOffset`（TS2304）、Pointer event 型別不符（TS2345）、`string | null` 不相容（TS2345）
- `app/projects/[id]/costs/CostRequestDetailDrawer.tsx`：`request` 可能為 `null`（TS18047/TS2345）
- `app/settings/page.tsx`：`AssistRow` 型別轉換不相容（TS2352）
- `src/app/me/page.tsx`、`src/lib/supabase/server.ts`：`createServerSupabase` 回傳型別不一致（TS2339）

## 建議清債切分（2~3 個 PR）
1) Admin/Settings 型別與 lint（低風險，重複 `no-explicit-any` + `no-unused-vars`）：`app/admin/*`、`app/settings/page.tsx`、`lib/org.ts`、`lib/system-log.ts`
2) Projects Workspace + Costs（中風險，較多流程與互動）：`app/projects/[id]/ProjectWorkspace.tsx`、`app/projects/[id]/costs/*`、`app/projects/[id]/actions.ts`
3) 基礎架構與 UI/體驗（中風險，可能牽動 auth/route）：`src/lib/supabase/server.ts`、`src/app/me/page.tsx`、`components/*`、`app/page.tsx`、`app/device/register/DeviceRegisterClient.tsx`
