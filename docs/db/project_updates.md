# project_updates

用途：儲存專案更新紀錄（文字內容），供專案成員讀取與追蹤。

主要欄位：
- project_id：對應專案（刪除專案時連動刪除更新）
- org_id：所屬組織
- content：更新內容
- created_by：建立者（可為空；若有值需為當前登入者）
- created_at：建立時間

RLS：
- SELECT：需具備 project.view（has_project_perm(project_id, 'project.view')）。
- INSERT：需具備 project.update，且 created_by 為 auth.uid() 或為 NULL。
- UPDATE/DELETE：未開放（預設拒絕）。
