# TODO Tracker for VS Code

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/sourav.todo-tracker.svg?style=flat-squared&color=blue)](https://marketplace.visualstudio.com/items?itemName=sourav.todo-tracker)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/sourav.todo-tracker.svg?style=flat-squared)](https://marketplace.visualstudio.com/items?itemName=sourav.todo-tracker)
[![License](https://img.shields.io/github/license/sourav/todo-tracker.svg?style=flat-squared&color=green)](https://github.com/dsouravcom/todo-tracker/blob/master/LICENSE)

## 🎥 How It Works

<p align="left">
  <video src="https://www.youtube.com/watch?v=pQY9CkBU5E0" width="40%" controls autoplay loop muted poster="images/icon.png">
    Your browser does not support the video tag.
  </video>
</p>

Track normal TODOs and color-coded priority `@TODOs` across your entire workspace in a clean, dedicated sidebar view. 

No more digging through search results or losing track of critical issues. **TODO Tracker** scans your workspace automatically and groups your tasks by urgency levels so you can stay focused on what matters most.

---

## 🚀 Key Features

- **⚡ Live Workspace Scanning**: Scans your project instantly on startup and re-scans automatically whenever you save a file.
- **🔥 Color-Coded Urgency Sections**: Tasks are automatically bucketed into 6 logical levels (Critical P1 down to P5 Ideas and Normal TODOs).
- **📋 Smart Sidebar View**: Beautiful activity bar panel showing item counts per category. Sections expand when they have items and collapse when empty to save space.
- **🎯 One-Click Navigation**: Clicking any TODO in the sidebar opens the file and reveals the exact line number in your editor.
- **⚡ Supercharged Exclusions**: Automatically skips dependencies (`node_modules`, `vendor`, `venv`), dotfiles (`.env`, `.gitignore`), build folders, and binaries to keep your scans lightning fast.

---

## 📝 Syntax & Priority Levels

Mark your TODOs in any file using standard double-slash `//` comment syntax:

| Urgency Level | Syntax | Sidebar Emoji | VS Code Icon Theme Color | Ideal Use Cases |
| :--- | :--- | :---: | :---: | :--- |
| **P1 — Critical** | `//!todo` | 🔥 | **Error Red** | Blockers, crashes, security vulnerability, broken builds |
| **P2 — High** | `//@todo` | 🔴 | **Warning Orange** | Immediate refactoring needed, major edge cases |
| **P3 — Medium** | `//#todo` | 🟠 | **Orange** | Normal task items, feature work |
| **P4 — Low** | `//$todo` | 🟡 | **Yellow** | Minor cleanups, code comments updates, code smells |
| **P5 — Idea** | `//?todo` | 🔵 | **Blue** | Optional improvements, feature suggestions, notes |
| **Normal TODO** | `//TODO` | 📝 | **Gray** | Standard unclassified reminders / TODOs |

> [!TIP]
> All priority prefixes are case-insensitive (e.g. `//!TODO`, `//@Todo`, `//TODO` all match). 
> The text message following the priority marker works perfectly with or without a colon separator.

### Code Examples

```typescript
// ─── CRITICAL AND HIGH PRIORITY ──────────────────────────
//!todo app crashes when user profile picture is null
//@todo refactor user authentication before release

// ─── MEDIUM AND LOW PRIORITY ──────────────────────────────
//#todo implement validation for search inputs
//$todo clean up unused local imports in this module

// ─── IDEAS AND NORMAL REMINDERS ───────────────────────────
//?todo could we optimize this search using a binary tree?
//TODO implement error boundaries for nested routers
```

---

## 🛠️ Contributed Commands

You can trigger the following commands from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or via the UI:

* **`TODO Tracker: Refresh TODOs`** (`todoTracker.refresh`)
  * Triggers a manual full workspace re-scan. (Also accessible via the **↺ Refresh** button in the sidebar view header).

---

## 🌐 Supported Languages & Extensions

TODO Tracker scans all major programming and markup languages, including:
`*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.py`, `*.java`, `*.c`, `*.cpp`, `*.cs`, `*.go`, `*.rb`, `*.php`, `*.swift`, `*.kt`, `*.rs`, `*.html`, `*.css`, `*.scss`, `*.vue`, `*.md`, `*.sh`, `*.yaml`, `*.yml`, `*.json`, `*.xml`

---

## ⚙️ Exclusions & Ignored Directories

To maintain high performance, the extension automatically skips search in:
- **Dot-files & folders**: `.env`, `.gitignore`, `.git`, `.github`, `.vscode`, `.idea`, etc.
- **Node / JS Dependecies**: `node_modules`, `bower_components`, `dist`, `out`
- **Python environments**: `venv`, `.venv`, `env`, `.pytest_cache`, `htmlcov`
- **Gradle, Maven & Rust builds**: `.gradle`, `target`, `build`, `bin`
- **Go, PHP, and Ruby libraries**: `vendor`, `.bundle`
- **Temporary folders**: `tmp`, `temp`, `coverage`

---

## 📄 License

This extension is licensed under the [MIT License](LICENSE).
