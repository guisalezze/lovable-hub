import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Project {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  created_at: string;
}

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  currentProject: null,
  setCurrentProject: () => {},
  isLoading: true,
});

export function useProject() {
  return useContext(ProjectContext);
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_projects");
      if (error) throw error;
      const projectList = (data as Project[]) || [];
      setProjects(projectList);

      // Restore from localStorage or default to first
      const savedSlug = localStorage.getItem("solaryz_project");
      const saved = projectList.find((p) => p.slug === savedSlug);
      setCurrentProjectState(saved || projectList[0] || null);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const setCurrentProject = useCallback((project: Project) => {
    setCurrentProjectState(project);
    localStorage.setItem("solaryz_project", project.slug);
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, currentProject, setCurrentProject, isLoading }}>
      {children}
    </ProjectContext.Provider>
  );
}
