/**
 * extension.ts
 *
 * Main entry point for the TODO Tracker extension.
 *
 * Responsibilities:
 *  1. Register the sidebar tree view
 *  2. Register commands (refresh, open file)
 *  3. Set up auto-refresh on file save
 *  4. Update the badge count on the sidebar icon
 *  5. Show a welcome notification on first launch
 *  6. Show a status bar message when new TODOs are found
 *  7. Clean up subscriptions on deactivation
 */

import * as vscode from "vscode";
import { TodoTreeProvider } from "./todoTreeProvider";
import { scanWorkspace } from "./todoScanner";

// ─── State keys ───────────────────────────────────────────────────────────────

const KEY_FIRST_LAUNCH = "todoTracker.firstLaunch";

// ─── Output channel (replaces raw console for structured logs) ────────────────

let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── 0. Output channel — persistent log for debugging ─────────────────────
  outputChannel = vscode.window.createOutputChannel("TODO Tracker");
  log("Activating TODO Tracker...");

  // ── 1. Tree provider — owns the data + triggers re-renders ────────────────
  const treeProvider = new TodoTreeProvider();

  // ── 2. Tree view — the actual sidebar panel ────────────────────────────────
  const treeView = vscode.window.createTreeView("todoTrackerView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // ── 3. Commands ────────────────────────────────────────────────────────────

  const refreshCommand = vscode.commands.registerCommand(
    "todoTracker.refresh",
    () => runScan(treeProvider, treeView, context)
  );

  const openFileCommand = vscode.commands.registerCommand(
    "todoTracker.openFile",
    (filePath: string, lineNumber: number) => openFileAtLine(filePath, lineNumber)
  );

  // ── 4. Auto-refresh watchers ───────────────────────────────────────────────

  const onSave = vscode.workspace.onDidSaveTextDocument(
    () => runScan(treeProvider, treeView, context)
  );

  const onFolderChange = vscode.workspace.onDidChangeWorkspaceFolders(
    () => runScan(treeProvider, treeView, context)
  );

  // ── 5. First-launch welcome notification ──────────────────────────────────
  const isFirstLaunch = context.globalState.get<boolean>(KEY_FIRST_LAUNCH, true);
  if (isFirstLaunch) {
    await context.globalState.update(KEY_FIRST_LAUNCH, false);
    const action = await vscode.window.showInformationMessage(
      "👋 TODO Tracker is now active! Use //!todo, //@todo, //#todo, //$todo, //?todo or //TODO in any file to track your tasks.",
      "View README",
      "Got it"
    );
    if (action === "View README") {
      vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/dsouravcom/todo-tracker#readme")
      );
    }
  }

  // ── 6. Initial scan on activation ─────────────────────────────────────────
  await runScan(treeProvider, treeView, context);

  // ── 7. Register all disposables for clean teardown ────────────────────────
  context.subscriptions.push(
    treeView,
    refreshCommand,
    openFileCommand,
    onSave,
    onFolderChange,
    outputChannel
  );

  log("TODO Tracker is ready.");
}

// ─── Deactivation ─────────────────────────────────────────────────────────────

export function deactivate(): void {
  log("TODO Tracker deactivated.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs a full workspace scan, pushes results to the tree provider,
 * updates the badge count, and shows a status bar notification when
 * the first TODO is found in the current session.
 */
async function runScan(
  treeProvider: TodoTreeProvider,
  treeView: vscode.TreeView<any>,
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    treeProvider.update([]);
    treeView.badge = undefined;
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  try {
    const allTodos = await scanWorkspace(rootPath, vscode.env.appRoot);
    treeProvider.update(allTodos);

    const total = treeProvider.totalCount;

    // Update badge
    treeView.badge = total > 0
      ? { value: total, tooltip: `${total} TODO${total === 1 ? "" : "s"} in workspace` }
      : undefined;

    log(`Scan complete — found ${total} TODO(s).`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[ERROR] Scan failed: ${message}`);

    const action = await vscode.window.showErrorMessage(
      `TODO Tracker: Scan failed — ${message}`,
      "Show Logs",
      "Retry"
    );

    if (action === "Show Logs") {
      outputChannel.show();
    } else if (action === "Retry") {
      await runScan(treeProvider, treeView, context);
    }
  }
}

/**
 * Opens a file in the editor and scrolls to the given line.
 *
 * @param filePath   - Absolute path to the file
 * @param lineNumber - 1-based line number to reveal
 */
async function openFileAtLine(filePath: string, lineNumber: number): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const editor = await vscode.window.showTextDocument(doc);

    const pos = new vscode.Position(Math.max(0, lineNumber - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[ERROR] Failed to open file: ${filePath} — ${message}`);

    const action = await vscode.window.showErrorMessage(
      `TODO Tracker: Could not open "${filePath}"`,
      "Show Logs"
    );
    if (action === "Show Logs") {
      outputChannel.show();
    }
  }
}
