"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateTaskProgress } from "./actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  taskId: string;
  taskName: string;
  currentProgress: number;
};

export default function TaskEditorSheet(props: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number>(props.currentProgress ?? 0);
  const [note, setNote] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  function onSave() {
    setMsg("");

    startTransition(async () => {
      const p = Math.max(0, Math.min(100, Number(progress)));

      const res: any = await updateTaskProgress({
        task_id: props.taskId,
        progress: p,
        note,
      });

      // 失敗：一定提示
      if (!res?.ok) {
        const e = `保存失敗：${res?.error ?? "未知錯誤"}`;
        setMsg(e);
        alert(e);
        return;
      }

      // 有 warn：一定提示（而且不關閉，方便你看）
      if (res?.warn) {
        const w = `${res.warn}\n除錯資訊=${JSON.stringify(res.debug ?? {}, null, 2)}`;
        setMsg(w);
        alert(w);
        return;
      }

      // 成功：提示 + 關閉 + 刷新
      setMsg("已更新");
      alert("已更新");
      setOpen(false);

      // ✅ 這行要確保是 router（不是 outer）
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        編輯
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-[min(520px,92vw)] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="text-lg font-semibold text-slate-800">更新進度</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="關閉"
              >
                ✕
              </Button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm font-medium">{props.taskName}</div>

              <div className="space-y-2">
              <div className="text-xs text-muted-foreground">進度 (0~100)</div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
              <div className="text-xs text-muted-foreground">備註（選填）</div>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註…" />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={onSave} disabled={isPending}>
                  {isPending ? "儲存中..." : "儲存"}
                </Button>
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
                  取消
                </Button>
              </div>

              {msg ? <pre className="text-xs whitespace-pre-wrap pt-2">{msg}</pre> : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
