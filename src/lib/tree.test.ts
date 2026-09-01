import { describe, expect, it } from "vitest";
import type { Task } from "../db/schema";
import {
  buildTree,
  canReparent,
  flattenTree,
  isDescendant,
  midpoint,
  reorderSiblings,
  subtreeIds,
  type TaskNode,
} from "./tree";

let clock = 0;

function task(id: string, parentId: string | null, order = 0): Task {
  clock += 1;
  return {
    id,
    projectId: "p1",
    parentId,
    title: id,
    notes: "",
    assigneeId: null,
    stageId: "s1",
    order,
    dueDate: null,
    createdAt: clock,
    updatedAt: clock,
  };
}

const ids = (nodes: readonly TaskNode[]) => nodes.map((n) => n.id);

describe("buildTree", () => {
  it("returns an empty array for an empty list", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests children under their parents", () => {
    const tree = buildTree([task("a", null), task("a1", "a"), task("a2", "a"), task("b", null, 1)]);

    expect(ids(tree)).toEqual(["a", "b"]);
    expect(ids(tree[0].children)).toEqual(["a1", "a2"]);
    expect(tree[1].children).toEqual([]);
  });

  it("nests to arbitrary depth", () => {
    const tree = buildTree([
      task("a", null),
      task("a1", "a"),
      task("a1i", "a1"),
      task("a1i1", "a1i"),
    ]);

    expect(ids(tree)).toEqual(["a"]);
    expect(ids(tree[0].children[0].children[0].children)).toEqual(["a1i1"]);
  });

  it("nests children listed before their parents", () => {
    // Store order is not insertion order, so a child can arrive first.
    const tree = buildTree([task("a1", "a"), task("a", null)]);

    expect(ids(tree)).toEqual(["a"]);
    expect(ids(tree[0].children)).toEqual(["a1"]);
  });

  it("surfaces an orphan at the root rather than dropping it", () => {
    const tree = buildTree([task("a", null), task("lost", "deleted-parent", 1)]);

    expect(ids(tree)).toEqual(["a", "lost"]);
  });

  it("sorts siblings by order at every level", () => {
    const tree = buildTree([
      task("b", null, 2),
      task("a", null, 1),
      task("a2", "a", 2),
      task("a1", "a", 1),
    ]);

    expect(ids(tree)).toEqual(["a", "b"]);
    expect(ids(tree[0].children)).toEqual(["a1", "a2"]);
  });

  it("breaks ties on createdAt so equal orders do not jump around", () => {
    const first = task("first", null, 5);
    const second = task("second", null, 5);

    expect(ids(buildTree([second, first]))).toEqual(["first", "second"]);
  });

  it("promotes a cycle to the root instead of losing it", () => {
    // a -> b -> a. Neither is reachable from any root.
    const tree = buildTree([task("a", "b"), task("b", "a")]);

    expect(flattenTree(tree).map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps a healthy tree intact alongside a cycle", () => {
    const tree = buildTree([task("ok", null), task("a", "b", 1), task("b", "a", 2)]);

    expect(flattenTree(tree)).toHaveLength(3);
    expect(ids(tree)).toContain("ok");
  });

  it("does not mutate the input tasks", () => {
    const input = [task("a", null), task("a1", "a")];
    const snapshot = structuredClone(input);
    buildTree(input);

    expect(input).toEqual(snapshot);
  });
});

describe("flattenTree", () => {
  it("returns depth-first with parents before their children", () => {
    const tree = buildTree([
      task("a", null),
      task("a1", "a"),
      task("a1i", "a1"),
      task("b", null, 1),
    ]);

    expect(flattenTree(tree).map((n) => n.id)).toEqual(["a", "a1", "a1i", "b"]);
  });

  it("returns an empty array for an empty tree", () => {
    expect(flattenTree([])).toEqual([]);
  });
});

describe("subtreeIds", () => {
  const tasks = [
    task("a", null),
    task("a1", "a"),
    task("a1i", "a1"),
    task("a2", "a"),
    task("b", null),
  ];

  it("includes the root and every descendant", () => {
    expect(subtreeIds(tasks, "a").sort()).toEqual(["a", "a1", "a1i", "a2"]);
  });

  it("returns just the id for a leaf", () => {
    expect(subtreeIds(tasks, "b")).toEqual(["b"]);
  });

  it("returns just the id for one that is not present", () => {
    expect(subtreeIds(tasks, "ghost")).toEqual(["ghost"]);
  });

  it("terminates on a cycle", () => {
    expect(subtreeIds([task("a", "b"), task("b", "a")], "a").sort()).toEqual(["a", "b"]);
  });
});

