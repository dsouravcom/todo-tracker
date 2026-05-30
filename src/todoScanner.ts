/**
 * todoScanner.ts
 *
 * Scans workspace files and extracts TODO items using ripgrep (rg) for
 * blazing-fast, production-grade search.
 *
 * Uses the ripgrep binary bundled with VS Code itself — no extra
 * dependencies required. Falls back to the legacy fs-based scanner
 * if the binary can't be located.
 *
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
import { execFile } from "child_process";

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

/**
 * Single ripgrep pattern that catches ALL TODO variants in one pass.
 *
 * Breakdown:
 *   //               – literal comment start
 *   [!@#$?]?         – optional priority sigil
 *   \s*              – optional whitespace (for "// TODO" style)
 *   todo             – the keyword (rg -i makes it case-insensitive)
 *
 * This is intentionally broad — the classification into P1–P5 vs normal
 * happens in TypeScript after ripgrep delivers matching lines.
 */
const RG_PATTERN = "//[!@#$?]?\\s*todo";

/**
 * File type globs for ripgrep --type-add / --type.
 * Using ripgrep's native glob engine is far faster than post-filtering.
 */
const SUPPORTED_EXTENSIONS = [
  "*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.java",
  "*.c", "*.cpp", "*.cs", "*.go", "*.rb", "*.php",
  "*.swift", "*.kt", "*.rs", "*.html", "*.css", "*.scss",
  "*.vue", "*.md", "*.sh", "*.yaml", "*.yml", "*.json", "*.xml",
];

/** Folders to skip — keeps scans fast and avoids vendor noise */
const IGNORED_DIRS_SET = new Set([
  // Node / JavaScript / Frontend
  "node_modules", "dist", "out", ".next", ".nuxt", ".svelte-kit",
  ".docusaurus", "bower_components",
  // Python
  "__pycache__", "venv", ".venv", "env", ".env",
  ".pytest_cache", ".mypy_cache", "htmlcov",
  // Java / Gradle / Maven
  "target", "build", ".gradle", "bin",
  // Go & PHP & Ruby
  "vendor", ".bundle",
  // .NET
  "obj",
  // C/C++
  "cmake-build-debug", "cmake-build-release",
  // Version control, IDEs & Metadata
  ".git", ".github", ".vscode", ".idea", ".settings",
  // Other cache / coverage
  "coverage", ".cache", "temp", "tmp",
]);

/**
 * Same list as an array for ripgrep --glob flags.
 */
const IGNORED_DIRS = Array.from(IGNORED_DIRS_SET);

/** File extensions to scan — text/code only, no binaries (used by fallback) */
const SUPPORTED_EXTENSIONS_SET = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java",
  ".c", ".cpp", ".cs", ".go", ".rb", ".php",
  ".swift", ".kt", ".rs", ".html", ".css", ".scss",
  ".vue", ".md", ".sh", ".yaml", ".yml", ".json", ".xml",
]);

/**
 * Priority patterns — checked in order from P1 (highest) to P5 (lowest).
 * Each regex runs against a clean line (no \r).
 *
 * IMPORTANT: These are checked BEFORE the normal TODO regex so that a
 * priority marker is never misclassified as a plain TODO.
 */
