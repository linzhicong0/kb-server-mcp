import type { KBEntry } from "./types.js";

/**
 * Return a deduplicated, sorted list of every layer across all KB entries.
 * Formatted as a prompt-ready string that instructs the agent on next steps.
 */
export function formatAllLayers(index: KBEntry[]): string {
  const all = new Set<string>();
  for (const entry of index) {
    all.add(entry.layer.toLowerCase().trim());
  }
  const sorted = [...all].sort();

  return [
    `Knowledge base contains ${index.length} ${index.length === 1 ? "file" : "files"} across ${sorted.length} ${sorted.length === 1 ? "layer" : "layers"}.`,
    "",
    "REQUIRED WORKFLOW — you MUST follow these steps in order:",
    "  Step 1. kb_list_layers                      ← you are here",
    "  Step 2. kb_list_keywords(layer?)             ← pick a layer (or omit for all), discover keywords",
    "  Step 3. kb_list_frontmatter_by_keywords(keywords) ← narrow down to relevant files",
    "  Step 4. kb_read_file(filename)               ← load the full content of a specific file",
    "",
    "Available layers:",
    "",
    sorted.join(", "),
  ].join("\n");
}

/**
 * Return a deduplicated, sorted list of every keyword across KB entries,
 * optionally filtered by layer.
 * Formatted as a prompt-ready string that instructs the agent on next steps.
 */
export function formatAllKeywords(index: KBEntry[], layer?: string): string {
  const filtered = layer
    ? index.filter((e) => e.layer.toLowerCase().trim() === layer.toLowerCase().trim())
    : index;

  const all = new Set<string>();
  for (const entry of filtered) {
    for (const kw of entry.keywords) {
      all.add(kw.toLowerCase().trim());
    }
  }
  const sorted = [...all].sort();

  const layerInfo = layer ? ` in layer '${layer}'` : "";
  const fileCount = filtered.length;

  return [
    `Knowledge base contains ${fileCount} ${fileCount === 1 ? "file" : "files"}${layerInfo} and ${sorted.length} unique keywords.`,
    "",
    "REQUIRED WORKFLOW — you MUST follow these steps in order:",
    "  Step 1. kb_list_layers                      ← discover available layers",
    "  Step 2. kb_list_keywords(layer?)             ← you are here" + (layer ? ` (filtered by '${layer}')` : ""),
    "  Step 3. kb_list_frontmatter_by_keywords(keywords) ← pick relevant keywords from the list above",
    "  Step 4. kb_read_file(filename)               ← load the full content of a specific file",
    "",
    "Available keywords:",
    "",
    sorted.join(", "),
  ].join("\n");
}

/**
 * Return frontmatter (title, read_when, file path) for all entries whose
 * keywords list contains at least one of the provided keywords (exact, case-insensitive).
 */
export function formatEntriesByKeywords(index: KBEntry[], keywords: string[]): string {
  const terms = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

  if (terms.length === 0) {
    return "No keywords provided. Use kb_list_keywords to see available keywords.";
  }

  const matches = index.filter((entry) =>
    entry.keywords.some((kw) => terms.includes(kw.toLowerCase().trim())),
  );

  if (matches.length === 0) {
    return [
      `No entries found for: ${terms.join(", ")}`,
      "",
      "Use kb_list_keywords to see all available keywords.",
    ].join("\n");
  }

  const lines: string[] = [
    `Found ${matches.length} ${matches.length === 1 ? "entry" : "entries"} matching [${terms.join(", ")}]:`,
    "",
  ];

  for (const entry of matches) {
    lines.push(`• ${entry.title}`);
    lines.push(`  file: ${entry.relativePath}`);
    lines.push(`  layer: ${entry.layer}`);
    if (entry.read_when.length > 0) {
      lines.push(`  read when:`);
      for (const rw of entry.read_when) {
        lines.push(`    - ${rw}`);
      }
    }
    lines.push("");
  }

  lines.push("Next step: use kb_read_file(filename) to load the full content of a specific file.");
  return lines.join("\n");
}
