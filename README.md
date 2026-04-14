# MCP Knowledge Base Server

A lightweight [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets AI agents browse and read a folder of Markdown knowledge-base files. Agents are guided through a strict 4-step workflow to minimise token usage: discover layers → discover keywords → find relevant files → read one file at a time.

## How it works

1. **Startup** — scans a directory of `.md` files, parses YAML frontmatter, and builds an in-memory index
2. **Live reload** — watches the KB directory and automatically re-indexes when any `.md` file changes (2 s debounce)
3. **4-step agent workflow** — tools are intentionally sequenced so agents never load more content than needed

```
kb_list_layers
  └─→ kb_list_keywords(layer?)
        └─→ kb_list_frontmatter_by_keywords(keywords[])
              └─→ kb_read_file(filename)
```

## Tools

### 1. `kb_list_layers`

**Always call this first.** Returns every unique layer from across all KB files, sorted alphabetically, plus instructions reminding the agent to follow the 4-step workflow.

Example output:
```
Knowledge base contains 6 files across 3 layers.

REQUIRED WORKFLOW — you MUST follow these steps in order:
  Step 1. kb_list_layers                      ← you are here
  Step 2. kb_list_keywords(layer?)             ← pick a layer (or omit for all), discover keywords
  Step 3. kb_list_frontmatter_by_keywords(keywords)
  Step 4. kb_read_file(filename)

Available layers:

backend, default, frontend
```

---

### 2. `kb_list_keywords(layer?)`

**Step 2.** Returns every unique keyword, optionally filtered by layer. Pick relevant keywords and use them in step 3.

| Parameter | Type     | Description                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `layer`   | `string` | Optional layer name from `kb_list_layers` to filter keywords. Omit for all layers |

Example output (no layer filter):
```
Knowledge base contains 6 files and 47 unique keywords.

REQUIRED WORKFLOW — you MUST follow these steps in order:
  Step 1. kb_list_layers                      ← discover available layers
  Step 2. kb_list_keywords(layer?)             ← you are here
  Step 3. kb_list_frontmatter_by_keywords(keywords) ← pick relevant keywords from the list above
  Step 4. kb_read_file(filename)               ← load the full content of a specific file

Available keywords:

api, auth, cache, ci, database, deploy, error, jwt, ...
```

Example output (filtered by layer):
```
Knowledge base contains 3 files in layer 'backend' and 22 unique keywords.
...
```

---

### 3. `kb_list_frontmatter_by_keywords(keywords)`

**Step 3.** Pass one or more keywords from step 2. Returns the `title`, `file`, `layer`, and `read_when` triggers of every KB entry that matches at least one keyword. No full file content is returned — keeping this call cheap.

| Parameter  | Type       | Description                                         |
| ---------- | ---------- | --------------------------------------------------- |
| `keywords` | `string[]` | One or more keywords returned by `kb_list_keywords` |

Example output:
```
Found 2 entries matching [auth, jwt]:

• OAuth2 Authentication Flow
  file: auth-flow.md
  layer: backend
  read when:
    - Implementing login or sign-in flows
    - Debugging token expiry issues

• REST API Design Conventions
  file: api-design.md
  layer: backend
  read when:
    - Creating new API endpoints
```

---

### 4. `kb_read_file(filename)`

**Step 4.** Loads the complete markdown content (frontmatter + body) of a single file. Only one file is returned per call, keeping token usage predictable.

| Parameter  | Type     | Description                                                                           |
| ---------- | -------- | ------------------------------------------------------------------------------------- |
| `filename` | `string` | Relative filename as shown in `kb_list_frontmatter_by_keywords` (e.g. `auth-flow.md`) |

Path traversal is blocked — requests containing `..` are rejected.

---

## KB file format

Each Markdown file should have YAML frontmatter with these fields:

```markdown
---
title: "Short, human-readable title"
description: "1–2 sentence summary"
read_when:
  - "When the agent is doing X"
  - "When debugging Y"
keywords:
  - keyword1
  - keyword2
  - synonym-or-alias
layer: backend
---

# Full document body here
...
```

| Field         | Purpose                                                   | Notes                                  |
| ------------- | --------------------------------------------------------- | -------------------------------------- |
| `title`       | Display name shown to the agent                           | Required                               |
| `description` | Brief summary                                             | Optional                               |
| `read_when`   | Natural-language scenarios that trigger reading this file | Optional                               |
| `keywords`    | Curated search terms used in step 2 & 3                   | Required for discovery                 |
| `layer`       | Categorises the file into a named layer                   | Optional, defaults to `"default"`      |

**Tip:** `keywords` bridges vocabulary gaps. If users ask about "login" but your file is about "OAuth2", add `login` to `keywords`.

---

## Setup

```bash
npm install
npm run build
```

---

## Starting the server

### Shell script

```bash
./start.sh               # stdio (default)
./start.sh http [port]   # Streamable HTTP  — POST/GET/DELETE /mcp
./start.sh sse  [port]   # SSE legacy       — GET /sse, POST /messages
```

### npm scripts

```bash
npm start            # stdio
npm run start:http   # HTTP on port 3000
npm run start:sse    # SSE on port 3000
```

### Environment variables

| Variable    | Default            | Description                               |
| ----------- | ------------------ | ----------------------------------------- |
| `KB_DIR`    | `./knowledge-base` | Path to the directory of `.md` KB files   |
| `TRANSPORT` | `stdio`            | Transport mode: `stdio`, `http`, or `sse` |
| `PORT`      | `3000`             | HTTP/SSE listen port                      |

```bash
KB_DIR=/path/to/kb PORT=8080 ./start.sh http
```

---

## Transport modes

### stdio (default)
For use with Claude Code, Cursor, and other MCP hosts that manage the process directly. Configure in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-kb-server/dist/index.js"],
      "env": {
        "KB_DIR": "/absolute/path/to/your/knowledge-base"
      }
    }
  }
}
```

### HTTP — Streamable HTTP
The current MCP HTTP transport. Single endpoint handles all verbs.

```
POST   http://127.0.0.1:3000/mcp   — send JSON-RPC messages
GET    http://127.0.0.1:3000/mcp   — open SSE stream for server push
DELETE http://127.0.0.1:3000/mcp   — close session
```

The server responds with an `mcp-session-id` header on the first `POST`. Echo this back in all subsequent requests via the same header.

### SSE
For older clients that implement the deprecated SSE transport.

```
GET  http://127.0.0.1:3000/sse                    — open SSE stream
POST http://127.0.0.1:3000/messages?sessionId=<id> — send messages
```

---

## Development

```bash
npm run dev          # stdio with tsx (no build needed)
npm run dev:http     # HTTP with tsx
npm run dev:sse      # SSE with tsx
```
