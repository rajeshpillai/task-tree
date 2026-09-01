import { useState } from "react";
import { Button, Input, Label } from "@algorisys/zen-ui-react";
import type { User } from "../db/schema";

export interface UserEditorProps {
  users: readonly User[];
  onAdd: (name: string, color: string) => void;
}

/** Cycled so two people added in a row do not look the same. */
const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#f43f5e"];

export function UserEditor({ users, onAdd }: UserEditorProps) {
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onAdd(trimmed, COLORS[users.length % COLORS.length]);
    setName("");
  }

  return (
    <section className="zen-flex zen-flex-col zen-gap-3" aria-label="People">
      <h2 className="zen-text-sm zen-font-semibold">People</h2>

      <ul className="zen-flex zen-flex-wrap zen-gap-2">
        {users.map((user) => (
          <li key={user.id} className="zen-inline-flex zen-items-center zen-gap-2">
            <span
              aria-hidden="true"
              style={{ background: user.color }}
              className="zen-inline-block zen-h-2 zen-w-2 zen-rounded-zen-full"
            />
            {user.name}
          </li>
        ))}
      </ul>

      <div className="zen-flex zen-items-end zen-gap-2">
        <div className="zen-flex zen-flex-col zen-gap-1">
          <Label htmlFor="new-person-name">Add someone</Label>
          <Input
            id="new-person-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>Add</Button>
      </div>
    </section>
  );
}
