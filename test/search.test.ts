import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatAllLayers, formatAllKeywords, formatEntriesByKeywords } from "../src/search.js";
import type { KBEntry } from "../src/types.js";

// ── Shared fixtures ──────────────────────────────────────────────────────────

const ALPHA: KBEntry = {
    relativePath: "alpha.md",
    title: "Alpha Document",
    description: "Describes the alpha feature",
    read_when: ["When working on alpha features", "When debugging alpha issues"],
    keywords: ["alpha", "feature", "core"],
    layer: "backend",
};

const BETA: KBEntry = {
    relativePath: "beta.md",
    title: "Beta Document",
    description: "Describes the beta feature",
    read_when: ["When working on beta features"],
    keywords: ["beta", "feature", "experimental"],
    layer: "default",
};

const DUP: KBEntry = {
    relativePath: "dup.md",
    title: "Duplicate Keywords",
    description: "",
    read_when: [],
    keywords: ["dup", "DUP", "Dup", "unique"],
    layer: "frontend",
};

const INDEX: KBEntry[] = [ALPHA, BETA, DUP];

// ── formatAllLayers ──────────────────────────────────────────────────────────

describe("formatAllLayers", () => {
    it("includes a header with file count and layer count", () => {
        const out = formatAllLayers(INDEX);
        assert.ok(out.includes("3 files"), "should mention 3 files");
        assert.ok(out.includes("3 layers"), "should mention 3 layers");
    });

    it("lists all unique layers sorted alphabetically", () => {
        const out = formatAllLayers(INDEX);
        assert.ok(out.includes("backend"));
        assert.ok(out.includes("default"));
        assert.ok(out.includes("frontend"));
    });

    it("deduplicates layers case-insensitively", () => {
        const entries: KBEntry[] = [
            { ...ALPHA, layer: "Backend" },
            { ...BETA, layer: "backend" },
        ];
        const out = formatAllLayers(entries);
        const matches = out.match(/\bbackend\b/gi) ?? [];
        assert.equal(matches.length, 1, "layer 'backend' should appear exactly once");
    });

    it("mentions the required 4-step workflow", () => {
        const out = formatAllLayers(INDEX);
        assert.ok(out.includes("kb_list_layers"));
        assert.ok(out.includes("kb_list_keywords"));
        assert.ok(out.includes("kb_list_frontmatter_by_keywords"));
        assert.ok(out.includes("kb_read_file"));
    });

    it("handles an empty index", () => {
        const out = formatAllLayers([]);
        assert.ok(out.includes("0 files"));
        assert.ok(out.includes("0 layers"));
    });

    it("handles a single entry", () => {
        const out = formatAllLayers([ALPHA]);
        assert.ok(out.includes("1 file"), "should use singular 'file'");
        assert.ok(out.includes("1 layer"), "should use singular 'layer'");
    });
});

// ── formatAllKeywords ────────────────────────────────────────────────────────

