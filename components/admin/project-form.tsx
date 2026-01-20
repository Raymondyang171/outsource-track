
"use client";

import { useState } from "react";
import { safeFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";

type Org = {
  id: string;
  name: string;
};

type Unit = {
    id: string;
    name: string;
    org_id: string;
};

type ProjectFormProps = {
  orgs: Org[];
  units: Unit[];
  defaultOrgId: string | null;
};

export default function ProjectForm({ orgs, units, defaultOrgId }: ProjectFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(defaultOrgId);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const org_id = formData.get("org_id") as string;
    const unit_id = formData.get("unit_id") as string;
    const name = formData.get("name") as string;
    const start_date = formData.get("start_date") as string;
    const status = formData.get("status") as string;

    try {
      await safeFetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id, unit_id, name, start_date, status }),
      });
      router.push("/admin/projects?ok=created");
      router.refresh(); // Refresh the page to show the new project
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredUnits = selectedOrg ? units.filter(unit => unit.org_id === selectedOrg) : units;

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
        <select name="org_id" defaultValue={defaultOrgId ?? ""} onChange={(e) => setSelectedOrg(e.target.value)}>
            <option value="">選擇公司</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select name="unit_id" defaultValue="">
            <option value="">選擇部門</option>
            {filteredUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="專案名稱" required />
          <input name="start_date" type="date" lang="zh-TW" title="YYYY/MM/DD" placeholder="開始日期 (YYYY/MM/DD)" />
          <input name="status" placeholder="狀態（選填）" />
      <button type="submit">新增專案</button>
      {error && <p className="admin-error">{error}</p>}
    </form>
  );
}
