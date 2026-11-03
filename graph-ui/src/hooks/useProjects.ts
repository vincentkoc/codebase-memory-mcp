import { useCallback, useEffect, useState } from "react";
import { callToolPages } from "../api/rpc";
import type { Project, SchemaInfo } from "../lib/types";

interface ProjectInfo {
  project: Project;
  schema: SchemaInfo | null;
}

interface UseProjectsResult {
  projects: ProjectInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pages = await callToolPages<{ projects: Project[] }>("list_projects", { include_details: true });
      const list = pages.flatMap(page => page.projects ?? []);

      /* Fetch schema for each project */
      const infos: ProjectInfo[] = await Promise.all(
        list.map(async (p) => {
          try {
            const pages = await callToolPages<SchemaInfo>("get_graph_schema", {
              project: p.name,
            });
            const schema: SchemaInfo = {
              node_labels: pages.flatMap(page => page.node_labels ?? []),
              edge_types: pages.flatMap(page => page.edge_types ?? []),
            };
            return { project: p, schema };
          } catch {
            return { project: p, schema: null };
          }
        }),
      );

      setProjects(infos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refresh: fetchProjects };
}
