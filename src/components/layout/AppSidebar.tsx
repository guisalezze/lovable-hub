import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  CalendarDays,
  CheckSquare,
  Plug,
  Settings,
  Users2,
  FileBarChart,
  ClipboardList,
  Briefcase,
  UserCheck,
  BarChart3,
  ChevronDown,
  FileText,
  LogOut,
} from "lucide-react";
import { useProject, type Project } from "@/contexts/ProjectContext";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
}

const educacionalItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Leads", icon: Users, to: "/leads" },
  { label: "Meta Ads", icon: BarChart3, to: "/meta-ads" },
  { label: "Financeiro", icon: DollarSign, to: "/financeiro" },
  { label: "Mentorias", icon: Briefcase, to: "/mentorias" },
  { label: "Clientes", icon: UserCheck, to: "/clientes" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas" },
  { label: "Copies", icon: FileText, to: "/copies" },
  { label: "Onboarding", icon: ClipboardList, to: "/onboarding-admin" },
  { label: "Produtos", icon: Package, to: "/produtos" },
  { label: "Agenda", icon: CalendarDays, to: "/agenda" },
  { label: "Relatórios", icon: FileBarChart, to: "/relatorios" },
  { label: "Integrações", icon: Plug, to: "/integracoes" },
];

const nutraItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Meta Ads", icon: BarChart3, to: "/nutra/meta-ads" },
  { label: "Financeiro", icon: DollarSign, to: "/financeiro" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas" },
  { label: "Copies", icon: FileText, to: "/copies" },
  { label: "Produtos", icon: Package, to: "/produtos" },
  { label: "Agenda", icon: CalendarDays, to: "/agenda" },
  { label: "Relatórios", icon: FileBarChart, to: "/relatorios" },
  { label: "Integrações", icon: Plug, to: "/integracoes" },
];

const sharedItems: NavItem[] = [
  { label: "Equipe", icon: Users2, to: "/equipe" },
  { label: "Configurações", icon: Settings, to: "/configuracoes" },
];

interface ProjectGroupProps {
  project: Project;
  items: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectProject: (project: Project) => void;
  isActiveProject: boolean;
  currentPath: string;
}

function ProjectGroup({ project, items, isOpen, onToggle, onSelectProject, isActiveProject, currentPath }: ProjectGroupProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold w-full transition-colors",
          "hover:bg-sidebar-accent/50 text-sidebar-foreground"
        )}
      >
        <span className="text-base">{project.icon}</span>
        <span className="flex-1 text-left truncate">{project.name}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-50 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="ml-2 pl-3 border-l border-sidebar-border/50 space-y-0.5 mt-0.5 mb-1">
          {items.map((item) => {
            // For shared routes like "/" or "/financeiro", only highlight if this is the active project
            const isItemActive = (path: string) => {
              if (path === "/") return currentPath === "/" && isActiveProject;
              return currentPath === path && isActiveProject;
            };

            return (
              <NavLink
                key={`${project.slug}-${item.to}`}
                to={item.to}
                end={item.to === "/"}
                onClick={() => onSelectProject(project)}
                className={() =>
                  cn(
                    "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    isItemActive(item.to)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AppSidebarProps {
  open: boolean;
  onToggle: () => void;
}

function SidebarContent() {
  const { projects, currentProject, setCurrentProject } = useProject();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ educacional: true, nutra: true });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const eduProject = projects.find((p) => p.slug === "educacional");
  const nutraProject = projects.find((p) => p.slug === "nutra");

  const toggleGroup = (slug: string) => {
    setOpenGroups((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border shrink-0 gap-3">
        <img
          src="/logo.png"
          alt="Solaryz"
          className="h-12 w-12 rounded-xl object-cover shrink-0"
        />
        <span className="heading-display text-foreground text-lg whitespace-nowrap">
          Solaryz
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
        {/* Educacional Group */}
        {eduProject && (
          <ProjectGroup
            project={eduProject}
            items={educacionalItems}
            isOpen={openGroups.educacional ?? true}
            onToggle={() => toggleGroup("educacional")}
            onSelectProject={setCurrentProject}
            isActiveProject={currentProject?.slug === "educacional"}
            currentPath={location.pathname}
          />
        )}

        {/* Nutra Group */}
        {nutraProject && (
          <ProjectGroup
            project={nutraProject}
            items={nutraItems}
            isOpen={openGroups.nutra ?? true}
            onToggle={() => toggleGroup("nutra")}
            onSelectProject={setCurrentProject}
            isActiveProject={currentProject?.slug === "nutra"}
            currentPath={location.pathname}
          />
        )}

        {/* Divider */}
        <div className="h-px bg-sidebar-border/50 my-2" />

        {/* Shared items */}
        {sharedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <img
            src="/logo.png"
            alt="Solaryz"
            className="h-9 w-9 rounded-xl object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">Solaryz</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {currentProject?.name || "Carregando..."}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </>
  );
}

export function AppSidebar({ open, onToggle }: AppSidebarProps) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const prevPathnameRef = useRef(location.pathname);

  // Fechar sidebar no mobile APENAS quando navegar (pathname mudar)
  useEffect(() => {
    if (isMobile && open && location.pathname !== prevPathnameRef.current) {
      // Pathname mudou = usuário navegou, então fechar o menu
      prevPathnameRef.current = location.pathname;
      const timer = setTimeout(() => {
        onToggle();
      }, 300); // Delay maior para permitir animação de navegação
      return () => clearTimeout(timer);
    } else if (location.pathname !== prevPathnameRef.current) {
      // Atualizar ref mesmo se não fechar
      prevPathnameRef.current = location.pathname;
    }
  }, [location.pathname, isMobile, open, onToggle]);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onToggle}>
        <SheetContent 
          side="left" 
          className="sidebar-fullscreen w-full max-w-full p-0 bg-sidebar text-sidebar-foreground [&>button]:hidden z-[95]"
        >
          <div className="flex h-full w-full flex-col">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-300 overflow-hidden flex flex-col h-screen fixed left-0 top-0 z-40",
        open ? "w-60" : "w-0"
      )}
    >
      <SidebarContent />
    </aside>
  );
}
