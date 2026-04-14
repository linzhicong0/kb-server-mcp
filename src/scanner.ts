import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { KBEntry } from "./types.js";

/**
 * Extract YAML frontmatter block from markdown content.
 * Returns the parsed frontmatter object and the body (content after ---).
 */
function parseFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }
  const yamlBlock = trimmed.slice(4, end);
  const body = trimmed.slice(end + 4).trim();
  try {
    const parsed = YAML.parse(yamlBlock);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { frontmatter: {}, body };
    }
    return { frontmatter: parsed as Record<string, unknown>, body };
  } catch {
    return { frontmatter: {}, body };
  }
}

function toStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Recursively walk a directory and return all .md file paths.
 */
function walkMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory might not exist yet
  }
  return results.toSorted();
}

/**
 * Scan a KB directory, parse all markdown files, build an in-memory index.
 */
export function scanKB(kbDir: string): KBEntry[] {
  const absDir = path.resolve(kbDir);
  const files = walkMarkdownFiles(absDir);
  const entries: KBEntry[] = [];

  for (const fullPath of files) {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const relativePath = path.relative(absDir, fullPath).replace(/\\/g, "/");

      entries.push({
        relativePath,
        title: toString(frontmatter.title) || path.basename(relativePath, ".md"),
        description: toString(frontmatter.description),
        read_when: toStringList(frontmatter.read_when),
        keywords: toStringList(frontmatter.keywords),
        layer: toString(frontmatter.layer) || "default",
      });
    } catch {
      // skip unreadable files
    }
  }

  return entries;
}
