import { useState } from "react";
import { Button, Input, Label } from "@algorisys/zen-ui-react";
import type { Stage } from "../db/schema";
import type { StageDeleteResult } from "../state/useProjectData";

export interface StageEditorProps {
  stages: readonly Stage[];
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onAdd: (name: string, color: string) => void;
  onDelete: (id: string) => Promise<StageDeleteResult>;
}

const NEW_STAGE_COLOR = "#8b5cf6";

export function StageEditor({ stages, onRename, onRecolor, onAdd, onDelete }: StageEditorProps) {
  const [newName, setNewName] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  async function remove(stage: Stage) {
    const result = await onDelete(stage.id);
    if (result.ok) {
      setBlocked(null);
      return;
    }
    setBlocked(
      result.reason === "in-use"
        ? `${stage.name} still has ${result.count} ${result.count === 1 ? "task" : "tasks"}. Move them first.`
        : `${stage.name} is the last stage, so it cannot be removed.`,
    );
  }

  function add() {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    onAdd(trimmed, NEW_STAGE_COLOR);
    setNewName("");
  }

  return (
    <section className="zen-flex zen-flex-col zen-gap-3" aria-label="Stages">
      <h2 className="zen-text-sm zen-font-semibold">Stages</h2>

      <ul className="zen-flex zen-flex-col zen-gap-2">
        {stages.map((stage) => (
          <li key={stage.id} className="zen-flex zen-items-center zen-gap-2">
            <input
              type="color"
              aria-label={`Colour for ${stage.name}`}
              value={stage.color}
              onChange={(e) => onRecolor(stage.id, e.target.value)}
              className="zen-h-8 zen-w-8 zen-cursor-pointer zen-rounded-zen-sm zen-border-0 zen-bg-transparent zen-p-0"
            />
            <Input
              aria-label={`Rename ${stage.name}`}
              defaultValue={stage.name}
              onBlur={(e) => onRename(stage.id, e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => void remove(stage)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {blocked && <p role="alert">{blocked}</p>}

      <div className="zen-flex zen-items-end zen-gap-2">
        <div className="zen-flex zen-flex-col zen-gap-1">
          <Label htmlFor="new-stage-name">New stage</Label>
          <Input
            id="new-stage-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <Button onClick={add}>Add stage</Button>
      </div>
    </section>
  );
}
