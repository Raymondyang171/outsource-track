# 03 UI Actions Without Persistence

## Findings
- P1/M 子任務新增（Project Workspace）
  - 路徑：專案工作台 → 任務詳情 → 子任務新增
  - 期望：寫入 DB（project_tasks with parent relation）
  - 實際：僅新增本地 state（`local-*` id），重整即消失
  - 建議：新增 `project_tasks.parent_id` 欄位 + insert API，或移除 UI
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L671, `db_schema.txt`#L413

- P2/M 旗標（右鍵任務條）
  - 路徑：時間軸任務條右鍵 → 新增旗標
  - 期望：旗標存檔、可跨 session 查看
  - 實際：只存在 `flagsByTask` state，無 DB
  - 建議：新增 task_flags 表或整合到 task_change_logs
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L738

- P2/M 任務狀態下拉（ready/in_progress/completed/error）
  - 路徑：任務詳情 → 任務狀態下拉
  - 期望：狀態寫入 DB / 供其他人一致查看
  - 實際：只更新 local state；DB 無 status 欄位
  - 建議：加 `project_tasks.status` 欄位或移除 UI
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L802, `db_schema.txt`#L413

- P2/S 活動紀錄區塊只顯示本地 log
  - 路徑：任務詳情 → 活動紀錄
  - 期望：讀取 progress_logs / task_change_logs
  - 實際：僅使用 `logsByTask` state；未從 DB 讀取
  - 建議：載入 progress_logs 並顯示、補分頁
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L229

- P2/S 新增任務失敗的「假成功」
  - 路徑：時間軸 → 新增任務 → API 失敗
  - 期望：顯示錯誤、不新增
  - 實際：仍新增 local task 並顯示「已新增」
  - 建議：失敗時不插入 local task；保留錯誤提示
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L640

- P3/S 匯出報表按鈕無實作
  - 路徑：專案工作台 → 匯出報表
  - 期望：產生檔案/下載
  - 實際：只送一筆 activity log
  - 建議：串接後端匯出或移除
  - Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L196
