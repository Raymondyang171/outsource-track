"use client";

import { FolderKanban, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


type Project = {
  id: string;
  name: string;
};

const ALL_PROJECTS_VALUE = "__all__";

export default function SearchForm({
  projects,
  projectIdFilter,
  searchTerm,
}: {
  projects: Project[];
  projectIdFilter?: string;
  searchTerm?: string;
}) {
  const router = useRouter();

  function handleProjectChange(projectId: string) {
    const params = new URLSearchParams(window.location.search);
    if (projectId && projectId !== ALL_PROJECTS_VALUE) {
      params.set("project_id", projectId);
    } else {
      params.delete("project_id");
    }
    router.push(`/admin/tasks?${params.toString()}`);
  }

  return (
    <form className="flex flex-col md:flex-row gap-3 w-full md:w-auto" method="get">
      <div className="relative flex items-center">
        <FolderKanban className="absolute left-3 w-4 h-4 text-muted-foreground" />
        <Select
          defaultValue={projectIdFilter ?? ALL_PROJECTS_VALUE}
          onValueChange={handleProjectChange}
        >
            <SelectTrigger className="pl-10 min-w-[200px]">
                <SelectValue placeholder="所有專案" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_PROJECTS_VALUE}>所有專案</SelectItem>
                {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={searchTerm ?? ""}
          placeholder="搜尋任務名稱..."
          className="pl-10 w-full md:w-64"
        />
      </div>
      <button type="submit" className="hidden">
        Search
      </button>
    </form>
  );
}
