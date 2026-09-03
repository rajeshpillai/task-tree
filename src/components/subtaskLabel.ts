/**
 * What the subtask badge is announced and titled as. The visible number is the
 * direct children, because that is what expanding the row reveals; the total is
 * worth saying only when the subtree runs deeper than one level, since
 * otherwise it repeats the same figure twice.
 *
 * Kept out of the component so it is testable on its own, and so that file
 * exports components only — the same split as rowActions and TaskRowMenu.
 */
export function subtaskLabel(direct: number, total: number): string {
  const head = direct === 1 ? "1 subtask" : `${direct} subtasks`;
  return total > direct ? `${head}, ${total} in total` : head;
}
