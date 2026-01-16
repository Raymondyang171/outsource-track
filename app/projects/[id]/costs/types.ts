export type CostType = {
  id: string;
  org_id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type CostRequest = {
  id: string;
  org_id: string;
  unit_id: string;
  project_id: string;
  doc_no: string;
  request_date: string;
  requested_by: string;
  payee_type: string;
  payee_name: string;
  currency: string;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  payment_date: string | null;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CostItem = {
  id: string;
  cost_request_id: string;
  org_id: string;
  unit_id: string;
  project_id: string;
  project_task_id: string | null;
  expense_type_id: string;
  description: string;
  qty: number;
  uom: string | null;
  unit_price: number;
  amount: number;
  tax_rate: number | null;
  tax_amount: number | null;
  is_tax_included: boolean | null;
  incurred_on: string | null;
  used_by: string | null;
  created_at: string;
};

export type CostAttachment = {
  id: string;
  cost_request_id: string | null;
  cost_item_id: string | null;
  org_id: string;
  unit_id: string;
  uploaded_by: string;
  kind: string;
  file_name: string;
  mime_type: string | null;
  storage_provider: string;
  external_file_id: string | null;
  web_view_link: string | null;
  invoice_no: string | null;
  issued_on: string | null;
  created_at: string;
};

export type ProfileMap = Record<string, string>;

export type CostRequestFormItem = {
  expense_type_id: string;
  description: string;
  qty: number;
  uom: string;
  unit_price: number;
  tax_rate: number | null;
  is_tax_included: boolean;
  incurred_on: string | null;
};
