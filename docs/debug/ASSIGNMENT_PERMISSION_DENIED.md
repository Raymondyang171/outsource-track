# 任務指派 permission_denied 修復記錄

## 根因
指派任務時，後端使用 service_role client 更新 `project_tasks`。
Supabase gateway log 顯示 `role=service_role` 且 `jwt.subject=null`。
DB trigger `project_tasks_before_update_guard()` 會用 `has_project_perm()` 檢查 `auth.uid()`，
因此 subject 為 null 時必定失敗，回 `P0001 / permission_denied`。

## 修法
指派更新改為使用「使用者 session client」（authenticated JWT），
避免 service_role。

## 驗收
1) 以使用者登入 UI，指派任務一次。
2) Supabase gateway log 應顯示 `role=authenticated` 且 `subject` 非 null。
3) 對 `project_tasks` 的 PATCH 回應為 200/204，且任務負責人/指派清單成功更新。
