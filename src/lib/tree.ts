import type { Task } from "../db/schema";

export interface TaskNode extends Task {
  children: TaskNode[];
}

export interface OrderChange {
  id: string;
  order: number;
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt - b.createdAt;

function sortDeep(nodes: TaskNode[]): void {
  nodes.sort(byOrder);
  for (const node of nodes) sortDeep(node.children);
}

/**
 * Nests a flat task list. Siblings come back in `order`, and nothing is ever
 * dropped: a task whose parent is missing surfaces at the root, and a task
 * caught in a parent cycle is detached and promoted rather than left
 * unreachable.
 */
export function buildTree(tasks: readonly Task[]): TaskNode[] {
  const nodes = new Map<string, TaskNode>();
  for (const task of tasks) nodes.set(task.id, { ...task, children: [] });

  const roots: TaskNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    // Root, or an orphan whose parent is not in this list. Either way it has
    // to be visible.
    else roots.push(node);
  }

  const seen = new Set<string>();
  const mark = (list: readonly TaskNode[]): void => {
    for (const node of list) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      mark(node.children);
    }
  };
  mark(roots);

  // Anything still unseen is attached to a parent but unreachable from any
  // root, which only happens in a cycle. Break it at the first member found.
  for (const node of nodes.values()) {
    if (seen.has(node.id)) continue;
    // A root-parented node always lands in `roots` above and so is always
    // seen; anything still here has a parent.
    const parent = nodes.get(node.parentId!);
    if (parent) parent.children = parent.children.filter((c) => c.id !== node.id);
    node.parentId = null;
    roots.push(node);
    seen.add(node.id);
    mark(node.children);
  }

  sortDeep(roots);
  return roots;
}

/** Depth-first, parents before their own children. */
export function flattenTree(nodes: readonly TaskNode[]): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (list: readonly TaskNode[]): void => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Every id in the subtree rooted at `rootId`, including `rootId` itself. */
export function subtreeIds(tasks: readonly Task[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    const siblings = childrenOf.get(task.parentId);
    if (siblings) siblings.push(task.id);
    else childrenOf.set(task.parentId, [task.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** Whether `candidateId` sits anywhere under `ancestorId`. Cycle-safe. */
export function isDescendant(
  tasks: readonly Task[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const parentOf = new Map(tasks.map((t) => [t.id, t.parentId]));
  const seen = new Set<string>();
  let current = parentOf.get(candidateId) ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/**
 * A task cannot become its own parent, nor be moved under one of its own
 * descendants, since either detaches the subtree from the tree entirely.
 */
export function canReparent(
  tasks: readonly Task[],
  taskId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return true;
  if (newParentId === taskId) return false;
  return !isDescendant(tasks, taskId, newParentId);
}

/** The order value that sits between two neighbours. */
export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * The order writes needed to move `movedId` to `toIndex` among its siblings.
 * Normally one row changes. Floats run out of room after roughly fifty splits
 * of the same gap, and a collapsed midpoint would leave two rows sharing an
 * order and jumping around; when that happens the whole sibling list is
 * renumbered instead.
 */
export function reorderSiblings(
  siblings: readonly Task[],
  movedId: string,
  toIndex: number,
): OrderChange[] {
  const ordered = [...siblings].sort(byOrder);
  const moved = ordered.find((t) => t.id === movedId);
  if (!moved) return [];

  const without = ordered.filter((t) => t.id !== movedId);
  const index = Math.max(0, Math.min(toIndex, without.length));
  const before = index > 0 ? without[index - 1].order : null;
  const after = index < without.length ? without[index].order : null;
  const next = midpoint(before, after);

  const collapsed = (before !== null && next <= before) || (after !== null && next >= after);
  if (!collapsed) return [{ id: movedId, order: next }];

  const settled = [...without.slice(0, index), moved, ...without.slice(index)];
  return settled.map((task, i) => ({ id: task.id, order: i }));
}
