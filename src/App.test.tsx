import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Task Tree" })).toBeInTheDocument();
  });

  it("has a working IndexedDB in the test environment", () => {
    expect(globalThis.indexedDB).toBeDefined();
  });
});