describe("isDescendant", () => {
  const tasks = [task("a", null), task("a1", "a"), task("a1i", "a1"), task("b", null)];

  it("finds a direct child", () => {
    expect(isDescendant(tasks, "a", "a1")).toBe(true);
  });

  it("finds a grandchild", () => {
    expect(isDescendant(tasks, "a", "a1i")).toBe(true);
  });

  it("is false for a sibling", () => {
    expect(isDescendant(tasks, "a", "b")).toBe(false);
  });

  it("is false for a task against itself", () => {
    expect(isDescendant(tasks, "a", "a")).toBe(false);
  });

  it("is false upward, since a parent is not its child's descendant", () => {
    expect(isDescendant(tasks, "a1", "a")).toBe(false);
  });

  it("terminates on a cycle rather than looping forever", () => {
    expect(isDescendant([task("a", "b"), task("b", "a")], "ghost", "a")).toBe(false);
  });

  it("stops at a parent that is not in the list", () => {
    // The chain walks up into a deleted task and has to end there.
    expect(isDescendant([task("orphan", "deleted")], "a", "orphan")).toBe(false);
  });
});

describe("canReparent", () => {
  const tasks = [task("a", null), task("a1", "a"), task("a1i", "a1"), task("b", null)];

  it("allows a move to the root", () => {
    expect(canReparent(tasks, "a1", null)).toBe(true);
  });

  it("allows a move under an unrelated task", () => {
    expect(canReparent(tasks, "a1", "b")).toBe(true);
  });

  it("rejects a task becoming its own parent", () => {
    expect(canReparent(tasks, "a", "a")).toBe(false);
  });

  it("rejects a move under a direct child", () => {
    expect(canReparent(tasks, "a", "a1")).toBe(false);
  });

  it("rejects a move under a grandchild", () => {
    expect(canReparent(tasks, "a", "a1i")).toBe(false);
  });
});

describe("midpoint", () => {
  it("is zero with no neighbours", () => {
    expect(midpoint(null, null)).toBe(0);
  });

  it("goes below when there is only a follower", () => {
    expect(midpoint(null, 5)).toBe(4);
  });

  it("goes above when there is only a predecessor", () => {
    expect(midpoint(5, null)).toBe(6);
  });

  it("splits the gap between two neighbours", () => {
    expect(midpoint(1, 2)).toBe(1.5);
  });

  it("handles negative and fractional neighbours", () => {
    expect(midpoint(-2, -1)).toBe(-1.5);
    expect(midpoint(1.25, 1.5)).toBe(1.375);
  });
});

describe("reorderSiblings", () => {
  const siblings = [task("x", null, 1), task("y", null, 2), task("z", null, 3)];

  it("writes one midpoint row and touches nothing else", () => {
    expect(reorderSiblings(siblings, "z", 1)).toEqual([{ id: "z", order: 1.5 }]);
  });

  it("moves a row to the front", () => {
    expect(reorderSiblings(siblings, "z", 0)).toEqual([{ id: "z", order: 0 }]);
  });

  it("moves a row to the end", () => {
    expect(reorderSiblings(siblings, "x", 2)).toEqual([{ id: "x", order: 4 }]);
  });

  it("clamps an index past the end", () => {
    expect(reorderSiblings(siblings, "x", 99)).toEqual([{ id: "x", order: 4 }]);
  });

  it("clamps a negative index", () => {
    expect(reorderSiblings(siblings, "z", -5)).toEqual([{ id: "z", order: 0 }]);
  });

  it("returns nothing for an id that is not among the siblings", () => {
    expect(reorderSiblings(siblings, "ghost", 0)).toEqual([]);
  });

  it("renumbers every sibling once the float gap collapses", () => {
    // Number.EPSILON is exactly one ULP above 1, so the two neighbours have
    // no representable midpoint between them.
    const tight = [task("a", null, 1), task("b", null, 1 + Number.EPSILON), task("c", null, 9)];
    const changes = reorderSiblings(tight, "c", 1);

    expect(changes).toEqual([
      { id: "a", order: 0 },
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("keeps rows distinct after fifty repeated splits of the same gap", () => {
    let rows = [task("a", null, 0), task("b", null, 1), task("mover", null, 2)];
    for (let i = 0; i < 50; i += 1) {
      const changes = reorderSiblings(rows, "mover", 1);
      rows = rows.map((r) => {
        const hit = changes.find((c) => c.id === r.id);
        return hit ? { ...r, order: hit.order } : r;
      });
    }
    const orders = rows.map((r) => r.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
