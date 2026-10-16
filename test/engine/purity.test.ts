import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "engine");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const NODE_IMPORT = /(from|import)\s*\(?\s*["'](node:|crypto|fs|path|os|child_process)/;
const AMBIENT_ENTROPY = /Math\.random|Date\.now|new Date\(|performance\.now|crypto\./;

function offenders(pattern: RegExp): string[] {
  return sourceFiles(ENGINE_DIR).filter((path) => pattern.test(readFileSync(path, "utf8")));
}

describe("engine purity", () => {
  it("detects the forbidden patterns it guards against", () => {
    expect(NODE_IMPORT.test("import { randomBytes } from \"node:crypto\";")).toBe(true);
    expect(NODE_IMPORT.test("const fs = await import(\"fs\");")).toBe(true);
    expect(AMBIENT_ENTROPY.test("const x = Math.random();")).toBe(true);
  });

  it("never imports node built-ins, so it runs in the browser", () => {
    expect(offenders(NODE_IMPORT)).toEqual([]);
  });

  it("never reads ambient time or entropy", () => {
    expect(offenders(AMBIENT_ENTROPY)).toEqual([]);
  });
});
