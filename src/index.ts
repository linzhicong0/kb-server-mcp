#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { scanKB } from "./scanner.js";
import { formatAllKeywords, formatEntriesByKeywords } from "./search.js";
import type { KBEntry } from "./types.js";

const KB_DIR = process.env.KB_DIR ?? "./knowledge-base";
const TRANSPORT = (process.env.TRANSPORT ?? "stdio") as "stdio" | "http" | "sse";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ─── Build in-memory index at startup ───

let index: KBEntry[] = [];
let kbAbsDir = "";

function rebuildIndex(): void {
  kbAbsDir = path.resolve(KB_DIR);
  const startTime = Date.now();
  index = scanKB(kbAbsDir);
  const elapsed = Date.now() - startTime;
  console.error(`[kb] Indexed ${index.length} files from ${kbAbsDir} in ${elapsed}ms`);
}

rebuildIndex();

// ─── File watcher (optional, debounced) ───

let watchTimeout: ReturnType<typeof setTimeout> | undefined;
try {
  fs.watch(kbAbsDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith(".md")) return;
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
      console.error(`[kb] Change detected (${filename}), rebuilding index...`);
      rebuildIndex();
    }, 2000);
  });
  console.error(`[kb] Watching ${kbAbsDir} for changes`);
} catch {
  console.error(`[kb] File watching not available for ${kbAbsDir}`);
}

// ─── MCP Server factory ───
// Creates a fresh McpServer bound to the current in-memory index.
// Called once for stdio, and once per HTTP/SSE session for other transports.

function createServer(): McpServer {
  const server = new McpServer({ name: "kb", version: "1.0.0" });

  server.tool(
    "kb_list_keywords",
    `ALWAYS call this tool first before any other KB tool.
Returns every keyword available in the knowledge base, plus a required 3-step
workflow you must follow:
  Step 1 — kb_list_keywords            (this tool) discover available keywords
  Step 2 — kb_list_frontmatter_by_keywords   narrow down to relevant files
  Step 3 — kb_read_file                load the full content of a chosen file
Do NOT skip steps or call kb_read_file without first completing steps 1 and 2.`,
    {},
    async () => {
      const text = formatAllKeywords(index);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "kb_list_frontmatter_by_keywords",
    `Step 2 of the required KB workflow. Call this after kb_list_keywords.
Accepts one or more keywords and returns the title, file path, and read_when
triggers of every KB file that matches at least one keyword.
Use the returned file paths with kb_read_file to load the full content.`,
    {
      keywords: z
        .array(z.string())
        .describe("One or more keywords from kb_list_keywords to filter KB entries"),
    },
    async ({ keywords }) => {
      const text = formatEntriesByKeywords(index, keywords);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "kb_read_file",
    `Step 3 of the required KB workflow. Call this after kb_list_frontmatter_by_keywords.
Loads the complete markdown content of a single KB file by its relative filename.
Only the frontmatter and body of the requested file are returned — no index data —
keeping token usage minimal.`,
    {
      filename: z
        .string()
        .describe("Relative filename of the KB file as returned by kb_list_frontmatter_by_keywords (e.g. api-design.md)"),
    },
    async ({ filename }) => {
      const sanitized = filename.replace(/\.\./g, "").replace(/\\/g, "/");
      const fullPath = path.join(kbAbsDir, sanitized);

      if (!fullPath.startsWith(kbAbsDir)) {
        return {
          content: [{ type: "text", text: `Error: path escapes KB directory: ${filename}` }],
          isError: true,
        };
      }

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch {
        return {
          content: [{ type: "text", text: `Error: file not found: ${filename}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ─── Transport: stdio (default) ───

async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[kb] stdio transport ready — ${index.length} files indexed`);
}

// ─── Transport: HTTP (Streamable HTTP, MCP 2025-03-26) ───
// Endpoint: POST/GET/DELETE /mcp
// Session ID is sent by the server in the mcp-session-id response header and
// must be echoed back by the client in subsequent requests.

async function startHttp(): Promise<void> {
  const app = createMcpExpressApp();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await createServer().connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ error: "Invalid or missing mcp-session-id header" });
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.error(`[kb] HTTP MCP server (Streamable HTTP) listening on http://127.0.0.1:${PORT}/mcp`);
    console.error(`[kb] ${index.length} files indexed`);
  });

  process.on("SIGINT", async () => {
    for (const t of transports.values()) await t.close().catch(() => { });
    process.exit(0);
  });
}

// ─── Transport: SSE (legacy, MCP 2024-11-05) ───
// Two endpoints: GET /sse establishes the stream; POST /messages sends messages.

async function startSse(): Promise<void> {
  const app = createMcpExpressApp();
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => transports.delete(transport.sessionId);
    await createServer().connect(transport);
    console.error(`[kb] SSE session opened: ${transport.sessionId}`);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query["sessionId"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.listen(PORT, () => {
    console.error(`[kb] SSE MCP server (legacy 2024-11-05 protocol) listening on http://127.0.0.1:${PORT}/sse`);
    console.error(`[kb] POST messages to http://127.0.0.1:${PORT}/messages?sessionId=<id>`);
    console.error(`[kb] ${index.length} files indexed`);
  });

  process.on("SIGINT", async () => {
    for (const t of transports.values()) await t.close().catch(() => { });
    process.exit(0);
  });
}

// ─── Start ───

async function main() {
  switch (TRANSPORT) {
    case "http":
      await startHttp();
      break;
    case "sse":
      await startSse();
      break;
    default:
      await startStdio();
  }
}

main().catch((err) => {
  console.error("[kb] Fatal:", err);
  process.exit(1);
});
