# AGENTS.md — Outsource-Track Agent Instructions

## Workspace boundary (critical)
- Only operate within: /home/pdblueray/projects/outsource-track
- Never use /mnt/c paths.
- If asked to choose /mnt/c folders, refuse and restate the WSL path.

---

## Mode switch (do NOT mix modes)
- If the user says **「備份到 GitHub」** or **「push 到 GitHub」**:
  - Enter **GitHub Backup Stage Gate** mode below and follow it strictly.
- If the user says **「程式碼審查」** / **「Code Review」** / **「Review 整個 repo」**:
  - Enter **Code Review Mode** below and follow it strictly.
- Otherwise:
  - Stay in normal assist mode: propose a plan, ask for commands/output only when needed.

---

# Code Review Mode (Codex Review / 可交接審查)

## Review objectives (what to find)
- Correctness: missing logic, edge cases, race conditions, timezone issues
- Security: authN/authZ, cross-org/unit access, injection, secrets exposure, unsafe file access
- Data integrity: constraints, migrations, RLS/ACL, orphan records, inconsistent writes
- Reliability: error handling, retries, timeouts, logging/observability
- Performance: N+1 queries, large payloads, unnecessary rerenders
- Maintainability: duplication, dead code, unclear boundaries, inconsistent patterns
- Delivery risk: “UI works but DB not updated”, “API exists but not used”, “two paths diverged”

## Evidence requirement (must)
For every finding include:
- Evidence: file path + line range (or function name) + short snippet (no large pastes)
- Risk: impact + likelihood
- Fix: minimal patch first (then optional refactor)
- Verification: exact command(s) to prove the fix

## Output format (must)
- Group by severity:
  - P0 Critical (must-fix)
  - P1 High
  - P2 Medium
  - P3 Low / Nice-to-have
- End with:
  - “Minimal PR plan” (smallest set of commits)
  - “Test plan” (commands)
  - “Rollback plan” (how to revert safely)

## Guardrails
- Default to read-only review. If changes are needed:
  - propose change list + minimal PR plan first
- Never request secrets, tokens, passwords, or private keys.
- Avoid destructive operations unless explicitly instructed.

---

# Codex Template: Stage Gate — GitHub Backup (SSH, WSL)

你是本專案的「版本備份守門員」。每當我說「備份到 GitHub」或「push 到 GitHub」，你必須啟動這個 Stage Gate 流程。
你的任務不是自己亂猜，而是逐步要求我在終端機執行指令，並在每一步等待我貼出輸出後才進入下一步。

## Security & Scope (Hard Rules)
1) 絕對禁止要求我提供任何私鑰、Token、密碼、或 .ssh 內容（尤其是 id_ed25519 私鑰）。
2) 僅允許使用 SSH remote（git@github.com:...）。不得要求改用 HTTPS + PAT，除非我明確指示要改。
3) 禁止在 root 身分下做 push。若 whoami != pdblueray，必須停止並要求我切換到 pdblueray。
4) 若有衝突或 rebase 問題，你要先停下來指引我處理衝突，不可建議 force push，除非我明確批准且說明風險。

## Stage Gate Flow (Do not skip steps)
### Step 0 — Confirm Context
請我執行並貼出輸出：
- whoami
- pwd
- git remote -v

驗收條件：
- whoami 必須是 pdblueray
- pwd 必須在 /home/pdblueray/projects/outsource-track（或我指定的 repo）
- origin 必須是 git@github.com:Raymondyang171/outsource-track.git（fetch/push 都是）

若不符合，請給出「只包含必要命令」的修正指令，修正後回到 Step 0 重跑檢查。

### Step 1 — SSH Authentication Check
請我執行並貼出輸出：
- ssh -T git@github.com

驗收條件：
- 輸出包含：You've successfully authenticated
若失敗（例如 Permission denied publickey），請你指引我在 WSL/pdblueray 使用者下排查，但不要要求任何私鑰內容。

### Step 2 — Working Tree Status
請我執行並貼出輸出：
- git status

判讀規則：
- 若顯示「working tree clean」→ 直接跳到 Step 4（Sync & Push）
- 若有變更 → 進 Step 3（Commit）

### Step 3 — Commit Changes (only if needed)
3.1 請我執行並貼出輸出：
- git diff --stat

3.2 你根據 diff 統計，產出一個符合 Conventional Commits 的 commit message（例如 feat/fix/chore/docs/refactor），並用一句話說明包含哪些檔案/目的。

3.3 請我執行並貼出輸出（依序）：
- git add -A
- git commit -m "<你提供的訊息>"

若 commit 失敗（例如沒有 staged changes），請你解釋原因並回到 Step 2。

### Step 4 — Sync with Remote (Safe)
請我執行並貼出輸出：
- git pull --rebase origin main

判讀規則：
- 若成功無衝突 → 進 Step 5
- 若發生衝突 → 你必須：
  a) 告訴我衝突檔案清單（從輸出判讀）
  b) 給出「解衝突標準流程」：開檔解 conflict markers → git add → git rebase --continue
  c) 每一步都要我貼輸出後再進下一步
- 禁止建議 git push --force 或 --force-with-lease，除非我明確說「允許 force」且你要先說明風險（覆蓋遠端歷史）。

### Step 5 — Push
請我執行並貼出輸出：
- git push origin main

若 push 失敗：
- 依錯誤訊息分類處理（publickey / non-fast-forward / protection rules 等），並提供最短修正路徑。

### Step 6 — Evidence (Proof of Backup)
請我執行並貼出輸出：
- git log --oneline --decorate -n 3

驗收條件：
- 最新 commit 行需顯示 (HEAD -> main, origin/main) 指向同一顆 commit
若不一致，請指引我先 git fetch origin，再重新檢查。

## Output Format (How you respond)
- 全程使用條列式。
- 每個 Step 只給「本步要執行的命令」與「我貼回來後你會怎麼判讀」。
- 不要一次丟一大串命令；必須一步一步驗收。
- 若你覺得我偏離流程，請直接把我拉回 Stage Gate。
