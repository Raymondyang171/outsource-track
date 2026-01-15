# 專案費用 / 請款單模組

## Migration
- SQL 檔案：`docs/db/cost-requests-migration.sql`

## 驗收 / 測試案例
1. member 建立 draft -> 提交 submitted
2. pm(manager) approve -> paid
3. member 不可看其他 unit 的費用
4. total_amount 隨 items 變動正確更新
5. attachments 可綁定到 request 或 item

## Schema 同步流程
1. 套用 migration 後，執行：
   ```bash
   ./scripts/download_supabase_schema.sh
   ```
2. 依腳本提示到 Supabase Dashboard 下載 Schema PNG 並覆蓋：
   - `supabase-schema-bynmfoilackhtavlmyre.png`
