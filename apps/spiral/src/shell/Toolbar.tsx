import type { ReactNode } from "react";
import type { BootState } from "../boot";
import { SidebarGlyph } from "../ui/glyphs";
import { Button } from "../ui/Button";

interface ToolbarProps {
  title: string;
  platform: BootState["platform"];
  showSidebarToggle: boolean;
  sidebarOpen: boolean;
  settingsOn: boolean;
  onSidebar: () => void;
  onSettings: () => void;
  children?: ReactNode;
}

export function Toolbar({
  title,
  platform,
  showSidebarToggle,
  sidebarOpen,
  settingsOn,
  onSidebar,
  onSettings,
  children,
}: ToolbarProps) {
  return (
    <header className="toolbar" data-platform={platform}>
      {showSidebarToggle ? (
        <button
          type="button"
          className="icon-btn"
          aria-pressed={sidebarOpen}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          onClick={onSidebar}
        >
          <SidebarGlyph />
        </button>
      ) : null}
      <h1>{title}</h1>
      <div className="toolbar__slot">{children}</div>
      <Button aria-pressed={settingsOn} aria-keyshortcuts="Meta+," onClick={onSettings}>
        Settings
      </Button>
    </header>
  );
}
