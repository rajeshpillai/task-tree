import { describe, expect, it } from "vitest";
import { subtaskLabel } from "./subtaskLabel";

describe("subtaskLabel", () => {
  it("says nothing about a total that repeats the visible number", () => {
    expect(subtaskLabel(3, 3)).toBe("3 subtasks");
  });

  it("adds the total once the subtree runs deeper than one level", () => {
    expect(subtaskLabel(2, 7)).toBe("2 subtasks, 7 in total");
  });

  it("is singular for one child", () => {
    expect(subtaskLabel(1, 1)).toBe("1 subtask");
  });

  it("stays singular in the head when one child has its own children", () => {
    expect(subtaskLabel(1, 4)).toBe("1 subtask, 4 in total");
  });
});
