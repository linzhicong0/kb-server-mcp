import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanKB } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

describe("scanKB", () => {
    it("returns one entry per markdown file", () => {
        const entries = scanKB(FIXTURES);
        // alpha.md, beta.md, dup-keywords.md, no-frontmatter.md
        assert.equal(entries.length, 4);
    });

    it("entries are sorted by relative path", () => {
        const entries = scanKB(FIXTURES);
        const paths = entries.map((e) => e.relativePath);
        assert.deepEqual(paths, [...paths].sort());
    });

    it("parses title, description, read_when, keywords, layer from frontmatter", () => {
        const entries = scanKB(FIXTURES);
        const alpha = entries.find((e) => e.relativePath === "alpha.md");
        assert.ok(alpha, "alpha.md should be in index");
        assert.equal(alpha.title, "Alpha Document");
        assert.equal(alpha.description, "Describes the alpha feature");
        assert.deepEqual(alpha.read_when, [
            "When working on alpha features",
            "When debugging alpha issues",
        ]);
        assert.deepEqual(alpha.keywords, ["alpha", "feature", "core"]);
        assert.equal(alpha.layer, "backend");
    });

    it("defaults layer to 'default' when not present in frontmatter", () => {
        const entries = scanKB(FIXTURES);
        const beta = entries.find((e) => e.relativePath === "beta.md");
        assert.ok(beta, "beta.md should be in index");
        assert.equal(beta.layer, "default");
    });

    it("defaults layer to 'default' when no frontmatter exists", () => {
        const entries = scanKB(FIXTURES);
        const noFm = entries.find((e) => e.relativePath === "no-frontmatter.md");
        assert.ok(noFm, "no-frontmatter.md should be in index");
        assert.equal(noFm.title, "no-frontmatter");
        assert.equal(noFm.description, "");
        assert.deepEqual(noFm.read_when, []);
        assert.deepEqual(noFm.keywords, []);
        assert.equal(noFm.layer, "default");
    });

    it("returns empty array for a non-existent directory", () => {
        const entries = scanKB("/tmp/does-not-exist-kb-xyz");
        assert.deepEqual(entries, []);
    });

    it("relativePath uses forward slashes", () => {
        const entries = scanKB(FIXTURES);
        for (const entry of entries) {
            assert.ok(!entry.relativePath.includes("\\"), `path should not contain backslashes: ${entry.relativePath}`);
        }
    });
});
