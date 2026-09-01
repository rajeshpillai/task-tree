import { Fragment } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@algorisys/zen-ui-react";
import type { RowAction } from "./rowActions";

export interface TaskRowMenuProps {
  title: string;
  actions: readonly RowAction[];
}

export function TaskRowMenu({ title, actions }: TaskRowMenuProps) {
  return (
    // Not modal: a modal menu locks body scroll and installs a focus trap,
    // which inside a virtualized, scrolling grid means opening a row menu
    // freezes the table underneath it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Actions for ${title}`}
          onClick={(e) => e.stopPropagation()}
        >
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <Fragment key={action.label}>
            {action.startsGroup && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={action.run}>{action.label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
