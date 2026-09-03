import { useEffect, useRef, useState } from "react";

export interface TitleCellProps {
  title: string;
  onCommit: (title: string) => void;
  /** Opens the editor without a click, for a row that was just created. */
  autoEdit?: boolean;
  /**
   * Fires as soon as an `autoEdit` has been picked up, so the caller can drop
   * it. Without that, virtualization remounting the row later would reopen the
   * editor on a row the user had moved on from.
   */
  onAutoEditConsumed?: () => void;
}

/**
 * Click to edit in place. Enter or blur commits, Escape reverts. An empty or
 * whitespace-only title is treated as a cancel, since a blank row is
 * unrecoverable from the grid alone.
 */
export function TitleCell({ title, onCommit, autoEdit = false, onAutoEditConsumed }: TitleCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [wasAutoEdit, setWasAutoEdit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opened during render rather than from an effect. An effect runs after the
  // commit, so the row would paint once as plain text and then swap to an
  // input; React re-renders a render-phase adjustment before painting at all.
  if (autoEdit !== wasAutoEdit) {
    setWasAutoEdit(autoEdit);
    if (autoEdit) {
      setDraft(title);
      setEditing(true);
    }
  }

  // Reported once the signal has been acted on, so the owner can drop it:
  // otherwise virtualization remounting this row would reopen an editor the
  // user had moved on from.
  useEffect(() => {
    if (autoEdit) onAutoEditConsumed?.();
  }, [autoEdit, onAutoEditConsumed]);

  useEffect(() => {
    if (!editing) return;
    // focus before select: select() alone leaves the caret in an input the
    // keyboard is not pointed at, so the first keystroke goes nowhere.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === "" || next === title) {
      setDraft(title);
      return;
    }
    onCommit(next);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="zen-cursor-text zen-border-0 zen-bg-transparent zen-p-0 zen-text-start zen-text-inherit"
        onClick={(e) => {
          // The row is clickable too; editing a title is not selecting a row.
          e.stopPropagation();
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      aria-label={`Rename ${title}`}
      className="zen-w-full zen-rounded-zen-sm zen-border zen-border-zen-primary zen-bg-zen-bg zen-px-1 zen-text-inherit"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
    />
  );
}
