"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CostAttachment, CostItem, CostRequest, CostType, ProfileMap } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: CostRequest | null;
  items: CostItem[];
  attachmentsByRequest: CostAttachment[];
  attachmentsByItem: Record<string, CostAttachment[]>;
  costTypes: CostType[];
  profiles: ProfileMap;
  onAddAttachment: (request: CostRequest, payload: {
    cost_item_id: string | null;
    kind: string;
    file_name: string;
    web_view_link: string;
    external_file_id: string;
    invoice_no: string;
    issued_on: string | null;
  }) => void;
  loading: boolean;
};

const kindOptions = [
  "invoice",
  "quotation",
  "delivery_note",
  "receipt",
  "other",
];

const kindLabels: Record<string, string> = {
  invoice: "發票",
  quotation: "報價單",
  delivery_note: "出貨單",
  receipt: "收據",
  other: "其他",
};

function formatDateSlash(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  return dateOnly.replaceAll("-", "/");
}

export default function CostRequestDetailDrawer(props: Props) {
  const [kind, setKind] = useState("invoice");
  const [fileName, setFileName] = useState("");
  const [webLink, setWebLink] = useState("");
  const [externalId, setExternalId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [linkItemId, setLinkItemId] = useState("");

  const costTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const type of props.costTypes) {
      map[type.id] = type.name;
    }
    return map;
  }, [props.costTypes]);

  const allAttachments = useMemo(() => {
    const seen = new Map<string, CostAttachment>();
    for (const att of props.attachmentsByRequest) {
      seen.set(att.id, att);
    }
    for (const item of props.items) {
      for (const att of props.attachmentsByItem[item.id] ?? []) {
        if (!seen.has(att.id)) seen.set(att.id, att);
      }
    }
    return [...seen.values()];
  }, [props.attachmentsByRequest, props.attachmentsByItem, props.items]);

  if (!props.open) return null;

  const request = props.request;

  function resetAttachmentForm() {
    setKind("invoice");
    setFileName("");
    setWebLink("");
    setExternalId("");
    setInvoiceNo("");
    setIssuedOn("");
    setLinkItemId("");
  }

  function handleAddAttachment() {
    if (!request) return;
    if (!fileName.trim()) return;
    props.onAddAttachment(request, {
      cost_item_id: linkItemId || null,
      kind,
      file_name: fileName.trim(),
      web_view_link: webLink.trim(),
      external_file_id: externalId.trim(),
      invoice_no: invoiceNo.trim(),
      issued_on: issuedOn || null,
    });
    resetAttachmentForm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => props.onOpenChange(false)}
      />
      <div className="relative z-10 w-[min(960px,95vw)] max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="text-lg font-semibold text-slate-800">請款單明細</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => props.onOpenChange(false)}
            aria-label="關閉"
          >
            ✕
          </Button>
        </div>

        {!request ? (
          <div className="p-6 text-sm text-slate-500">尚未選取請款單。</div>
        ) : (
          <div className="space-y-4 p-6">
            <div className="space-y-1 text-sm">
              <div>單號：{request.doc_no}</div>
              <div>申請人：{props.profiles[request.requested_by] ?? request.requested_by}</div>
              <div>狀態：{request.status}</div>
            <div>付款日：{formatDateSlash(request.payment_date)}</div>
              <div>備註：{request.note ?? "-"}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">費用明細</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>類型</th>
                    <th>說明</th>
                    <th>數量</th>
                    <th>單價</th>
                    <th>小計</th>
                  </tr>
                </thead>
                <tbody>
                  {props.items.map((item) => (
                    <tr key={item.id}>
                      <td>{costTypeMap[item.expense_type_id] ?? item.expense_type_id}</td>
                      <td>{item.description}</td>
                      <td>{item.qty}</td>
                      <td>{item.unit_price}</td>
                      <td>{item.amount}</td>
                    </tr>
                  ))}
                  {props.items.length === 0 && (
                    <tr>
                      <td colSpan={5}>尚無明細</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">附件清單</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>類型</th>
                    <th>檔名</th>
                    <th>連結</th>
                    <th>發票號碼</th>
                    <th>明細綁定</th>
                  </tr>
                </thead>
                <tbody>
                  {allAttachments.map((att) => (
                    <tr key={att.id}>
                    <td>{kindLabels[att.kind] ?? att.kind}</td>
                      <td>{att.file_name}</td>
                      <td>
                        {att.web_view_link ? (
                          <a className="text-blue-600" href={att.web_view_link} target="_blank" rel="noreferrer">
                            開啟
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{att.invoice_no ?? "-"}</td>
                      <td>{att.cost_item_id ? "明細" : "請款單"}</td>
                    </tr>
                  ))}
                  {allAttachments.length === 0 && (
                    <tr>
                      <td colSpan={5}>尚無附件</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">新增附件</div>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {kindOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {kindLabels[opt] ?? opt}
                  </option>
                ))}
              </select>
              <Input
                placeholder="檔名"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
              <Input
                placeholder="檔案連結"
                value={webLink}
                onChange={(e) => setWebLink(e.target.value)}
              />
              <Input
                placeholder="外部檔案 ID"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
              />
              <Input
                placeholder="發票號碼"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
              <Input
                type="date"
                lang="zh-TW"
                title="YYYY/MM/DD"
                value={issuedOn}
                onChange={(e) => setIssuedOn(e.target.value)}
              />
                <select className="input" value={linkItemId} onChange={(e) => setLinkItemId(e.target.value)}>
                  <option value="">綁定請款單</option>
                  {props.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleAddAttachment} disabled={props.loading}>
                新增附件
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
