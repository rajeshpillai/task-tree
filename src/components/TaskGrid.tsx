import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ColumnDef, ExpandedState, SortingState } from "@tanstack/react-table";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  NativeSelect,
  TreeTable,
} from "@algorisys/zen-ui-react";
import { PRIORITIES, type Priority, type Stage, type Task, type User } from "../db/schema";
import { ancestorIds, buildTree, type TaskNode } from "../lib/tree";
import { SubtaskCount } from "./SubtaskCount";
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
  onSetPriority: (id: string, priority: Priority) => void;
  /**
   * A task that was just created. The grid opens whatever is hiding it and
   * puts its title straight into edit mode.
   */
  newTaskId?: string | null;
  /** Fires once `newTaskId` has been acted on, so the caller can drop it. */
  onNewTaskRevealed?: () => void;
  loading?: boolean;
}

const dueDateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

/** Rank of each priority, most urgent first, for the column's sort. */
const priorityRank = new Map(PRIORITIES.map((p, i) => [p.id, i]));

/**
 * How a priority is coded in its cell: a wash of its colour plus a boundary in
 * the colour itself. The label is never recoloured — it carries the meaning in
 * words, so the colour is a second signal rather than the only one.
 *
 * The colour is a per-theme token, not a literal, because one hue cannot serve
 * both grounds — see index.css.
 *
 * The wash is mixed against the theme's own background rather than left
 * translucent, and that is not cosmetic. A `<select>` hands its
 * background-color to the OS-drawn option list, and the popup composites a
 * translucent colour over a light canvas rather than over the page: in dark
 * mode a 16% amber came out cream there while the option text stayed the dark
 * theme's near-white, which is unreadable. Mixed opaquely, the colour the
 * popup inherits is dark in dark mode and light in light mode, so it always
 * agrees with the text on top of it.
 *
 * backgroundColor, not background: the chevron is a background-image on this
 * control and the shorthand would erase it.
 */
function priorityStyle(priority: Priority): CSSProperties {
  const color = `var(--priority-${priority})`;
  return {
    backgroundColor: `color-mix(in srgb, ${color} 16%, var(--zen-color-background))`,
    borderColor: color,
  };
}

/**
 * Which row should open its title editor on its own, carried by context
 * rather than by a column prop on purpose.
 *
 * TanStack renders a `cell` renderer *as a component*, so rebuilding the
 * column definitions hands React a new component type and remounts every cell
 * in the grid. A cell that owns state — the title editor does — loses it. So
 * the columns memo must not depend on anything that changes while a row is
 * being edited, and this signal reaches the cell around it.
 */
const AutoEditContext = createContext<{ id: string | null; consume: () => void }>({
  id: null,
  consume: () => {},
});

function AutoEditTitleCell({
  id,
  title,
  onCommit,
}: {
  id: string;
  title: string;
  onCommit: (title: string) => void;
}) {
  const autoEdit = useContext(AutoEditContext);
  return (
    <TitleCell
      title={title}
      onCommit={onCommit}
      autoEdit={id === autoEdit.id}
      onAutoEditConsumed={autoEdit.consume}
    />
  );
}

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
  onSetPriority,
  newTaskId,
  onNewTaskRevealed,
  loading,
}: TaskGridProps) {
  // Owned here rather than left to TreeTable, so a sort or a filter cannot
  // collapse rows the user opened.
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  // Filtering keeps a match's ancestors on screen but does not open them, so
  // a search would show the parent and hide the row that actually matched.
  // Everything opens while a search is active; the user's own expansion is
  // held aside and comes back when they clear it.
  const filtering = globalFilter.trim() !== "";

  // A new subtask lands as the last child of a row that may well be collapsed,
  // and an active search can hide it outright, so adding one looked like it did
  // nothing at all. Open its ancestors, drop the search, and hand it the caret:
  // the point of adding a task is to name it.
  //
  // Adjusted during render, not from an effect, so the row is never committed
  // in the state the user was not meant to see. `revealedId` is what makes it
  // a one-shot; the id itself stays put until the owner drops it.
  // The task can also reach `tasks` a render after its id arrives here.
  if (newTaskId && newTaskId !== revealedId && tasks.some((t) => t.id === newTaskId)) {
    const ancestors = ancestorIds(tasks, newTaskId);
    setRevealedId(newTaskId);
    setGlobalFilter("");
    setExpanded((prev) =>
      prev === true
        ? true
        : { ...prev, ...Object.fromEntries(ancestors.map((id) => [id, true])) },
    );
    setEditingId(newTaskId);
  }

  useEffect(() => {
    if (newTaskId && newTaskId === revealedId) onNewTaskRevealed?.();
  }, [newTaskId, onNewTaskRevealed, revealedId]);

  const autoEdit = useMemo(
    () => ({ id: editingId, consume: () => setEditingId(null) }),
    [editingId],
  );

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
          <span className="zen-inline-flex zen-items-center zen-gap-2">
            <AutoEditTitleCell
              id={row.original.id}
              title={row.original.title}
              onCommit={(next) => onRenameTask(row.original.id, next)}
            />
            <SubtaskCount node={row.original} />
          </span>
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
        cell: ({ row }) => {
          const stage = stageById.get(row.original.stageId);
          return (
            <span className="zen-inline-flex zen-items-center zen-gap-2">
              {/*
                The stage colour is a swatch, never the text colour. These are
                badge colours picked against a tinted chip, and as text on the
                page they land at about 4:1 in both themes, under the 4.5 that
                body text needs.
              */}
              <span
                aria-hidden="true"
                style={{ background: stage?.color ?? "transparent" }}
                className="zen-inline-block zen-h-2 zen-w-2 zen-shrink-0 zen-rounded-zen-full"
              />
              <NativeSelect
                aria-label={`Stage for ${row.original.title}`}
                value={stage ? row.original.stageId : ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onSetStage(row.original.id, e.target.value)}
              >
                {/* A task whose stage was removed still has to render something. */}
                {!stage && <option value="">No stage</option>}
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </span>
          );
        },
      },
      {
        id: "priority",
        // The scale's own order, so the first click sorts High to the top
        // rather than sorting the three labels alphabetically.
        accessorFn: (row) => priorityRank.get(row.priority) ?? PRIORITIES.length,
        header: "Priority",
        enableGlobalFilter: false,
        sortDescFirst: false,
        cell: ({ row }) => {
          const priority = PRIORITIES.find((p) => p.id === row.original.priority);
          return (
            <NativeSelect
              aria-label={`Priority for ${row.original.title}`}
              value={priority ? row.original.priority : ""}
              style={priority ? priorityStyle(priority.id) : undefined}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onSetPriority(row.original.id, e.target.value as Priority)}
            >
              {/* A task stored before priorities existed, if a backfill was missed. */}
              {!priority && <option value="">Unset</option>}
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
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
      onAssign,
      onDeleteTask,
      onIndentTask,
      onMoveTask,
      onOutdentTask,
      onRenameTask,
      onSetPriority,
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
    <AutoEditContext.Provider value={autoEdit}>
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
    </AutoEditContext.Provider>
  );
}
