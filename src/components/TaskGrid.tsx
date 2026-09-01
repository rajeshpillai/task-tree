import { useMemo, useState } from "react";
import type { ColumnDef, ExpandedState, SortingState } from "@tanstack/react-table";
import {
  Badge,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  TreeTable,
} from "@algorisys/zen-ui-react";
import type { Stage, Task, User } from "../db/schema";
import { buildTree, type TaskNode } from "../lib/tree";
import { TitleCell } from "./TitleCell";
import { TaskRowMenu } from "./TaskRowMenu";
import { rowActions } from "./rowActions";

export interface TaskGridProps {
  tasks: readonly Task[];
  stages: readonly Stage[];
  users: readonly User[];
  onRenameTask: (id: string, title: string) => void;
  onAddSubtask: (parentId: string) => void;
  onMoveTask: (id: string, delta: number) => void;
  onIndentTask: (id: string) => void;
  onOutdentTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  loading?: boolean;
}

const dueDateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

export function TaskGrid({
  tasks,
  stages,
  users,
  onRenameTask,
  onAddSubtask,
  onMoveTask,
  onIndentTask,
  onOutdentTask,
  onDeleteTask,
  loading,
}: TaskGridProps) {
  // Owned here rather than left to TreeTable, so a sort or a filter cannot
  // collapse rows the user opened.
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Filtering keeps a match's ancestors on screen but does not open them, so
  // a search would show the parent and hide the row that actually matched.
  // Everything opens while a search is active; the user's own expansion is
  // held aside and comes back when they clear it.
  const filtering = globalFilter.trim() !== "";

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const data = useMemo(() => buildTree(tasks), [tasks]);

  const columns = useMemo<ColumnDef<TaskNode, unknown>[]>(
    () => [
      {
        id: "title",
        accessorFn: (row) => row.title,
        header: "Task",
        cell: ({ row }) => (
          <TitleCell
            title={row.original.title}
            onCommit={(next) => onRenameTask(row.original.id, next)}
          />
        ),
      },
      {
        id: "assignee",
        // Sorts and groups by name; the id would sort by a random UUID.
        accessorFn: (row) => (row.assigneeId ? (userById.get(row.assigneeId)?.name ?? "") : ""),
        header: "Assignee",
        enableGlobalFilter: false,
        sortDescFirst: false,
        cell: ({ row }) => {
          const user = row.original.assigneeId ? userById.get(row.original.assigneeId) : undefined;
          if (!user) return <span className="zen-text-zen-muted-fg">Unassigned</span>;
          return (
            <span className="zen-inline-flex zen-items-center zen-gap-2">
              <span
                aria-hidden="true"
                style={{ background: user.color }}
                className="zen-inline-block zen-h-2 zen-w-2 zen-rounded-zen-full"
              />
              {user.name}
            </span>
          );
        },
      },
      {
        id: "stage",
        // The stage's own order, so sorting follows the workflow rather than
        // the alphabet: Todo, In progress, Completed, not Completed first.
        accessorFn: (row) => stageById.get(row.stageId)?.order ?? Number.MAX_SAFE_INTEGER,
        header: "Stage",
        enableGlobalFilter: false,
        // TanStack sorts a numeric column descending on the first click. For a
        // workflow that means the first click lands on Completed, so the
        // stages read backwards.
        sortDescFirst: false,
        cell: ({ row }) => {
          const stage = stageById.get(row.original.stageId);
          if (!stage) return null;
          return (
            <Badge
              variant="outline"
              style={{ borderColor: stage.color, color: stage.color }}
            >
              {stage.name}
            </Badge>
          );
        },
      },
      {
        id: "dueDate",
        accessorFn: (row) => row.dueDate ?? Number.MAX_SAFE_INTEGER,
        header: "Due",
        enableGlobalFilter: false,
        // Soonest first, for the same reason as stage.
        sortDescFirst: false,
        cell: ({ row }) =>
          row.original.dueDate === null ? (
            <span className="zen-text-zen-muted-fg">—</span>
          ) : (
            dueDateFormat.format(row.original.dueDate)
          ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <TaskRowMenu
            title={row.original.title}
            actions={rowActions(row.original.id, {
              onAddSubtask,
              onMoveTask,
              onIndentTask,
              onOutdentTask,
              onDeleteTask,
            })}
          />
        ),
      },
    ],
    [
      onAddSubtask,
      onDeleteTask,
      onIndentTask,
      onMoveTask,
      onOutdentTask,
      onRenameTask,
      stageById,
      userById,
    ],
  );

  if (!loading && tasks.length === 0) {
    return (
      <EmptyState bordered>
        <EmptyStateTitle>Nothing here yet</EmptyStateTitle>
        <EmptyStateDescription>
          Add your first task and it will show up right here.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  return (
    <TreeTable<TaskNode>
      data={data}
      columns={columns}
      getSubRows={(row) => (row.children.length > 0 ? row.children : undefined)}
      getRowId={(row) => row.id}
      hierarchyColumnId="title"
      expanded={filtering ? true : expanded}
      onExpandedChange={(next) => {
        if (!filtering) setExpanded(next);
      }}
      globalFilter={globalFilter}
      onGlobalFilterChange={setGlobalFilter}
      enableExpandAll
      sorting={sorting}
      onSortingChange={setSorting}
      enableSorting
      enableGlobalFilter
      globalFilterPlaceholder="Search tasks…"
      enableVirtualization
      maxBodyHeight={560}
      stickyHeader
      headerVariant="branded"
      loading={loading}
      emptyMessage="No tasks match that search."
    />
  );
}
