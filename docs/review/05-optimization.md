# 05 Optimization / Refactor / Performance

## Key Opportunities
- P2/S 補索引：`drive_items.project_task_id`、`progress_logs.project_task_id`，加速專案頁與儀表板查詢。(`db_schema.txt`#L715)
- P2/M 儀表板查詢量大：一次載入所有 tasks/logs/drive_items，專案量成長後會卡。建議分頁/分段查詢或彙總 view。(`app/dashboard/page.tsx`#L170)
- P2/M 清理重複路徑：`/app` vs `/src/app`、`/lib` vs `/src/lib`，降低維護成本與型別錯誤。(`app/me/page.tsx`#L1, `src/app/me/page.tsx`#L1)
- P3/S 使用 `next/image` 取代 `<img>` 提升 LCP；lint 已提示。(`app/projects/[id]/ProjectWorkspace.tsx`#L1257)
- P3/S 移除不必要的 `useEffect -> setState`，可減少 rerender 與 React lint 錯誤。(`app/projects/[id]/costs/CostRequestsClient.tsx`#L82)

## Optimization Backlog (收益 / 風險 / 工時 / 是否現在做)
- Add index: drive_items(project_task_id), progress_logs(project_task_id). 收益: 高 / 風險: 低 / 工時: S / 建議: 是
- Dashboard query pagination + summary API. 收益: 高 / 風險: 中 / 工時: M / 建議: 是
- Consolidate `src/` and root code paths, remove duplicates. 收益: 中 / 風險: 中 / 工時: M / 建議: 是
- Replace `<img>` with `next/image` for thumbnails. 收益: 中 / 風險: 低 / 工時: S / 建議: 是
- Normalize state flows to remove `setState in useEffect` anti-pattern. 收益: 中 / 風險: 低 / 工時: S / 建議: 是
- Introduce server-side aggregation (materialized views) for dashboard KPIs. 收益: 高 / 風險: 中 / 工時: L / 建議: 否（第二階段）
