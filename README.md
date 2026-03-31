# agent-skills

hosting my custom agent skills

## MCP Knowledge Base Server

A lightweight MCP server for browsing and searching a markdown knowledge base via frontmatter metadata. Designed for use with Claude Code.

### How it works

1. **Startup**: Scans your KB directory, parses YAML frontmatter from all `.md` files, builds an in-memory index
2. **Search**: `kb_search` does weighted keyword matching against frontmatter fields
3. **Browse**: `kb_list` paginates through all entries
4. **Read**: `kb_read` loads the full content of a specific file

Only frontmatter metadata is loaded during search/browse — full file content is loaded on demand, saving tokens.

### Setup

```bash
cd mcp-kb-server
npm install
```

### Configure in Claude Code

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/mcp-kb-server/src/index.ts"],
      "env": {
        "KB_DIR": "/absolute/path/to/your/knowledge-base"
      }
    }
  }
}
```

### Tools

#### `kb_search(query, page?, size?)`

Search the KB by keywords. Returns paginated frontmatter entries ranked by relevance.

- `query` — space-separated search terms
- `page` — page number, default 1
- `size` — results per page, default 15

#### `kb_list(page?, size?)`

Browse all KB entries paginated. No search filter.

#### `kb_read(path)`

Read the full content of a specific KB file by its relative path.

#### `kb_stats()`

Get KB statistics: total files, how many have keywords/descriptions.

### KB File Format

Each markdown file should have YAML frontmatter with these fields:

```markdown
---
title: "Short Title"
description: "1-2 sentence summary of what this document covers"
read_when:
  - When the user asks about X
  - When debugging Y
  - When configuring Z
keywords:
  - synonym1
  - synonym2
  - common-search-term
---

# Full document content here
...
```

| Field | Purpose | Search Weight |
|-------|---------|--------------|
| `title` | Display name | 2x |
| `description` | Brief summary | 1x |
| `read_when` | Natural language scenarios | 1x |
| `keywords` | Curated search terms | 3x |

**Key insight**: `keywords` bridges the vocabulary gap. If a user asks about "login" but your frontmatter only says "OAuth2 authentication", add "login" to keywords.
