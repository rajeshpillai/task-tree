import { DEFAULT_STAGES, newId, type Task, type User } from "./schema";

interface SampleTask {
  title: string;
  stage: number;
  assignee?: number;
  /** Days from today. Negative is overdue. */
  due?: number;
  notes?: string;
  children?: SampleTask[];
}

const SAMPLE_USERS: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Rajesh", color: "#6366f1" },
  { name: "Priya", color: "#ec4899" },
  { name: "Sam", color: "#f59e0b" },
];

const SAMPLE_TASKS: readonly SampleTask[] = [
  {
    title: "Launch the new landing page",
    stage: 1,
    assignee: 0,
    due: 6,
    children: [
      {
        title: "Write the copy",
        stage: 2,
        assignee: 1,
        due: -2,
        children: [
          { title: "Headline and subhead", stage: 2, assignee: 1 },
          { title: "Pricing section", stage: 1, assignee: 1, due: 1 },
        ],
      },
      { title: "Design the hero", stage: 1, assignee: 2, due: 3 },
      { title: "Wire up the signup form", stage: 0, assignee: 0, due: 5 },
      { title: "Set up analytics", stage: 0, due: 8 },
    ],
  },
  {
    title: "Ship the mobile app update",
    stage: 1,
    assignee: 2,
    due: 14,
    children: [
      { title: "Fix the crash on cold start", stage: 1, assignee: 2, due: 2 },
      { title: "Dark mode polish", stage: 0, assignee: 1, due: 10 },
      {
        title: "App store submission",
        stage: 0,
        due: 13,
        children: [
          { title: "Screenshots for every device size", stage: 0, assignee: 0 },
          { title: "Write the release notes", stage: 0 },
        ],
      },
    ],
  },
  {
    title: "Quarterly planning",
    stage: 2,
    assignee: 0,
    due: -9,
    children: [
      { title: "Collect team input", stage: 2, assignee: 1 },
      { title: "Draft the roadmap", stage: 2, assignee: 0 },
    ],
  },
  {
    title: "Fix the flaky checkout test",
    stage: 0,
    assignee: 1,
    due: 4,
    notes: "Fails about one run in five, always on the payment step.",
  },
  { title: "Renew the SSL certificate", stage: 0, due: 21 },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sample content for a first run, so the grid opens with something to look at
 * rather than an empty state. Written into the same upgrade transaction as the
 * default project, so a first run is one atomic write.
 */
export function sampleData(
  projectId: string,
  stageIds: readonly string[],
): { users: User[]; tasks: Task[] } {
  const now = Date.now();
  const users: User[] = SAMPLE_USERS.map((u) => ({ id: newId(), name: u.name, color: u.color }));
  const tasks: Task[] = [];

  const walk = (list: readonly SampleTask[], parentId: string | null): void => {
    list.forEach((item, index) => {
      const id = newId();
      tasks.push({
        id,
        projectId,
        parentId,
        title: item.title,
        notes: item.notes ?? "",
        assigneeId: item.assignee === undefined ? null : users[item.assignee].id,
        stageId: stageIds[item.stage],
        order: index,
        dueDate: item.due === undefined ? null : now + item.due * DAY,
        createdAt: now,
        updatedAt: now,
      });
      if (item.children) walk(item.children, id);
    });
  };
  walk(SAMPLE_TASKS, null);

  return { users, tasks };
}

/** Guards the sample against a stage index that does not exist. */
export const SAMPLE_STAGE_COUNT = DEFAULT_STAGES.length;
