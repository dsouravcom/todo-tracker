/**
 * todoTreeProvider.ts
 *
 * Renders the sidebar tree view with 6 sections total:
 *
 *   🔥 P1 — Critical   (//!todo)   — deep red
 *   🔴 P2 — High       (//@todo)   — red/orange
 *   🟠 P3 — Medium     (//#todo)   — orange
 *   🟡 P4 — Low        (//$todo)   — yellow
 *   🔵 P5 — Idea       (//?todo)   — blue
 *   📋 Normal TODOs    (//TODO)    — default
 *
 * Priority sections appear first (P1 at top), normal TODOs at the bottom.
 * Each section is auto-expanded when it has items, collapsed when empty.
 */

import * as vscode from "vscode";
import { TodoItem, TodoKind } from "./todoScanner";

// ─── Section definitions ──────────────────────────────────────────────────────

/**
 * Static metadata for each section.
 * Drives both the section headers and the individual item icons/tooltips.
 * Add or reorder entries here to change the sidebar layout.
 */
const SECTIONS: Array<{
  kind: TodoKind;
  label: string;          // Section header label (emoji + name)
  itemEmoji: string;      // Emoji shown on each child item
  themeColor: string;     // VS Code theme color token for the icon
  tooltipPrefix: string;  // Prefix shown in hover tooltip on items
}> = [
  {
    kind: "p1",
    label: "🔥 P1 — Critical",
    itemEmoji: "🔥",
    themeColor: "errorForeground",                  // Red — critical/error
    tooltipPrefix: "🔥 CRITICAL (//!todo)",
  },
  {
    kind: "p2",
    label: "🔴 P2 — High",
    itemEmoji: "🔴",
    themeColor: "list.warningForeground",           // Orange-red — warning
    tooltipPrefix: "🔴 HIGH (//@todo)",
  },
  {
    kind: "p3",
    label: "🟠 P3 — Medium",
    itemEmoji: "🟠",
    themeColor: "charts.orange",                    // Orange — medium
    tooltipPrefix: "🟠 MEDIUM (//#todo)",
  },
  {
    kind: "p4",
    label: "🟡 P4 — Low",
    itemEmoji: "🟡",
    themeColor: "charts.yellow",                    // Yellow — low
    tooltipPrefix: "🟡 LOW (//$todo)",
  },
  {
    kind: "p5",
    label: "🔵 P5 — Idea",
    itemEmoji: "🔵",
    themeColor: "charts.blue",                      // Blue — idea/optional
    tooltipPrefix: "🔵 IDEA (//?todo)",
  },
  {
    kind: "normal",
    label: "📋 Normal TODOs",
    itemEmoji: "📝",
    themeColor: "foreground",                       // Default text color
    tooltipPrefix: "📝 TODO (//TODO)",
  },
];

// ─── Tree item class ──────────────────────────────────────────────────────────

/**
 * One node in the sidebar tree.
 * Either a section header (collapsible) or a TODO item (leaf/clickable).
 */
export class TodoTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    /** Only set on leaf TODO nodes, not on section headers */
    public readonly todoData?: TodoItem
  ) {
    super(label, collapsibleState);
  }
}

// ─── Tree data provider ───────────────────────────────────────────────────────

export class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeItem> {

  // ── Change event ──────────────────────────────────────────────────────────

  private _onDidChangeTreeData =
    new vscode.EventEmitter<TodoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // ── Internal data store ────────────────────────────────────────────────────

  /**
   * Map from TodoKind → array of items for that kind.
   * Updated by `update()` and read by `getChildren()`.
   */
  private buckets = new Map<TodoKind, TodoItem[]>([
    ["p1", []], ["p2", []], ["p3", []], ["p4", []], ["p5", []], ["normal", []],
  ]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Replace all stored TODOs and trigger a UI refresh.
   * Called after every workspace scan.
   */
  update(allTodos: TodoItem[]): void {
    // Clear all buckets first
    for (const key of this.buckets.keys()) {
      this.buckets.set(key, []);
    }

    // Distribute each TODO into its bucket
    for (const todo of allTodos) {
      const bucket = this.buckets.get(todo.kind);
      if (bucket) {
        bucket.push(todo);
      }
    }

    // Tell VS Code to re-render the tree
    this._onDidChangeTreeData.fire();
  }

  /** Total count across all kinds — used for the sidebar badge */
  get totalCount(): number {
    let count = 0;
    for (const items of this.buckets.values()) {
      count += items.length;
    }
    return count;
  }

  // ── TreeDataProvider implementation ────────────────────────────────────────

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TodoTreeItem): TodoTreeItem[] {
    if (!element) {
      // Root: return all 6 section headers
      return this.buildSectionHeaders();
    }

    // A section header was clicked — return its children
    const kind = element.contextValue?.replace("section-", "") as TodoKind | undefined;
    if (kind && this.buckets.has(kind)) {
      return this.buildItemNodes(kind);
    }

    return [];
  }

  // ── Private builders ───────────────────────────────────────────────────────

  /**
   * Builds all 6 section header nodes.
   * Sections with zero items are shown collapsed; sections with items are expanded.
   */
  private buildSectionHeaders(): TodoTreeItem[] {
    return SECTIONS.map((section) => {
      const items = this.buckets.get(section.kind) ?? [];
      const count = items.length;

      const header = new TodoTreeItem(
        `${section.label}  (${count})`,
        count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );

      // contextValue encodes which kind this section holds
      // (used in getChildren to look up the right bucket)
      header.contextValue = `section-${section.kind}`;

      // Apply the section's color to the icon
      header.iconPath = new vscode.ThemeIcon(
        section.kind === "normal" ? "list-unordered" : "circle-filled",
        new vscode.ThemeColor(section.themeColor)
      );

      return header;
    });
  }

  /**
   * Builds leaf nodes for all TODOs belonging to one kind.
   * Each node is clickable and jumps to the file + line.
   */
  private buildItemNodes(kind: TodoKind): TodoTreeItem[] {
    const items = this.buckets.get(kind) ?? [];
    const section = SECTIONS.find((s) => s.kind === kind)!;

    return items.map((todo) => {
      const node = new TodoTreeItem(
        `${section.itemEmoji}  ${todo.message}`,
        vscode.TreeItemCollapsibleState.None,
        todo
      );

      // Secondary text shown greyed-out to the right of the label
      node.description = `${todo.fileName}:${todo.lineNumber}`;

      // Full path shown on hover
      node.tooltip = `${section.tooltipPrefix}\n${todo.filePath}  (line ${todo.lineNumber})`;

      // Clicking the node opens the file at the correct line
      node.command = {
        command: "todoTracker.openFile",
        title: "Open File",
        arguments: [todo.filePath, todo.lineNumber],
      };

      node.contextValue = `todo-${kind}`;
      return node;
    });
  }
}
