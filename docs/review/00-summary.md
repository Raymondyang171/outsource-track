# 00 Summary

## TL;DR
- P1: 跨單位檔案存取可能外洩，因為非平台管理者仍可走 service role + org-only 權限，繞過 unit 隔離。(`app/projects/[id]/page.tsx`#L80, `app/api/drive/upload/route.ts`#L124, `app/api/drive/delete/route.ts`#L47, `lib/permissions.ts`#L68)
- P1: 裝置白名單雖實作，但未掛上 middleware，等同沒有生效。(`utils/supabase/updateSession.ts`#L5, `proxy.ts`#L1)
- P1: `db_schema.txt` 與實際 migration 不一致（activity_logs/device_allowlist/task_change_logs/RPC），容易造成錯誤與審計缺口。(`docs/db/activity-logs.sql`#L1, `docs/db/device-allowlist.sql`#L1, `docs/db/task-change-logs.sql`#L1, `docs/db/cost-requests-migration.sql`#L230)
- P2: 多個 UI 行為未落 DB 或只在本地 state，易造成「假成功/假資料」。(`app/projects/[id]/ProjectWorkspace.tsx`#L640)
- P2: 模板系統與部分欄位（projects.template_id/created_by 等）未被程式使用。(`db_schema.txt`#L436, `app/admin/projects/page.tsx`#L38)

## 權限矩陣
- super_admin（軟體公司帳號）：以 `memberships` 為唯一依據，必須在 `org_id = PLATFORM_SUPER_ADMIN_ORG_ID` 且 `role = admin` 才成立；可跨 org/unit 讀寫，但仍需任務存在與 drive item org/unit 一致性驗證。

## Risk Map
- P0: 未發現。
- P1: 3 項（跨單位檔案存取、裝置白名單未生效、db_schema 不一致）。
- P2: 8 項（UI 假動作、模板未落地、updated_at 不更新、payment_method 未寫入、重複 app/src 等）。
- P3: 4 項（debug page 暴露、cookie secure flag、索引缺口、UI/型別 lint 問題）。

## Execution Checks
- Lint: `pnpm run lint` 失敗（63 errors / 25 warnings）。主因是 `no-explicit-any`、`react-hooks/set-state-in-effect`、Next `Link` 規則。詳情見輸出摘要。 
- Typecheck: `pnpm exec tsc --noEmit` 失敗（nullability、缺欄位 `seq`、未定義 `setSubtaskOffset`、`createServerSupabase` 型別不一致）。
- Test: `package.json` 無 `test` script。
- Dependency audit: `pnpm audit` 無已知漏洞。

## Top 10 Priority Fixes (P0/P1 → P2)
1. P1/S 強化 unit 隔離：drive_items 讀寫改用 RLS 或顯式驗證 task.unit_id。(`app/projects/[id]/page.tsx`#L136, `app/api/drive/upload/route.ts`#L124)
2. P1/M 補上 middleware：將 `proxy.ts` 改成 `middleware.ts`（或在 Next config 掛上），確保 device allowlist 生效。(`proxy.ts`#L1, `utils/supabase/updateSession.ts`#L47)
3. P1/M 同步 schema snapshot：補入 activity_logs/device_allowlist/task_change_logs/RPC 等變更。(`docs/db/activity-logs.sql`#L1, `docs/db/task-change-logs.sql`#L1)
4. P1/M UI 假動作：子任務/旗標/狀態/活動紀錄需落 DB 或移除 UI。(`app/projects/[id]/ProjectWorkspace.tsx`#L671)
5. P2/S projects.created_by/template_id 要寫入或移除欄位。(`db_schema.txt`#L436, `app/admin/projects/page.tsx`#L38)
6. P2/S project_tasks.updated_at 改為觸發器或更新語句中帶入。(`db_schema.txt`#L413, `app/projects/[id]/actions.ts`#L220)
7. P2/S payment_method 欄位未寫入：補 UI 或移除。(`db_schema.txt`#L147, `app/projects/[id]/costs/CostRequestsClient.tsx`#L343)
8. P2/M 補索引：drive_items.project_task_id / progress_logs.project_task_id。(`db_schema.txt`#L715)
9. P2/M 清理重複路徑：`/app` vs `/src/app`、`/lib` vs `/src/lib`。(`app/me/page.tsx`#L1, `src/app/me/page.tsx`#L1)
10. P3/S Debug JWT 頁面改為 admin-only 或移除。(`app/debug/jwt/page.tsx`#L18)

## 最優解修復順序
P0/P1（安全與資料正確性） → UI 假動作與資料一致性 → 效能/瘦身/重構。
