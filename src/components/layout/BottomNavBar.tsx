import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, CheckSquare, DollarSign, Menu, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/contexts/ProjectContext";

interface BottomNavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  project?: "educacional" | "nutra" | "all";
}

const bottomNavItems: BottomNavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/", project: "all" },
  { label: "Leads", icon: Users, to: "/leads", project: "educacional" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas", project: "all" },
  { label: "Financeiro", icon: DollarSign, to: "/financeiro", project: "all" },
  { label: "Menu", icon: Menu, to: "#", project: "all" },
];

// Para Nutra, substitui Leads por Meta Ads
const getBottomNavItemsForProject = (projectSlug?: string): BottomNavItem[] => {
  if (projectSlug === "nutra") {
    return bottomNavItems.map(item => 
      item.to === "/leads" 
        ? { label: "Meta Ads", icon: BarChart3, to: "/nutra/meta-ads", project: "nutra" as const }
        : item
    ).filter(item => item.project === "all" || item.project === projectSlug);
  }
  return bottomNavItems.filter(item => item.project === "all" || item.project === projectSlug);
};

export function BottomNavBar({ onMenuClick }: { onMenuClick: () => void }) {
  const location = useLocation();
  const { currentProject } = useProject();

  const visibleItems = getBottomNavItemsForProject(currentProject?.slug);

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border z-50 md:hidden">
      <div className="flex items-center justify-around h-full px-2">
        {visibleItems.map((item) => {
          if (item.to === "#") {
            return (
              <button
                key={item.label}
                onClick={onMenuClick}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
                  "text-muted-foreground active:text-foreground active:bg-accent/50 rounded-md"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          }

          const isActive = location.pathname === item.to || (item.to === "/" && location.pathname === "/");

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive: navIsActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors rounded-md",
                  navIsActive || isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground active:text-foreground active:bg-accent/50"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
