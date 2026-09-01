import { useEffect, useRef, useState } from "react";

export interface TitleCellProps {
  title: string;
  onCommit: (title: string) => void;
}

/**
 * Click to edit in place. Enter or blur commits, Escape reverts. An empty or
 * whitespace-only title is treated as a cancel, since a blank row is
 * unrecoverable from the grid alone.
 */
export function TitleCell({ title, onCommit }: TitleCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
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
