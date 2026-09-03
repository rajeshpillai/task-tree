import type { CSSProperties } from "react";
import { flattenTree, type TaskNode } from "../lib/tree";
import { subtaskLabel } from "./subtaskLabel";

export interface SubtaskCountProps {
  node: TaskNode;
}

/**
 * How strong the badge's wash is, as a percentage, for a subtree of `total`
 * tasks — and the whole point of the colour treatment.
 *
 * Three steps rather than a continuum. A ramp of one percent per task is
 * unreadable: nobody can tell an 18% chip from a 21% one, so the extra
 * precision buys nothing and only makes the contrast unbounded. Three steps
 * are far enough apart to be told apart at a glance, and they answer the
 * question anyone actually asks of a collapsed row: is there a little under
 * here, a fair amount, or a lot.
 *
 * `total` is the whole subtree, not the direct children, because that is the
 * size the badge is claiming to describe. The visible number stays the direct
 * children, since that is what expanding the row reveals.
 *
 * The heaviest step is the worst case for contrast in both themes, so it is
 * the one that was measured — see index.css.
 */
function washStrength(total: number): number {
  if (total <= 2) return 12;
  if (total <= 6) return 22;
  return 32;
}

/**
 * How the badge is coloured: a wash of teal, a boundary in a darker teal, and
 * the glyph and the number in that same darker teal.
 *
 * The ink is constant and only the wash deepens, so the size of the subtree
 * reads as weight on the page while the number itself stays equally legible
 * at every step. Recolouring the number instead would have traded legibility
 * for the signal.
 *
 * The colours are per-theme tokens, not literals — one teal cannot serve a
 * white page and a near-black one, see index.css.
 *
 * The wash is mixed opaquely against the theme's background rather than left
 * translucent. Grid rows have their own hover background, and a translucent
 * wash would composite over whatever happened to be under it, so the number
 * would not be read at the contrast it was measured at. Mixed opaquely, the
 * chip is the same chip on a hovered row as on a plain one.
 */
function badgeStyle(total: number): CSSProperties {
  return {
    color: "var(--subtree-ink)",
    borderColor: "var(--subtree-ink)",
    background: `color-mix(in srgb, var(--subtree-wash) ${washStrength(total)}%, var(--zen-color-background))`,
  };
}

/**
 * A count of what is nested under a row, shown in the title cell.
 *
 * A collapsed row otherwise gives no hint of how much is hiding under it: the
 * chevron says there is something, never whether it is one task or thirty.
 *
 * `role="img"` with the label on the wrapper, so the badge is announced as
 * "3 subtasks" rather than as a bare "3" with a decorative glyph beside it.
 * The colour is never the only signal: the count is there as text, and the
 * label spells out the subtree size that the wash is shading for.
 */
export function SubtaskCount({ node }: SubtaskCountProps) {
  const direct = node.children.length;
  if (direct === 0) return null;

  const total = flattenTree(node.children).length;
  const label = subtaskLabel(direct, total);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-wash={washStrength(total)}
      style={badgeStyle(total)}
      className="zen-inline-flex zen-shrink-0 zen-items-center zen-gap-1 zen-rounded-zen-full zen-border zen-px-1 zen-text-xs zen-leading-none"
    >
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        {/* A stem with two branches: the shape of what is nested below. */}
        <path d="M3.25 1.5v6.75" />
        <path d="M3.25 4.5h5" />
        <path d="M3.25 8.25h5" />
      </svg>
      <span className="zen-tabular-nums">{direct}</span>
    </span>
  );
}
