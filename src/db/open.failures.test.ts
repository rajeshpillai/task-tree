import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, request, transactionDone } from "./open";

/**
 * The failure paths cannot be provoked through fake-indexeddb, so these stub
 * the open request and fire the handlers the browser would fire.
 */
type Handlers = {
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
  onupgradeneeded?: () => void;
};

function stubOpen(): Handlers {
  const req: Handlers & { error: DOMException | null; result: unknown } = {
    error: new DOMException("boom", "UnknownError"),
    result: null,
  };
  vi.spyOn(indexedDB, "open").mockReturnValue(req as unknown as IDBOpenDBRequest);
  return req;
}

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openDb failures", () => {
  it("rejects when the open request errors", async () => {
    const req = stubOpen();
    const pending = openDb();
    req.onerror!();
    await expect(pending).rejects.toThrow("boom");
  });

  it("rejects when another tab blocks the upgrade", async () => {
    const req = stubOpen();
    const pending = openDb();
    req.onblocked!();
    await expect(pending).rejects.toThrow("another tab");
  });

  it("closeDb clears the cache after a failed open, so the next call retries", async () => {
    const req = stubOpen();
    const failed = openDb();
    req.onerror!();
    await expect(failed).rejects.toThrow();

    // Must not reject or leave the rejected promise cached.
    await expect(closeDb()).resolves.toBeUndefined();

    vi.restoreAllMocks();
    await expect(openDb()).resolves.toBeDefined();
  });
});

describe("request", () => {
  it("rejects when the underlying request errors", async () => {
    const req: Handlers & { error: DOMException } = {
      error: new DOMException("nope", "DataError"),
    };
    const pending = request(req as unknown as IDBRequest<never>);
    req.onerror!();
    await expect(pending).rejects.toThrow("nope");
  });
});

describe("transactionDone", () => {
  it("resolves when the transaction completes", async () => {
    const db = await openDb();
    const tx = db.transaction("tasks", "readwrite");
    tx.objectStore("tasks").put({
      id: "t1",
      projectId: "p1",
      parentId: null,
      title: "x",
      notes: "",
      assigneeId: null,
      stageId: "s1",
      order: 0,
      dueDate: null,
      createdAt: 0,
      updatedAt: 0,
    });
    await expect(transactionDone(tx)).resolves.toBeUndefined();
  });

  it("rejects when the transaction aborts", async () => {
    const db = await openDb();
    const tx = db.transaction("tasks", "readwrite");
    const pending = transactionDone(tx);
    tx.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
