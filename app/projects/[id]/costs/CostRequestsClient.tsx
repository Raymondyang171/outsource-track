"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClientClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import CostRequestTable from "./CostRequestTable";
import CostRequestFormModal from "./CostRequestFormModal";
import CostRequestDetailDrawer from "./CostRequestDetailDrawer";
import type {
  CostAttachment,
  CostItem,
  CostRequest,
  CostRequestFormItem,
  CostType,
  ProfileMap,
} from "./types";

type ProjectRow = {
  id: string;
  name: string;
  org_id: string;
  unit_id: string;
};

type Props = {
  project: ProjectRow;
  currentUser: { id: string; display_name: string };
  role: string | null;
  primaryUnitId: string;
  costTypes: CostType[];
  requests: CostRequest[];
  items: CostItem[];
  attachments: CostAttachment[];
  profiles: ProfileMap;
  errors: string[];
};

type SaveRequestPayload = {
  mode: "create" | "update";
  requestId?: string;
  doc_no: string;
  request_date: string;
  payee_type: string;
  payee_name: string;
  currency: string;
  note: string;
  items: CostRequestFormItem[];
};

type AttachmentPayload = {
  cost_item_id: string | null;
  kind: string;
  file_name: string;
  web_view_link: string;
  external_file_id: string;
  invoice_no: string;
  issued_on: string | null;
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function CostRequestsClient(props: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClientClient(), []);

  const [requests, setRequests] = useState<CostRequest[]>(props.requests);
  const [items, setItems] = useState<CostItem[]>(props.items);
  const [attachments, setAttachments] = useState<CostAttachment[]>(props.attachments);
  const [message, setMessage] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<CostRequest | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(getToday());
  const [paymentTarget, setPaymentTarget] = useState<CostRequest | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setRequests(props.requests), [props.requests]);
  useEffect(() => setItems(props.items), [props.items]);
  useEffect(() => setAttachments(props.attachments), [props.attachments]);

  const canManage = props.role === "manager" || props.role === "admin";

  const itemsByRequest = useMemo(() => {
    const map: Record<string, CostItem[]> = {};
    for (const item of items) {
      if (!map[item.cost_request_id]) map[item.cost_request_id] = [];
      map[item.cost_request_id].push(item);
    }
    return map;
  }, [items]);

  const attachmentsByRequest = useMemo(() => {
    const map: Record<string, CostAttachment[]> = {};
    for (const attachment of attachments) {
      const key = attachment.cost_request_id ?? "";
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(attachment);
    }
    return map;
  }, [attachments]);

  const attachmentsByItem = useMemo(() => {
    const map: Record<string, CostAttachment[]> = {};
    for (const attachment of attachments) {
      const key = attachment.cost_item_id ?? "";
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(attachment);
    }
    return map;
  }, [attachments]);

  function openCreate() {
    setEditingRequest(null);
    setFormOpen(true);
  }

  function openEdit(request: CostRequest) {
    setEditingRequest(request);
    setFormOpen(true);
  }

  function openDetail(requestId: string) {
    setDetailRequestId(requestId);
    setDetailOpen(true);
  }

  async function handleSaveRequest(payload: SaveRequestPayload) {
    setMessage("");
    startTransition(async () => {
      if (payload.mode === "create") {
        const { error } = await supabase.rpc("upsert_cost_request_with_items", {
          p_request_id: null,
          p_unit_id: props.primaryUnitId,
          p_project_id: props.project.id,
          p_doc_no: payload.doc_no,
          p_request_date: payload.request_date,
          p_requested_by: props.currentUser.id,
          p_payee_type: payload.payee_type,
          p_payee_name: payload.payee_name,
          p_currency: payload.currency,
          p_note: payload.note || null,
          p_items: payload.items,
        });

        if (error) {
          setMessage(error.message);
          return;
        }
      } else if (payload.requestId) {
        const { error } = await supabase.rpc("upsert_cost_request_with_items", {
          p_request_id: payload.requestId,
          p_unit_id: props.primaryUnitId,
          p_project_id: props.project.id,
          p_doc_no: payload.doc_no,
          p_request_date: payload.request_date,
          p_requested_by: props.currentUser.id,
          p_payee_type: payload.payee_type,
          p_payee_name: payload.payee_name,
          p_currency: payload.currency,
          p_note: payload.note || null,
          p_items: payload.items,
        });

        if (error) {
          setMessage(error.message);
          return;
        }
      }

      setFormOpen(false);
      router.refresh();
    });
  }

  async function updateStatus(request: CostRequest, nextStatus: string, opts?: Record<string, any>) {
    setMessage("");
    startTransition(async () => {
      const updates = { status: nextStatus, ...(opts ?? {}) };
      const { data, error } = await supabase
        .from("cost_requests")
        .update(updates)
        .eq("id", request.id)
        .eq("status", request.status)
        .select("id");

      if (error) {
        setMessage(error.message);
        return;
      }
      if (!data || data.length === 0) {
        setMessage("狀態更新失敗，請重新整理後再試");
        return;
      }
      router.refresh();
    });
  }

  async function handleSubmit(request: CostRequest) {
    await updateStatus(request, "submitted", { submitted_at: new Date().toISOString() });
  }

  async function handleApprove(request: CostRequest) {
    await updateStatus(request, "approved", {
      approved_at: new Date().toISOString(),
      approved_by: props.currentUser.id,
    });
  }

  async function handleReject(request: CostRequest) {
    const reason = window.prompt("退回原因", request.rejected_reason ?? "");
    if (reason === null) return;
    await updateStatus(request, "rejected", {
      rejected_at: new Date().toISOString(),
      rejected_reason: reason.trim() || null,
    });
  }

  async function handlePaid(request: CostRequest) {
    setPaymentTarget(request);
    setPaymentDate(request.payment_date ?? getToday());
    setPaymentOpen(true);
  }

  async function handleAddAttachment(request: CostRequest, payload: AttachmentPayload) {
    setMessage("");
    startTransition(async () => {
      const { error } = await supabase.from("cost_attachments").insert({
        cost_request_id: request.id,
        cost_item_id: payload.cost_item_id || null,
        org_id: props.project.org_id,
        unit_id: request.unit_id,
        uploaded_by: props.currentUser.id,
        kind: payload.kind,
        file_name: payload.file_name,
        web_view_link: payload.web_view_link || null,
        external_file_id: payload.external_file_id || null,
        invoice_no: payload.invoice_no || null,
        issued_on: payload.issued_on,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.refresh();
    });
  }

  const selectedRequest = detailRequestId
    ? requests.find((row) => row.id === detailRequestId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <div className="page-title">專案費用</div>
          <div className="page-subtitle">專案 {props.project.name}</div>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate}>新增請款單</Button>
        </div>
      </div>

      {props.errors.length > 0 && (
        <div className="admin-error">{props.errors.join("\n")}</div>
      )}
      {message && <div className="admin-error">{message}</div>}

      <CostRequestTable
        requests={requests}
        itemsByRequest={itemsByRequest}
        costTypes={props.costTypes}
        profiles={props.profiles}
        onSelect={openDetail}
        onEdit={openEdit}
        onSubmit={handleSubmit}
        onApprove={handleApprove}
        onReject={handleReject}
        onPaid={handlePaid}
        canManage={canManage}
        loading={isPending}
      />

      <CostRequestFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        request={editingRequest}
        items={editingRequest ? itemsByRequest[editingRequest.id] ?? [] : []}
        costTypes={props.costTypes}
        onSubmit={handleSaveRequest}
        loading={isPending}
      />

      <CostRequestDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        request={selectedRequest}
        items={selectedRequest ? itemsByRequest[selectedRequest.id] ?? [] : []}
        attachmentsByRequest={
          selectedRequest ? attachmentsByRequest[selectedRequest.id] ?? [] : []
        }
        attachmentsByItem={attachmentsByItem}
        costTypes={props.costTypes}
        profiles={props.profiles}
        onAddAttachment={handleAddAttachment}
        loading={isPending}
      />

      {paymentOpen && paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="card-header">
              <div className="card-title">設定付款日期</div>
              <Button variant="outline" onClick={() => setPaymentOpen(false)}>
                關閉
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">付款日期 (YYYY/MM/DD)</div>
              <input
                type="date"
                className="input"
                lang="zh-TW"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                title="YYYY/MM/DD"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => setPaymentOpen(false)}
                disabled={isPending}
              >
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!paymentTarget) return;
                  await updateStatus(paymentTarget, "paid", { payment_date: paymentDate });
                  setPaymentOpen(false);
                }}
                disabled={isPending}
              >
                確認付款
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
