"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CostItem, CostRequest, CostRequestFormItem, CostType } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: CostRequest | null;
  items: CostItem[];
  costTypes: CostType[];
  onSubmit: (payload: {
    mode: "create" | "update";
    requestId?: string;
    doc_no: string;
    request_date: string;
    payee_type: string;
    payee_name: string;
    currency: string;
    note: string;
    items: CostRequestFormItem[];
  }) => void;
  loading: boolean;
};

type FormErrors = {
  doc_no?: string;
  request_date?: string;
  payee_name?: string;
  currency?: string;
  items?: string;
};

function toFormItems(items: CostItem[]): CostRequestFormItem[] {
  return items.map((item) => ({
    expense_type_id: item.expense_type_id,
    description: item.description,
    qty: item.qty ?? 1,
    uom: item.uom ?? "",
    unit_price: item.unit_price ?? 0,
    tax_rate: item.tax_rate ?? null,
    is_tax_included: item.is_tax_included ?? true,
    incurred_on: item.incurred_on ?? null,
  }));
}

const emptyItem = (): CostRequestFormItem => ({
  expense_type_id: "",
  description: "",
  qty: 1,
  uom: "",
  unit_price: 0,
  tax_rate: null,
  is_tax_included: true,
  incurred_on: null,
});

export default function CostRequestFormModal(props: Props) {
  const [docNo, setDocNo] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [payeeType, setPayeeType] = useState("vendor");
  const [payeeName, setPayeeName] = useState("");
  const [currency, setCurrency] = useState("TWD");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<CostRequestFormItem[]>([emptyItem()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const activeTypes = useMemo(() => props.costTypes.filter((type) => type.active), [props.costTypes]);

  useEffect(() => {
    if (!props.open) return;
    if (props.request) {
      setDocNo(props.request.doc_no ?? "");
      setRequestDate(props.request.request_date ?? "");
      setPayeeType(props.request.payee_type ?? "vendor");
      setPayeeName(props.request.payee_name ?? "");
      setCurrency(props.request.currency ?? "TWD");
      setNote(props.request.note ?? "");
      setRows(props.items.length > 0 ? toFormItems(props.items) : [emptyItem()]);
    } else {
      setDocNo("");
      setRequestDate("");
      setPayeeType("vendor");
      setPayeeName("");
      setCurrency("TWD");
      setNote("");
      setRows([emptyItem()]);
    }
    setErrors({});
  }, [props.open, props.request, props.items]);

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.qty * row.unit_price, 0);
  }, [rows]);

  function updateRow(index: number, next: Partial<CostRequestFormItem>) {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...next };
      return updated;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyItem()]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!docNo.trim()) nextErrors.doc_no = "單號必填";
    if (!requestDate) nextErrors.request_date = "申請日必填";
    if (!payeeName.trim()) nextErrors.payee_name = "收款人必填";
    if (!currency.trim()) nextErrors.currency = "幣別必填";
    const validRows = rows.filter((row) => row.description.trim());
    if (validRows.length === 0) nextErrors.items = "至少需要 1 筆明細";
    if (validRows.some((row) => !row.expense_type_id)) {
      nextErrors.items = "明細需選擇費用類型";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const payload = {
      mode: props.request ? ("update" as const) : ("create" as const),
      requestId: props.request?.id,
      doc_no: docNo.trim(),
      request_date: requestDate,
      payee_type: payeeType,
      payee_name: payeeName.trim(),
      currency: currency.trim().toUpperCase(),
      note: note.trim(),
      items: rows
        .filter((row) => row.description.trim())
        .map((row) => ({
          ...row,
          qty: Number(row.qty) || 0,
          unit_price: Number(row.unit_price) || 0,
          tax_rate: row.tax_rate === null ? null : Number(row.tax_rate),
        })),
    };
    props.onSubmit(payload);
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-4xl space-y-4">
        <div className="card-header">
          <div className="card-title">{props.request ? "編輯請款單" : "新增請款單"}</div>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            關閉
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">單號 *</div>
            <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
            {errors.doc_no && <div className="text-xs text-red-500">{errors.doc_no}</div>}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">申請日 (YYYY/MM/DD) *</div>
            <Input
              type="date"
              lang="zh-TW"
              title="YYYY/MM/DD"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
            />
            {errors.request_date && (
              <div className="text-xs text-red-500">{errors.request_date}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">收款類型</div>
            <select className="input" value={payeeType} onChange={(e) => setPayeeType(e.target.value)}>
              <option value="employee">員工</option>
              <option value="vendor">供應商</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">收款人 *</div>
            <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            {errors.payee_name && (
              <div className="text-xs text-red-500">{errors.payee_name}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">幣別 *</div>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            {errors.currency && (
              <div className="text-xs text-red-500">{errors.currency}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">備註</div>
            <textarea
              className="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">明細 *</div>
            <Button variant="outline" size="sm" onClick={addRow}>
              新增明細
            </Button>
          </div>
          {errors.items && <div className="text-xs text-red-500">{errors.items}</div>}

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={`item-${index}`} className="grid gap-3 md:grid-cols-8">
                <select
                  className="input md:col-span-2"
                  value={row.expense_type_id}
                  onChange={(e) => updateRow(index, { expense_type_id: e.target.value })}
                >
                  <option value="">費用類型</option>
                  {activeTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <Input
                  className="md:col-span-2"
                  placeholder="品項說明"
                  value={row.description}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                />
                <Input
                  type="number"
                  className="md:col-span-1"
                  placeholder="數量"
                  value={row.qty}
                  onChange={(e) => updateRow(index, { qty: Number(e.target.value) })}
                />
                <Input
                  className="md:col-span-1"
                  placeholder="單位"
                  value={row.uom}
                  onChange={(e) => updateRow(index, { uom: e.target.value })}
                />
                <Input
                  type="number"
                  className="md:col-span-1"
                  placeholder="單價"
                  value={row.unit_price}
                  onChange={(e) => updateRow(index, { unit_price: Number(e.target.value) })}
                />
                <Input
                  type="date"
                  className="md:col-span-1"
                  lang="zh-TW"
                  title="YYYY/MM/DD"
                  value={row.incurred_on ?? ""}
                  onChange={(e) => updateRow(index, { incurred_on: e.target.value || null })}
                />
                <div className="md:col-span-8 flex justify-between text-xs text-muted-foreground">
                  <span>小計 {Number(row.qty) * Number(row.unit_price)}</span>
                  {rows.length > 1 && (
                    <button className="text-red-500" type="button" onClick={() => removeRow(index)}>
                      移除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">總額預估 {totalAmount}</div>
          <a className="text-sm text-blue-600" href="/admin/cost-types">
            管理費用類型
          </a>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={props.loading}>
              {props.loading ? "處理中..." : "儲存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
