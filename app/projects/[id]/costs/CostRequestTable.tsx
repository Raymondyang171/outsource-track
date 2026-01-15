"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CostItem, CostRequest, CostType, ProfileMap } from "./types";

type Props = {
  requests: CostRequest[];
  itemsByRequest: Record<string, CostItem[]>;
  costTypes: CostType[];
  profiles: ProfileMap;
  onSelect: (id: string) => void;
  onEdit: (request: CostRequest) => void;
  onSubmit: (request: CostRequest) => void;
  onApprove: (request: CostRequest) => void;
  onReject: (request: CostRequest) => void;
  onPaid: (request: CostRequest) => void;
  canManage: boolean;
  loading: boolean;
};

function toDateString(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  return dateOnly.replaceAll("-", "/");
}

function currencyFormat(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: currency || "TWD",
      maximumFractionDigits: 2,
    }).format(amount ?? 0);
  } catch {
    return `${amount ?? 0} ${currency ?? ""}`;
  }
}

const statusLabels: Record<string, string> = {
  draft: "草稿",
  submitted: "已送出",
  approved: "已核准",
  rejected: "已退回",
  paid: "已付款",
  canceled: "已取消",
};

export default function CostRequestTable(props: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const requesters = useMemo(() => {
    const set = new Set<string>();
    props.requests.forEach((row) => set.add(row.requested_by));
    return [...set];
  }, [props.requests]);

  const filteredRequests = useMemo(() => {
    return props.requests.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (requesterFilter && row.requested_by !== requesterFilter) return false;

      if (startDate && row.request_date < startDate) return false;
      if (endDate && row.request_date > endDate) return false;

      if (typeFilter) {
        const items = props.itemsByRequest[row.id] ?? [];
        const matches = items.some((item) => item.expense_type_id === typeFilter);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    props.requests,
    props.itemsByRequest,
    statusFilter,
    requesterFilter,
    startDate,
    endDate,
    typeFilter,
  ]);

  return (
    <div className="card space-y-4">
      <div className="card-header">
        <div className="card-title">費用請款單</div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <select
          className="input"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">全部狀態</option>
          {Object.keys(statusLabels).map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="">全部費用類型</option>
          {props.costTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={requesterFilter}
          onChange={(event) => setRequesterFilter(event.target.value)}
        >
          <option value="">全部申請人</option>
          {requesters.map((id) => (
            <option key={id} value={id}>
              {props.profiles[id] ?? id}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="input"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          lang="zh-TW"
          title="YYYY/MM/DD"
        />

        <input
          type="date"
          className="input"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          lang="zh-TW"
          title="YYYY/MM/DD"
        />
      </div>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>單號</th>
              <th>申請日</th>
              <th>申請人</th>
              <th>收款人</th>
              <th>幣別</th>
              <th>總金額</th>
              <th>狀態</th>
              <th>付款日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((row) => {
              const canEdit = row.status === "draft" || row.status === "submitted";
              return (
                <tr key={row.id}>
                  <td>
                    <button className="text-blue-600" onClick={() => props.onSelect(row.id)}>
                      {row.doc_no}
                    </button>
                  </td>
                  <td>{toDateString(row.request_date)}</td>
                  <td>{props.profiles[row.requested_by] ?? row.requested_by}</td>
                  <td>{row.payee_name}</td>
                  <td>{row.currency}</td>
                  <td>{currencyFormat(row.total_amount, row.currency)}</td>
                  <td>{statusLabels[row.status] ?? row.status}</td>
                  <td>{toDateString(row.payment_date)}</td>
                  <td className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => props.onSelect(row.id)}>
                      檢視
                    </Button>
                    {canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onEdit(row)}
                        disabled={props.loading}
                      >
                        編輯
                      </Button>
                    )}
                    {row.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() => props.onSubmit(row)}
                        disabled={props.loading}
                      >
                        送出
                      </Button>
                    )}
                    {props.canManage && row.status === "submitted" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => props.onApprove(row)}
                          disabled={props.loading}
                        >
                          核准
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => props.onReject(row)}
                          disabled={props.loading}
                        >
                          退回
                        </Button>
                      </>
                    )}
                    {props.canManage && row.status === "approved" && (
                      <Button
                        size="sm"
                        onClick={() => props.onPaid(row)}
                        disabled={props.loading}
                      >
                        標記已付款
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={9}>尚無請款單</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
