import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskNode } from "../lib/tree";
import { SubtaskCount } from "./SubtaskCount";

/** A whole node, though the badge only ever reads `children`. */
function node(id: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    projectId: "p",
    parentId: null,
    title: id,
    notes: "",
    assigneeId: null,
    stageId: "s",
    priority: "medium",
    order: 0,
    dueDate: null,
    createdAt: 0,
    updatedAt: 0,
    children,
  };
}

/** A parent with `n` leaf children, so the subtree total is `n`. */
function flatParent(n: number): TaskNode {
  return node(
    "root",
    Array.from({ length: n }, (_, i) => node(`c${i}`)),
  );
}

/** The badge, whatever its label. */
const badge = () => screen.getByRole("img");

describe("SubtaskCount", () => {
  it("renders nothing for a leaf", () => {
    const { container } = render(<SubtaskCount node={node("a")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the direct children and labels them", () => {
    render(<SubtaskCount node={flatParent(2)} />);
    expect(screen.getByRole("img", { name: "2 subtasks" })).toHaveTextContent("2");
    expect(badge()).toHaveAttribute("title", "2 subtasks");
  });

  it("counts only direct children in the number, the whole subtree in the label", () => {
    render(<SubtaskCount node={node("a", [node("b", [node("c", [node("d")])])])} />);
    expect(badge()).toHaveTextContent("1");
    expect(badge()).toHaveAttribute("aria-label", "1 subtask, 3 in total");
  });

  describe("colour", () => {
    it("paints the ink on the border, the glyph and the number", () => {
      const { container } = render(<SubtaskCount node={flatParent(2)} />);
      expect(badge().style.color).toBe("var(--subtree-ink)");
      expect(badge().style.borderColor).toBe("var(--subtree-ink)");
      // The glyph follows the number rather than carrying its own colour.
      expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
    });

    it("mixes the wash opaquely against the page, never leaving it translucent", () => {
      // Rows have their own hover background; a translucent wash would
      // composite over that instead of over the ground it was measured on.
      render(<SubtaskCount node={flatParent(2)} />);
      expect(badge().style.background).toBe(
        "color-mix(in srgb, var(--subtree-wash) 12%, var(--zen-color-background))",
      );
    });

    it("deepens the wash in three steps as the subtree grows", () => {
      const wash = (n: number) => {
        const { unmount } = render(<SubtaskCount node={flatParent(n)} />);
        const value = badge().dataset.wash;
        unmount();
        return value;
      };
      // Boundaries, not just midpoints: the steps are 1-2, 3-6, 7 and up.
      expect([wash(1), wash(2)]).toEqual(["12", "12"]);
      expect([wash(3), wash(6)]).toEqual(["22", "22"]);
      expect([wash(7), wash(40)]).toEqual(["32", "32"]);
    });

    it("steps on the whole subtree, not on the children on show", () => {
      // One direct child, seven tasks below it: a heavy badge showing "1".
      const deep = node("a", [flatParent(6)]);
      render(<SubtaskCount node={deep} />);
      expect(badge()).toHaveTextContent("1");
      expect(badge()).toHaveAttribute("data-wash", "32");
    });

    it("holds the ink still while the wash deepens, so the number stays legible", () => {
      const { unmount } = render(<SubtaskCount node={flatParent(2)} />);
      const light = badge().style.color;
      unmount();
      render(<SubtaskCount node={flatParent(20)} />);
      expect(badge().style.color).toBe(light);
    });

    it("carries the size in words as well as in colour", () => {
      // Nothing the wash says is said only by the wash: the label spells the
      // subtree size out, and the count is there as text.
      render(<SubtaskCount node={node("a", [flatParent(6)])} />);
      expect(badge()).toHaveAttribute("aria-label", "1 subtask, 7 in total");
    });

    it("hides the glyph from the accessibility tree", () => {
      const { container } = render(<SubtaskCount node={flatParent(1)} />);
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });
  });
});
