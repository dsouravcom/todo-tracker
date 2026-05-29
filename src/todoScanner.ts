/**
 * todoScanner.ts
 *
 * Scans workspace files and extracts TODO items.
 * Supports 5 priority levels (P1–P5) plus normal TODOs.
 *
 * Syntax reference:
 *   //TODO or //todo          →  Normal (no priority)
 *   //!todo                   →  P1 — Critical   🔥
 *   //@todo                   →  P2 — High        🔴
 *   //#todo                   →  P3 — Medium      🟠
 *   //$todo                   →  P4 — Low         🟡
 *   //?todo                   →  P5 — Idea        🔵
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * The five priority levels, ordered highest → lowest urgency.
 * "normal" is the plain //TODO with no priority attached.
 */
export type TodoKind =
  | "normal"  // //TODO or //todo
  | "p1"      // //!todo — Critical
  | "p2"      // //@todo — High
  | "p3"      // //#todo — Medium
  | "p4"      // //$todo — Low
  | "p5";     // //?todo — Idea

/** One TODO item found in a file */
export interface TodoItem {
  kind: TodoKind;

  /** The message text after the TODO keyword */
  message: string;

  /** Absolute file path */
  filePath: string;

  /** Short filename (e.g. "index.ts") */
  fileName: string;

  /** 1-based line number */
  lineNumber: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Folders to skip — keeps scans fast and avoids vendor noise */
const IGNORED_DIRS = new Set([
  // Node / JavaScript / Frontend
  "node_modules", "dist", "out", ".next", ".nuxt", ".svelte-kit", ".docusaurus", "bower_components",
  // Python
  "__pycache__", "venv", ".venv", "env", ".env", ".pytest_cache", ".mypy_cache", "htmlcov",
  // Java / Gradle / Maven
  "target", "build", ".gradle", "bin",
  // Go & PHP & Ruby
  "vendor", ".bundle",
  // Rust
  "target",
  // .NET
  "bin", "obj",
  // C/C++
  "cmake-build-debug", "cmake-build-release",
  // Version control, IDEs & Metadata
  ".git", ".github", ".vscode", ".idea", ".settings", ".DS_Store",
  // Other cache / coverage
  "coverage", ".cache", "temp", "tmp",
]);

/** File extensions to scan — text/code only, no binaries */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java",
  ".c", ".cpp", ".cs", ".go", ".rb", ".php",
  ".swift", ".kt", ".rs", ".html", ".css", ".scss",
  ".vue", ".md", ".sh", ".yaml", ".yml", ".json", ".xml",
]);

/**
 * Priority patterns — checked in order from P1 (highest) to P5 (lowest).
 * Each entry maps a regex to its TodoKind.
 *
 * IMPORTANT: These are checked BEFORE the normal TODO regex so that a
 * priority marker is never misclassified as a plain TODO.
 *
 * Special characters used (chosen to be easy to type and memorable):
 *   !  →  P1 Critical  (exclamation = danger/urgent)
 *   @  →  P2 High      (@ = attention)
 *   #  →  P3 Medium    (# = tag/note)
 *   $  →  P4 Low       ($ = minor cost/effort)
 *   ?  →  P5 Idea      (? = question/maybe)
 */
const PRIORITY_PATTERNS: Array<{ regex: RegExp; kind: TodoKind }> = [
  { regex: /(?<!:)\/\/!todo(?:[:\s]+(.*))?$/i,  kind: "p1" },   // //!todo  Critical
  { regex: /(?<!:)\/\/@todo(?:[:\s]+(.*))?$/i,  kind: "p2" },   // //@todo  High
  { regex: /(?<!:)\/\/#todo(?:[:\s]+(.*))?$/i,  kind: "p3" },   // //#todo  Medium
  { regex: /(?<!:)\/\/\$todo(?:[:\s]+(.*))?$/i, kind: "p4" },   // //$todo  Low
  { regex: /(?<!:)\/\/\?todo(?:[:\s]+(.*))?$/i, kind: "p5" },   // //?todo  Idea
];

/** Plain //TODO or //todo — matched only if no priority prefix was found */
const NORMAL_TODO_REGEX = /(?<!:)\/\/\s*TODO(?:[:\s]+(.*))?$/i;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans the entire workspace folder and returns all TODO items found.
 *
 * @param workspaceRoot - Root directory to scan recursively
 * @returns Flat array of TodoItem objects across all files
 */
export async function scanWorkspace(workspaceRoot: string): Promise<TodoItem[]> {
  const todos: TodoItem[] = [];
  const files = collectFiles(workspaceRoot);

  for (const filePath of files) {
    const fileTodos = scanFile(filePath);
    todos.push(...fileTodos);
  }

  return todos;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Recursively walks a directory and returns paths of all supported files.
 * Silently skips unreadable directories.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // Permission error or broken symlink — just skip
  }

  for (const entry of entries) {
    // Skip hidden files/directories (starting with a dot)
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        results.push(...collectFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Reads one file line-by-line and extracts all TODO items from it.
 * Silently skips unreadable files.
 */
function scanFile(filePath: string): TodoItem[] {
  const todos: TodoItem[] = [];
  const fileName = path.basename(filePath);

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return todos; // Binary file or locked — skip
  }

  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1; // Convert 0-based index → 1-based line number

    // ── Step 1: Try each priority pattern (P1 → P5) ───────────────────────
    for (const { regex, kind } of PRIORITY_PATTERNS) {
      const match = line.match(regex);
      if (match) {
        todos.push({
          kind,
          message: (match[1] || "").trim(),
          filePath,
          fileName,
          lineNumber,
        });
        return; // Stop — one TODO per line
      }
    }

    // ── Step 2: Try plain //TODO (only if no priority matched) ────────────
    const normalMatch = line.match(NORMAL_TODO_REGEX);
    if (normalMatch) {
      todos.push({
        kind: "normal",
        message: (normalMatch[1] || "").trim(),
        filePath,
        fileName,
        lineNumber,
      });
    }
  });

  return todos;
}
