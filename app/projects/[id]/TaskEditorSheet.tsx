"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateTaskProgress } from "./actions";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
        const e = `保存失敗：${res?.error ?? "unknown"}`;
        setMsg(e);
        alert(e);
        return;
      }

      // 有 warn：一定提示（而且不關閉，方便你看）
      if (res?.warn) {
        const w = `${res.warn}\nDEBUG=${JSON.stringify(res.debug ?? {}, null, 2)}`;
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
        Edit
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[360px]">
          <SheetHeader>
            <SheetTitle>更新進度</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="text-sm font-medium">{props.taskName}</div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Progress (0~100)</div>
              <Input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Note (optional)</div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註…" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={onSave} disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>

            {msg ? <pre className="text-xs whitespace-pre-wrap pt-2">{msg}</pre> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
