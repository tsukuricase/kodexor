# kodexor

**kodexor** is a blazing-fast, zero-dependency CLI utility that exports your entire project’s source code into a single file — annotating each block with its relative path. It's tailored for AI code analysis, prompt engineering, code review, archiving, or auditing.

## Features

- 🌐 **Universal:** Exports any codebase as a single text file, compatible with all AI/chat models.
- 🗂 **Relative Paths Included:** Each file is clearly marked by project-relative path.
- 🛡 **Custom Exclusions:** Exclude folders/files via CLI arguments (e.g., `node_modules`, `dist`, `.git`, test files).
- ⚡️ **Fast & Safe:** No runtime dependencies, works instantly, can run directly via npx.
- 🧩 **Plug & Play:** No need to install or modify your repository.

---

## Install & Usage

You can use kodexor without global install:

```sh
npx kodexor
```

Or, install globally:

```sh
npm install -g kodexor
```

---

### Basic Example

Export project code to `all-code.txt`, skipping `node_modules`/`dist`/`.git`:

```sh
npx kodexor --exclude=node_modules,dist,.git --output=all-code.txt
```

### Options

| Option      | Description                                          | Example                       |
| ----------- | ---------------------------------------------------- | ----------------------------- |
| `--exclude` | Comma-separated list of directories or files to skip | `--exclude=node_modules,dist` |
| `--output`  | Output file path (optional, default: `all-code.txt`) | `--output=/tmp/myproject.txt` |

---

### Output Format

Each code file is included as:

```
==== FILE: relative/path/to/file.js ====
...file contents...
==== END FILE ====
```

---

## Why?

- **AI Prompt Engineering**: Feed your whole codebase to GPT, Claude, or other LLMs in context, retaining file boundaries.
- **Code Auditing**: Share sanitized code bundle for review without packaging your project.
- **Archival**: Snapshot your codebase in a format that can be easily processed or indexed.

---

## License

MIT

---

> kodexor - make your codebases AI-ready!
