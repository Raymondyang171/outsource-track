#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/backups/codex_transcripts"
SRC_DIR="$HOME/.codex/sessions"
DAYS="${1:-7}"

mkdir -p "$OUT_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "[ERROR] Not found: $SRC_DIR"
  exit 1
fi

python3 - <<'PY'
import os, json, time, datetime, glob

src_dir = os.path.expanduser("~/.codex/sessions")
repo_root = os.environ.get("REPO_ROOT", "")
out_dir = os.environ.get("OUT_DIR", "")
days = int(os.environ.get("DAYS", "7"))

if not out_dir:
    # fallback: 放在目前工作目錄的 backups/codex_transcripts
    out_dir = os.path.join(os.getcwd(), "backups", "codex_transcripts")

os.makedirs(out_dir, exist_ok=True)

cutoff = time.time() - days * 86400

# 找最近 N 天有更新的 jsonl
files = []
for root, dirs, filenames in os.walk(src_dir):
    for fn in filenames:
        if fn.endswith(".jsonl"):
            path = os.path.join(root, fn)
            try:
                if os.path.getmtime(path) >= cutoff:
                    files.append(path)
            except FileNotFoundError:
                pass

files.sort()
if not files:
    print(f"[WARN] No session files modified in last {days} days under: {src_dir}")
    raise SystemExit(0)

def pick_role(o):
    for k in ("role","speaker","author"):
        v = o.get(k)
        if isinstance(v,str) and v.strip():
            return v.strip()
    m = o.get("message")
    if isinstance(m, dict):
        r = m.get("role")
        if isinstance(r,str) and r.strip():
            return r.strip()
    return "unknown"

def pick_time(o):
    for k in ("timestamp","time","created_at","createdAt"):
        v = o.get(k)
        if isinstance(v,(int,float)):
            try:
                return datetime.datetime.fromtimestamp(v).isoformat(timespec="seconds")
            except Exception:
                pass
        if isinstance(v,str) and v.strip():
            return v.strip()
    return ""

def pick_text(o):
    c = o.get("content")
    if isinstance(c,str):
        return c
    if isinstance(c,list):
        parts=[]
        for p in c:
            if isinstance(p,str):
                parts.append(p)
            elif isinstance(p,dict):
                for k in ("text","content","value"):
                    v=p.get(k)
                    if isinstance(v,str) and v.strip():
                        parts.append(v.strip())
                        break
        return "\n".join(parts).strip()
    if isinstance(c,dict):
        for k in ("text","content","value"):
            v=c.get(k)
            if isinstance(v,str) and v.strip():
                return v.strip()

    m = o.get("message")
    if isinstance(m,dict):
        mc = m.get("content")
        if isinstance(mc,str):
            return mc
        if isinstance(mc,list):
            parts=[]
            for p in mc:
                if isinstance(p,dict) and isinstance(p.get("text"),str):
                    parts.append(p["text"])
                elif isinstance(p,str):
                    parts.append(p)
            return "\n".join(parts).strip()

    return json.dumps(o, ensure_ascii=False, indent=2)

def export_one(path):
    base = os.path.basename(path).replace(".jsonl","")
    out_path = os.path.join(out_dir, f"{base}.txt")
    rel = path.replace(os.path.expanduser("~"), "~")

    with open(path,"r",encoding="utf-8",errors="replace") as f, open(out_path,"w",encoding="utf-8") as out:
        out.write(f"SOURCE: {rel}\n")
        out.write("="*80 + "\n\n")
        for line in f:
            line=line.strip()
            if not line:
                continue
            try:
                o=json.loads(line)
            except Exception:
                out.write(f"[unparsed] {line}\n\n")
                continue
            t = pick_time(o)
            role = pick_role(o)
            text = pick_text(o).strip()

            header = f"[{role}]"
            if t:
                header += f" {t}"
            out.write(header + "\n")
            out.write(text + "\n")
            out.write("-"*80 + "\n\n")
    return out_path

for p in files:
    outp = export_one(p)
    print("[OK]", outp)

PY
