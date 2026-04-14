#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// SSEServerTransport is intentionally kept for the legacy MCP 2024-11-05 SSE transport mode.
// There is no non-deprecated alternative for this protocol; StreamableHTTPServerTransport
// implements a different (newer) protocol and cannot replace it for older clients.
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { scanKB } from "./scanner.js";
import { formatAllLayers, formatAllKeywords, formatEntriesByKeywords } from "./search.js";
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

  server.registerTool(
    "kb_list_layers",
    {
      description:
        `ALWAYS call this tool first before any other KB tool.\n` +
        `Returns every layer available in the knowledge base, plus a required 4-step\n` +
        `workflow you must follow:\n` +
        `  Step 1 — kb_list_layers               (this tool) discover available layers\n` +
        `  Step 2 — kb_list_keywords             discover keywords, optionally filtered by layer\n` +
        `  Step 3 — kb_list_frontmatter_by_keywords   narrow down to relevant files\n` +
        `  Step 4 — kb_read_file                 load the full content of a chosen file\n` +
        `Do NOT skip steps or call kb_read_file without first completing steps 1–3.`,
    },
    async () => {
      const text = formatAllLayers(index);
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "kb_list_keywords",
    {
      description:
        `Step 2 of the required KB workflow. Call this after kb_list_layers.\n` +
        `Returns every keyword available in the knowledge base, optionally filtered by layer.\n` +
        `If no layer is provided, keywords from all layers are returned.\n` +
        `Pick relevant keywords and use them with kb_list_frontmatter_by_keywords.`,
      inputSchema: {
        layer: z
          .string()
          .optional()
          .describe("Optional layer name from kb_list_layers to filter keywords (e.g. 'backend'). Omit to see keywords from all layers."),
      },
    },
    async ({ layer }) => {
      const text = formatAllKeywords(index, layer);
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "kb_list_frontmatter_by_keywords",
    {
      description:
        `Step 3 of the required KB workflow. Call this after kb_list_keywords.\n` +
        `Accepts one or more keywords and returns the title, file path, layer, and read_when\n` +
        `triggers of every KB file that matches at least one keyword.\n` +
        `Use the returned file paths with kb_read_file to load the full content.`,
      inputSchema: {
        keywords: z
          .array(z.string())
          .describe("One or more keywords from kb_list_keywords to filter KB entries"),
      },
    },
    async ({ keywords }) => {
      const text = formatEntriesByKeywords(index, keywords);
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "kb_read_file",
    {
      description:
        `Step 4 of the required KB workflow. Call this after kb_list_frontmatter_by_keywords.\n` +
        `Loads the complete markdown content of a single KB file by its relative filename.\n` +
        `Only the frontmatter and body of the requested file are returned — no index data —\n` +
        `keeping token usage minimal.`,
      inputSchema: {
        filename: z
          .string()
          .describe("Relative filename of the KB file as returned by kb_list_frontmatter_by_keywords (e.g. api-design.md)"),
      },
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