const PRIORITY_PATTERNS: Array<{ regex: RegExp; kind: TodoKind }> = [
  { regex: /\/\/!todo(?:[:\s]+(.*))?$/i,  kind: "p1" },   // //!todo  Critical
  { regex: /\/\/@todo(?:[:\s]+(.*))?$/i,  kind: "p2" },   // //@todo  High
  { regex: /\/\/#todo(?:[:\s]+(.*))?$/i,  kind: "p3" },   // //#todo  Medium
  { regex: /\/\/\$todo(?:[:\s]+(.*))?$/i, kind: "p4" },   // //$todo  Low
  { regex: /\/\/\?todo(?:[:\s]+(.*))?$/i, kind: "p5" },   // //?todo  Idea
];

/** Plain //TODO or //todo — matched only if no priority prefix was found */
const NORMAL_TODO_REGEX = /\/\/\s*todo(?:[:\s]+(.*))?$/i;

// ─── Ripgrep binary resolution ───────────────────────────────────────────────

/** Cached ripgrep binary path — resolved once, reused on every scan */
let cachedRgPath: string | null | undefined; // undefined = not yet resolved

/**
 * Finds the ripgrep binary bundled with VS Code.
 *
 * VS Code ships rg at a known location inside its installation. We resolve
 * it from `vscode.env.appRoot` which is available at runtime.
 *
 * @param appRoot - `vscode.env.appRoot` passed in from extension.ts
 * @returns Absolute path to rg binary, or null if not found
 */
export function resolveRipgrepPath(appRoot: string): string | null {
  if (cachedRgPath !== undefined) {
    return cachedRgPath;
  }

  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "rg.exe" : "rg";

  // Known locations where VS Code stores the ripgrep binary
  const candidates = [
    // VS Code ≥ 1.90 (universal binary layout)
    path.join(appRoot, "node_modules", "@vscode", "ripgrep-universal", "bin", `${process.platform}-${process.arch}`, binaryName),
    // VS Code < 1.90 / some builds
    path.join(appRoot, "node_modules", "@vscode", "ripgrep", "bin", binaryName),
    // ASAR-unpacked (Electron packaging)
    path.join(appRoot, "node_modules.asar.unpacked", "@vscode", "ripgrep", "bin", binaryName),
    path.join(appRoot, "node_modules.asar.unpacked", "@vscode", "ripgrep-universal", "bin", `${process.platform}-${process.arch}`, binaryName),
    // Platform-specific package
    path.join(appRoot, "node_modules", `@vscode`, `ripgrep-${process.platform}-${process.arch}`, "bin", binaryName),
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedRgPath = candidate;
      return cachedRgPath;
    } catch {
      // Not found at this path — try next
    }
  }

  cachedRgPath = null;
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans the entire workspace folder and returns all TODO items found.
 *
 * Strategy:
 *   1. Try ripgrep (fast path) — single subprocess, handles everything
 *   2. Fall back to fs-based scan if ripgrep is unavailable
 *
 * @param workspaceRoot - Root directory to scan recursively
 * @param appRoot       - `vscode.env.appRoot` for locating the rg binary
 * @returns Flat array of TodoItem objects across all files
 */
export async function scanWorkspace(
  workspaceRoot: string,
  appRoot?: string
): Promise<TodoItem[]> {
  // Try ripgrep first
  if (appRoot) {
    const rgBinary = resolveRipgrepPath(appRoot);
    if (rgBinary) {
      try {
        const rawLines = await runRipgrep(rgBinary, workspaceRoot);
        return classifyMatches(rawLines);
      } catch {
        // Ripgrep failed — fall through to legacy scanner
      }
    }
  }

  // Fallback: fs-based scan
  return scanWorkspaceLegacy(workspaceRoot);
}

// ─── Ripgrep scanner ─────────────────────────────────────────────────────────

/**
 * Represents a single match line returned by ripgrep's JSON output.
 */
interface RgMatch {
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineText: string;
}

/**
 * Spawns ripgrep and collects all matching lines.
 *
 * Uses `--json` output for structured, unambiguous parsing — no need to
 * worry about colons in filenames or other delimiter-based pitfalls.
 */
function runRipgrep(rgBinary: string, workspaceRoot: string): Promise<RgMatch[]> {
  return new Promise((resolve, reject) => {
    // Build the include globs for --type-add
    const typeAddArgs = SUPPORTED_EXTENSIONS.flatMap(ext => ["--type-add", `todo:${ext}`]);

    const args: string[] = [
      // Use our custom file type
      ...typeAddArgs,
      "--type", "todo",

      // Exclude directories
      ...IGNORED_DIRS.flatMap(dir => ["--glob", `!${dir}/`]),

      // Output format: JSON for reliable parsing
      "--json",

      // Case-insensitive matching
      "--ignore-case",

      // Don't require .gitignore — scan everything that matches our filters
      "--no-require-git",

      // Follow symlinks
      "--follow",

      // The search pattern
      "--regexp", RG_PATTERN,

      // The search root
      workspaceRoot,
    ];

    const matches: RgMatch[] = [];

    execFile(
      rgBinary,
      args,
      {
        maxBuffer: 50 * 1024 * 1024, // 50 MB — generous for huge workspaces
        windowsHide: true,           // Don't flash a console window on Windows
      },
      (error, stdout, _stderr) => {
        // ripgrep exits with code 1 when no matches are found — that's fine
        if (error && (error as any).code !== 1) {
          // Exit code 2+ means an actual error
          reject(new Error(`ripgrep error: ${_stderr || error.message}`));
          return;
        }

        if (stdout) {
          const lines = stdout.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { continue; }

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "match" && parsed.data) {
                const data = parsed.data;
                const filePath: string = data.path?.text ?? "";
                const lineNumber: number = data.line_number ?? 0;
                const lineText: string = data.lines?.text ?? "";

                if (filePath && lineNumber > 0) {
                  // Extract just the filename from the path
                  const lastSep = Math.max(
                    filePath.lastIndexOf("/"),
                    filePath.lastIndexOf("\\")
                  );
                  const fileName = lastSep >= 0
                    ? filePath.substring(lastSep + 1)
                    : filePath;

                  matches.push({
                    filePath,
                    fileName,
                    lineNumber,
                    lineText: lineText.replace(/\r?\n$/, ""), // Strip trailing newline/CR
                  });
                }
              }
            } catch {
              // Malformed JSON line — skip silently
            }
          }
        }

        resolve(matches);
      }
    );
  });
}

