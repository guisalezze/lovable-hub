import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskModal } from "@/components/tasks/TaskModal";

vi.mock("@/contexts/ProjectContext", () => ({
  useProject: () => ({ currentProject: { id: "project-1" } }),
}));

vi.mock("@/hooks/useTasks", () => ({
  useCreateTask: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
  useTeamMembers: () => ({ data: [] }),
}));

describe("TaskModal", () => {
  it("sincroniza os campos ao alternar de nova tarefa para edição", () => {
    const { rerender } = render(
      <TaskModal open={true} onOpenChange={() => {}} task={null} />,
    );

    expect(screen.getByPlaceholderText("Título *")).toHaveValue("");

    rerender(
      <TaskModal
        open={true}
        onOpenChange={() => {}}
        task={{
          id: "task-1",
          title: "Tarefa existente",
          description: "Descrição",
          status: "backlog",
          priority: "media",
          due_date: null,
          assigned_to: null,
          tags: [],
          checklist: [],
          project_id: "project-1",
          created_by: "user-1",
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Tarefa existente");
  });
});
