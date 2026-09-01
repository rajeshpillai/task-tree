import { useMemo, useState } from "react";
import type { ColumnDef, ExpandedState, SortingState } from "@tanstack/react-table";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  NativeSelect,
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
  onAssign: (id: string, assigneeId: string | null) => void;
  onSetStage: (id: string, stageId: string) => void;
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
  onAssign,
  onSetStage,
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
        cell: ({ row }) => (
          <NativeSelect
            aria-label={`Assignee for ${row.original.title}`}
            value={row.original.assigneeId ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onAssign(row.original.id, e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        ),
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
        cell: ({ row }) => (
          <NativeSelect
            aria-label={`Stage for ${row.original.title}`}
            value={stageById.has(row.original.stageId) ? row.original.stageId : ""}
            style={{ color: stageById.get(row.original.stageId)?.color }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSetStage(row.original.id, e.target.value)}
          >
            {/* A task whose stage was removed still has to render something. */}
            {!stageById.has(row.original.stageId) && <option value="">No stage</option>}
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        ),
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
      onAssign,
      onDeleteTask,
      onIndentTask,
      onMoveTask,
      onOutdentTask,
      onRenameTask,
      onSetStage,
      stageById,
      stages,
      userById,
      users,
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