/**
 * Takes raw ripgrep matches and classifies each into the correct
 * TodoKind (P1–P5 or normal) by running our priority regexes.
 *
 * Lines that matched the broad ripgrep pattern but don't match any
 * specific classifier are silently dropped (e.g. URLs containing "//todo").
 */
function classifyMatches(rawMatches: RgMatch[]): TodoItem[] {
  const todos: TodoItem[] = [];

  for (const match of rawMatches) {
    const { filePath, fileName, lineNumber, lineText } = match;

    // Strip any trailing \r that Windows may have left
    const line = lineText.replace(/\r$/, "");

    // ── Step 1: Try each priority pattern (P1 → P5) ─────────────────────
    let classified = false;
    for (const { regex, kind } of PRIORITY_PATTERNS) {
      const m = line.match(regex);
      if (m) {
        todos.push({
          kind,
          message: (m[1] || "").trim(),
          filePath,
          fileName,
          lineNumber,
        });
        classified = true;
        break; // One TODO per line
      }
    }

    if (classified) { continue; }

    // ── Step 2: Try plain //TODO (only if no priority matched) ──────────
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
  }

  return todos;
}

// ─── Legacy fs-based scanner (fallback) ──────────────────────────────────────

/**
 * Scans the workspace using Node's fs API as a fallback when ripgrep
 * is unavailable. This is slower but always works.
 */
function scanWorkspaceLegacy(workspaceRoot: string): TodoItem[] {
  const todos: TodoItem[] = [];
  const files = collectFiles(workspaceRoot);

  for (const filePath of files) {
    const fileTodos = scanFile(filePath);
    todos.push(...fileTodos);
  }

  return todos;
}

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
      if (!IGNORED_DIRS_SET.has(entry.name)) {
        results.push(...collectFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS_SET.has(ext)) {
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

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1; // Convert 0-based index → 1-based line number

    // Strip trailing \r (Windows CRLF line endings)
    const line = rawLine.replace(/\r$/, "");

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
