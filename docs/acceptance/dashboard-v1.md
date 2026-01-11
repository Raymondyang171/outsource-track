# Dashboard V1 Acceptance

## RAG rules (MVP)
- 綠：無逾期任務，且 7 天內有回報。
- 黃：有逾期任務，或超過 7 天沒有回報。
- 紅：逾期任務數 >= 3，或有 Overdue Assist。

## KPI definitions
- 加權進度：`sum(task.progress * task.duration_days) / sum(task.duration_days)`
- 任務到期日：`project.start_date + task.start_offset_days + task.duration_days`
- 逾期任務：`task_due_date < today` 且 `task.progress < 100`
- 最後回報時間：`max(task.updated_at, latest(progress_logs.created_at))`
- Overdue Assist：`assist.status != resolved` 且 `assist.due_date < today`

## SQL smoke check (manual)
1. 專案加權進度驗證：
```sql
select p.id,
       sum(t.progress * t.duration_days)::float / nullif(sum(t.duration_days), 0) as weighted_progress
from public.projects p
join public.project_tasks t on t.project_id = p.id
where p.id = '<project_id>'
group by p.id;
```

2. Assist 逾期驗證：
```sql
select count(*) as overdue_assist
from public.assist_requests
where project_id = '<project_id>'
  and status <> 'resolved'
  and due_date < current_date;
```

## UI smoke check (manual)
- 進入 `/dashboard` 應看到 Portfolio 與 Project 清單。
- 選擇任一 Project 後，Tasks 表格可點擊並開啟 Task Drawer。
- Task Drawer 內可看到 Assist 區塊、Progress Logs、Drive Items。
- 新增 Assist 後應出現在專案層清單，狀態可更新。

## Schema sync reminder
- 修改 schema 後需同步更新 `db_schema.txt` 與 `supabase-schema-bynmfoilackhtavlmyre.png`。
