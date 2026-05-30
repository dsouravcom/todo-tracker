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
 * Items inside each section are grouped by folder and file in a collapsible hierarchy.
 */

import * as vscode from "vscode";
import { TodoItem, TodoKind } from "./todoScanner";

// ─── Section definitions ──────────────────────────────────────────────────────

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
    themeColor: "errorForeground",
    tooltipPrefix: "🔥 CRITICAL (//!todo)",
  },
  {
    kind: "p2",
    label: "🔴 P2 — High",
    itemEmoji: "🔴",
    themeColor: "list.warningForeground",
    tooltipPrefix: "🔴 HIGH (//@todo)",
  },
  {
    kind: "p3",
    label: "🟠 P3 — Medium",
    itemEmoji: "🟠",
    themeColor: "charts.orange",
    tooltipPrefix: "🟠 MEDIUM (//#todo)",
  },
  {
    kind: "p4",
    label: "🟡 P4 — Low",
    itemEmoji: "🟡",
    themeColor: "charts.yellow",
    tooltipPrefix: "🟡 LOW (//$todo)",
  },
  {
    kind: "p5",
    label: "🔵 P5 — Idea",
    itemEmoji: "🔵",
    themeColor: "charts.blue",
    tooltipPrefix: "🔵 IDEA (//?todo)",
  },
  {
    kind: "normal",
    label: "📋 Normal TODOs",
    itemEmoji: "📝",
    themeColor: "foreground",
    tooltipPrefix: "📝 TODO (//TODO)",
  },
];

// ─── Tree item class ──────────────────────────────────────────────────────────

export class TodoTreeItem extends vscode.TreeItem {
  public children?: TodoTreeItem[];

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly todoData?: TodoItem
  ) {
    super(label, collapsibleState);
  }
}

// ─── Tree data provider ───────────────────────────────────────────────────────

export class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: TodoTreeItem[] = [];
  private _totalCount = 0;

  get totalCount(): number {
    return this._totalCount;
  }

  update(allTodos: TodoItem[]): void {
    this._totalCount = allTodos.length;
    this.rootNodes = this.buildTree(allTodos);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TodoTreeItem): TodoTreeItem[] {
    if (!element) {
      return this.rootNodes;
    }
    return element.children ?? [];
  }

  // ─── Private builders ───────────────────────────────────────────────────────

  private buildTree(allTodos: TodoItem[]): TodoTreeItem[] {
    const sectionNodes: TodoTreeItem[] = [];

    for (const section of SECTIONS) {
      const todosForSection = allTodos.filter((t) => t.kind === section.kind);
      const count = todosForSection.length;

      const header = new TodoTreeItem(
        `${section.label}  (${count})`,
        count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      header.id = `section-${section.kind}`;
      header.contextValue = `section-${section.kind}`;
      header.iconPath = new vscode.ThemeIcon(
        section.kind === "normal" ? "list-unordered" : "circle-filled",
        new vscode.ThemeColor(section.themeColor)
      );

      if (count > 0) {
        header.children = this.buildHierarchy(todosForSection, section);
      } else {
        header.children = [];
      }

      sectionNodes.push(header);
    }

    return sectionNodes;
  }

  private buildHierarchy(todos: TodoItem[], section: typeof SECTIONS[0]): TodoTreeItem[] {
    interface Node {
      name: string;
      path: string;
      isFolder: boolean;
      uri?: vscode.Uri;
      children: Map<string, Node>;
      todos: TodoItem[];
    }

    const root: Node = { name: "root", path: "", isFolder: true, children: new Map(), todos: [] };

    // 1. Build an intermediate folder/file tree
    for (const todo of todos) {
      const uri = vscode.Uri.file(todo.filePath);
      // Get workspace-relative path if possible; otherwise use basename
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const parts = relativePath.split(/[/\\]/);

      let current = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!current.children.has(part)) {
          // Attempt to map the actual URI for the file or folder so VS Code
          // can supply the correct file/folder icon and theme colors.
          let nodeUri: vscode.Uri | undefined;
          if (isFile) {
            nodeUri = uri;
          } else {
            // Reconstruct the folder URI from the original file's URI
            const folderUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || uri, currentPath);
            nodeUri = folderUri;
          }

          current.children.set(part, {
            name: part,
            path: currentPath,
            isFolder: !isFile,
            uri: nodeUri,
            children: new Map(),
            todos: [],
          });
        }

        current = current.children.get(part)!;

        if (isFile) {
          current.todos.push(todo);
        }
      }
    }

    // 2. Convert intermediate tree into TodoTreeItem nodes
    const convertNode = (node: Node): TodoTreeItem[] => {
      const items: TodoTreeItem[] = [];

      // Sort: folders first, then files
      const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const child of sortedChildren) {
        if (child.isFolder) {
          const folderItem = new TodoTreeItem(
            child.name,
            vscode.TreeItemCollapsibleState.Expanded
          );
          folderItem.id = `folder-${section.kind}-${child.path}`;
          folderItem.contextValue = "folder";
          folderItem.resourceUri = child.uri;
          folderItem.children = convertNode(child);
          items.push(folderItem);
        } else {
          // It's a file
          const fileItem = new TodoTreeItem(
            child.name,
            vscode.TreeItemCollapsibleState.Expanded
          );
          fileItem.id = `file-${section.kind}-${child.path}`;
          fileItem.contextValue = "file";
          fileItem.resourceUri = child.uri;

          // For each file, the children are the specific TODOs
          fileItem.children = child.todos.map((todo) => {
            const todoItem = new TodoTreeItem(
              `Line ${todo.lineNumber}: ${todo.message || "TODO"}`,
              vscode.TreeItemCollapsibleState.None,
              todo
            );
            
            todoItem.id = `todo-${section.kind}-${child.path}-${todo.lineNumber}`;

            // Icon for the specific TODO
            todoItem.iconPath = new vscode.ThemeIcon(
              "issue-draft",
              new vscode.ThemeColor(section.themeColor)
            );

            todoItem.tooltip = `${section.tooltipPrefix}\n${todo.filePath} (line ${todo.lineNumber})`;
            
            // Allow clicking to jump to line
            todoItem.command = {
              command: "todoTracker.openFile",
              title: "Open File",
              arguments: [todo.filePath, todo.lineNumber],
            };
            
            todoItem.contextValue = `todo-${section.kind}`;
            return todoItem;
          });

          // Sort TODOs by line number
          fileItem.children.sort((a, b) => (a.todoData!.lineNumber - b.todoData!.lineNumber));

          items.push(fileItem);
        }
      }

      return items;
    };

    return convertNode(root);
  }
}
