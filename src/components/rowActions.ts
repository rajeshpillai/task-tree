export interface RowActionHandlers {
  onAddSubtask: (id: string) => void;
  onMoveTask: (id: string, delta: number) => void;
  onIndentTask: (id: string) => void;
  onOutdentTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

export interface RowAction {
  label: string;
  /** True when a separator belongs above this item. */
  startsGroup?: boolean;
  run: () => void;
}

/**
 * The row menu's contents as plain data, bound to one task. Kept out of the
 * component so the binding is testable without opening a Radix menu, which
 * jsdom drives through Pointer Events it does not implement.
 */
export function rowActions(id: string, handlers: RowActionHandlers): RowAction[] {
  return [
    { label: "Add subtask", run: () => handlers.onAddSubtask(id) },
    { label: "Move up", startsGroup: true, run: () => handlers.onMoveTask(id, -1) },
    { label: "Move down", run: () => handlers.onMoveTask(id, 1) },
    { label: "Indent", run: () => handlers.onIndentTask(id) },
    { label: "Outdent", run: () => handlers.onOutdentTask(id) },
    { label: "Delete", startsGroup: true, run: () => handlers.onDeleteTask(id) },
  ];
}
