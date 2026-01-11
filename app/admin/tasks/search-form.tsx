"use client";

import { FolderKanban, Search } from "lucide-react";

type Project = {
  id: string;
  name: string;
};

export default function SearchForm({
  projects,
  projectIdFilter,
  searchTerm,
}: {
  projects: Project[];
  projectIdFilter?: string;
  searchTerm?: string;
}) {
  return (
    <form className="flex flex-col md:flex-row gap-3 w-full md:w-auto" method="get">
      <div className="relative">
        <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <select
          name="project_id"
          defaultValue={projectIdFilter ?? ""}
          className="pl-10 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-slate-50 min-w-[200px]"
          onChange={(e) => e.target.form?.requestSubmit()}
        >
          <option value="">所有專案</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          name="q"
          defaultValue={searchTerm ?? ""}
          placeholder="搜尋任務名稱..."
          className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-slate-50 w-full md:w-64"
        />
      </div>
      <button type="submit" className="hidden">
        Search
      </button>
    </form>
  );
}