describe("formatAllKeywords", () => {
    it("includes a header with file count and keyword count", () => {
        const out = formatAllKeywords(INDEX);
        assert.ok(out.includes("3 files"), "should mention 3 files");
    });

    it("deduplicates keywords case-insensitively", () => {
        const out = formatAllKeywords(INDEX);
        // DUP entry has 'dup', 'DUP', 'Dup' — all should collapse to one 'dup'
        const matches = out.match(/\bdup\b/gi) ?? [];
        assert.equal(matches.length, 1, "keyword 'dup' should appear exactly once");
    });

    it("lists keywords in sorted alphabetical order", () => {
        const out = formatAllKeywords(INDEX);
        // Extract the keywords line (last non-empty line)
        const lines = out.split("\n").filter(Boolean);
        const kwLine = lines[lines.length - 1];
        const kws = kwLine.split(", ");
        assert.deepEqual(kws, [...kws].sort(), "keywords should be sorted");
    });

    it("includes all unique keywords from all entries when no layer given", () => {
        const out = formatAllKeywords(INDEX);
        const expected = ["alpha", "beta", "core", "dup", "experimental", "feature", "unique"];
        for (const kw of expected) {
            assert.ok(out.includes(kw), `keyword '${kw}' should be present`);
        }
    });

    it("filters keywords by layer", () => {
        const out = formatAllKeywords(INDEX, "backend");
        assert.ok(out.includes("alpha"), "alpha keyword should be present for backend layer");
        assert.ok(out.includes("core"), "core keyword should be present for backend layer");
        assert.ok(!out.includes("beta"), "beta keyword should NOT be present for backend layer");
        assert.ok(out.includes("1 file"), "should mention 1 file for backend layer");
    });

    it("layer filter is case-insensitive", () => {
        const out = formatAllKeywords(INDEX, "BACKEND");
        assert.ok(out.includes("alpha"), "should match with uppercase layer name");
    });

    it("returns empty keywords for unknown layer", () => {
        const out = formatAllKeywords(INDEX, "nonexistent");
        assert.ok(out.includes("0 files"), "should mention 0 files for unknown layer");
        assert.ok(out.includes("0 unique keywords"), "should mention 0 keywords for unknown layer");
    });

    it("mentions the required 4-step workflow", () => {
        const out = formatAllKeywords(INDEX);
        assert.ok(out.includes("kb_list_layers"));
        assert.ok(out.includes("kb_list_keywords"));
        assert.ok(out.includes("kb_list_frontmatter_by_keywords"));
        assert.ok(out.includes("kb_read_file"));
    });

    it("handles an empty index", () => {
        const out = formatAllKeywords([]);
        assert.ok(out.includes("0 files"));
        assert.ok(out.includes("0 unique keywords"));
    });

    it("handles a single entry", () => {
        const out = formatAllKeywords([ALPHA]);
        assert.ok(out.includes("1 file"), "should use singular 'file'");
    });
});

// ── formatEntriesByKeywords ──────────────────────────────────────────────────

describe("formatEntriesByKeywords", () => {
    it("returns entries that match any of the given keywords", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha"]);
        assert.ok(out.includes("Alpha Document"));
        assert.ok(!out.includes("Beta Document"));
    });

    it("matches across multiple entries when multiple keywords given", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha", "beta"]);
        assert.ok(out.includes("Alpha Document"));
        assert.ok(out.includes("Beta Document"));
    });

    it("matching is case-insensitive", () => {
        const out = formatEntriesByKeywords(INDEX, ["ALPHA"]);
        assert.ok(out.includes("Alpha Document"));
    });

    it("includes file path in output", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha"]);
        assert.ok(out.includes("alpha.md"));
    });

    it("includes layer in output", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha"]);
        assert.ok(out.includes("layer: backend"));
    });

    it("includes read_when triggers when present", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha"]);
        assert.ok(out.includes("When working on alpha features"));
        assert.ok(out.includes("When debugging alpha issues"));
    });

    it("omits read_when section when entry has none", () => {
        const out = formatEntriesByKeywords(INDEX, ["dup"]);
        assert.ok(!out.includes("read when:"));
    });

    it("returns no-match message when keyword has no entries", () => {
        const out = formatEntriesByKeywords(INDEX, ["nonexistent"]);
        assert.ok(out.includes("No entries found for: nonexistent"));
        assert.ok(out.includes("kb_list_keywords"));
    });

    it("returns prompt message when keyword list is empty", () => {
        const out = formatEntriesByKeywords(INDEX, []);
        assert.ok(out.includes("No keywords provided"));
    });

    it("returns prompt message when keyword list contains only whitespace", () => {
        const out = formatEntriesByKeywords(INDEX, ["  ", ""]);
        assert.ok(out.includes("No keywords provided"));
    });

    it("shared keyword 'feature' matches both alpha and beta", () => {
        const out = formatEntriesByKeywords(INDEX, ["feature"]);
        assert.ok(out.includes("Alpha Document"));
        assert.ok(out.includes("Beta Document"));
        assert.ok(out.includes("Found 2 entries"));
    });

    it("output ends with a next-step hint", () => {
        const out = formatEntriesByKeywords(INDEX, ["alpha"]);
        assert.ok(out.includes("kb_read_file"));
    });
});
