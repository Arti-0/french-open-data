/* global process, Response */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = mkdtempSync(join(tmpdir(), "french-open-data-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  const pack = JSON.parse(execFileSync(npm, ["pack", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }));
  const archive = join(process.cwd(), (Array.isArray(pack) ? pack[0] : pack["french-open-data"]).filename);
  try {
    execFileSync(npm, ["install", "--prefix", temp, "--ignore-scripts", "--offline", archive], {
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    const installed = join(temp, "node_modules", "french-open-data");
    const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    assert.equal(manifest.exports["."].import, "./dist/index.js");
    const { RechercheEntreprisesClient } = await import(pathToFileURL(join(installed, "dist", "index.js")).href);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      results: [
        { siren: "111222333", nom_complet: "Visible", statut_diffusion: "O" },
        { siren: "444555666", nom_complet: "Protected", statut_diffusion: "P" },
      ],
      total_results: 2,
    }), { headers: { "content-type": "application/json" } });
    try {
      const result = await new RechercheEntreprisesClient().search({ query: "test" });
      assert.equal(result.records.length, 1);
      assert.equal(result.maskedCount, 1);
      assert.equal(result.records[0].provenance.sourceRecordId, "111222333");
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    rmSync(archive, { force: true });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
