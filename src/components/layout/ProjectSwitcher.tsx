import { ChevronDown } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectSwitcher() {
  const { projects, currentProject, setCurrentProject } = useProject();

  if (projects.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium w-full hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground">
        <span className="text-base">{currentProject?.icon}</span>
        <span className="flex-1 text-left truncate">{currentProject?.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => setCurrentProject(project)}
            className={currentProject?.id === project.id ? "bg-accent" : ""}
          >
            <span className="mr-2">{project.icon}</span>
            {project.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
