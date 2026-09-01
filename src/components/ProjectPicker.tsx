import { useState } from "react";
import { Button, Input, Label, NativeSelect } from "@algorisys/zen-ui-react";
import type { Project } from "../db/schema";

export interface ProjectPickerProps {
  projects: readonly Project[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function ProjectPicker({ projects, currentId, onSelect, onCreate }: ProjectPickerProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onCreate(trimmed);
    setName("");
    setCreating(false);
  }

  return (
    <div className="zen-flex zen-items-end zen-gap-2">
      <div className="zen-flex zen-flex-col zen-gap-1">
        <Label htmlFor="project-picker">Project</Label>
        <NativeSelect
          id="project-picker"
          value={currentId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {creating ? (
        <>
          <div className="zen-flex zen-flex-col zen-gap-1">
            <Label htmlFor="new-project-name">New project name</Label>
            <Input
              id="new-project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setName("");
                  setCreating(false);
                }
              }}
            />
          </div>
          <Button onClick={submit}>Create</Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)}>
          New project
        </Button>
      )}
    </div>
  );
}
