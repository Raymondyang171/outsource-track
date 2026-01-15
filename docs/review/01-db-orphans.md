# 01 DB Orphans / Unused / Consistency Risks

## Schema Inventory (db_schema.txt)
Tables + columns (summary):
- drive_items: id, project_task_id, org_id, unit_id, uploaded_by, drive_file_id, web_view_link, name, mime_type, modified_time, created_at, thumbnail_link, file_size_bytes, original_size_bytes (`db_schema.txt`#L260)
- cost_types: id, org_id, name, active, created_at (`db_schema.txt`#L282)
- cost_requests: id, org_id, unit_id, project_id, doc_no, request_date, requested_by, payee_type, payee_name, currency, total_amount, status, submitted_at, approved_at, approved_by, rejected_at, rejected_reason, payment_date, payment_method, note, created_at, updated_at (`db_schema.txt`#L294)
- cost_items: id, cost_request_id, org_id, unit_id, project_id, project_task_id, expense_type_id, description, qty, uom, unit_price, amount, tax_rate, tax_amount, is_tax_included, incurred_on, used_by, created_at (`db_schema.txt`#L318)
- cost_attachments: id, cost_request_id, cost_item_id, org_id, unit_id, uploaded_by, kind, file_name, mime_type, storage_provider, external_file_id, web_view_link, invoice_no, issued_on, created_at (`db_schema.txt`#L317)
- memberships: org_id, unit_id, user_id, role, created_at (`db_schema.txt`#L341)
- orgs: id, name, created_at (`db_schema.txt`#L354)
- profiles: user_id, display_name, created_at (`db_schema.txt`#L366)
- progress_logs: id, project_task_id, org_id, unit_id, user_id, progress, note, created_at (`db_schema.txt`#L379)
- assist_requests: id, org_id, unit_id, project_id, project_task_id, to_unit_id, requested_by, status, due_date, note, created_at, updated_at (`db_schema.txt`#L392)
- project_tasks: id, project_id, phase_name, seq, code, name, start_offset_days, duration_days, owner_unit_id, owner_user_id, progress, updated_at, org_id, unit_id (`db_schema.txt`#L413)
- projects: id, org_id, template_id, name, start_date, status, created_by, created_at, unit_id (`db_schema.txt`#L436)
- role_permissions: role, resource, can_read, can_create, can_update, can_delete, updated_at (`db_schema.txt`#L453)
- template_phases: id, template_id, seq, name, color (`db_schema.txt`#L468)
- template_tasks: id, phase_id, seq, code, name, default_duration_days, default_owner_unit_id (`db_schema.txt`#L481)
- templates: id, org_id, name, created_by, created_at (`db_schema.txt`#L496)
- units: id, org_id, name, created_at (`db_schema.txt`#L509)

FKs (summary):
- project_tasks.project_id → projects.id (`db_schema.txt`#L1046)
- project_tasks.owner_unit_id → units.id (`db_schema.txt`#L1038)
- project_tasks.owner_user_id → profiles.user_id (`db_schema.txt`#L1042)
- projects.template_id → templates.id (`db_schema.txt`#L1014)
- cost_requests.project_id → projects.id (`db_schema.txt`#L984)
- cost_items.project_task_id → project_tasks.id (`db_schema.txt`#L965)
- drive_items.project_task_id → project_tasks.id (`db_schema.txt`#L944)
- memberships.user_id → profiles.user_id (`db_schema.txt`#L1046)

## Orphans / Mismatches
- P1/M Schema snapshot out-of-sync: `activity_logs`, `device_allowlist`, `task_change_logs`, `upsert_cost_request_with_items` 只在 docs/程式中出現，db_schema 未包含。建議更新 db_schema 或產出新的 schema snapshot。Evidence: `docs/db/activity-logs.sql`#L1, `docs/db/device-allowlist.sql`#L1, `docs/db/task-change-logs.sql`#L1, `docs/db/cost-requests-migration.sql`#L230, `app/api/logs/route.ts`#L1
- P2/M 模板資料模型疑似孤島：templates/template_phases/template_tasks 只有 schema + 文件描述，程式未引用。建議補上模板管理 UI/流程或移除。Evidence: `db_schema.txt`#L468, `asana 風格框架.txt`#L54
- P2/S projects.template_id / created_by 未被寫入：建立專案時未帶入，導致欄位常為 NULL。建議在 createProjectAction 寫入或刪除欄位。Evidence: `db_schema.txt`#L436, `app/admin/projects/page.tsx`#L38
- P2/M UI 期待 task 階層但 DB 無對應欄位：ProjectWorkspace 使用 parent_id/level，但 schema 未有。建議補欄位或移除 UI。Evidence: `app/projects/[id]/ProjectWorkspace.tsx`#L215, `db_schema.txt`#L413
- P2/S project_tasks.updated_at 僅預設 now()，更新流程未寫入，排序依據可能失真。建議 DB trigger 或 update 時同步。Evidence: `db_schema.txt`#L413, `app/projects/[id]/actions.ts`#L220
- P2/S cost_requests.payment_method 未被 UI/邏輯寫入。建議補欄位流程或移除。Evidence: `db_schema.txt`#L294, `app/projects/[id]/costs/CostRequestsClient.tsx`#L343
- P3/S drive_items.file_size_bytes/original_size_bytes 寫入但未讀取；若未做報表可考慮延後或移除，或加上用例（儲存空間分析）。Evidence: `app/api/drive/upload/route.ts`#L192
