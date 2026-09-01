import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom does no layout: every element reports a zero-sized box and there is no
 * ResizeObserver. A virtualizer asks the scroll container how tall it is, gets
 * 0, computes an empty window and renders no rows at all, so a virtualized
 * grid looks empty to every assertion. Giving elements a real box lets the
 * components under test run in the same configuration they ship in, rather
 * than turning virtualization off just for tests.
 */
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1000;

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

for (const [prop, value] of [
  ["clientHeight", VIEWPORT_HEIGHT],
  ["clientWidth", VIEWPORT_WIDTH],
  ["offsetHeight", 44],
  ["offsetWidth", VIEWPORT_WIDTH],
] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
}

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
  const height = this.tagName === "TR" ? 44 : VIEWPORT_HEIGHT;
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: VIEWPORT_WIDTH,
    bottom: height,
    width: VIEWPORT_WIDTH,
    height,
    toJSON: () => ({}),
  } as DOMRect;
};

/**
 * Radix primitives (the dropdown menu, select, dialog) drive their open state
 * through Pointer Events and scroll the focused item into view. jsdom
 * implements none of these, and the failure is a hang rather than an error:
 * the menu never opens and the query waits until the test times out.
 */
for (const method of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      value: method === "hasPointerCapture" ? () => false : () => {},
    });
  }
}

if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
}

afterEach(() => {
  cleanup();
});
