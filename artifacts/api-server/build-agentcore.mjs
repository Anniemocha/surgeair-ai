import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

globalThis.require = createRequire(import.meta.url);

const execFileAsync = promisify(execFile);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(artifactDir, "agentcore-output");
const bundlePath = path.join(outputDir, "app.js");
const packagePath = path.join(outputDir, "package.json");
const zipPath = path.join(outputDir, "surgeair-agentcore.zip");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.join(artifactDir, "src/agentcore/app.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: bundlePath,
  minify: true,
  sourcemap: false,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.AWS_BEARER_TOKEN_BEDROCK": "undefined",
  },
  external: [
    "*.node",
    "fsevents",
    "sharp",
    "better-sqlite3",
    "sqlite3",
    "canvas",
    "bcrypt",
    "argon2",
  ],
});

await writeFile(packagePath, '{"type":"commonjs"}\n');
await execFileAsync("zip", [
  "-q",
  "-j",
  zipPath,
  bundlePath,
  packagePath,
]);
process.stdout.write(`Created ${zipPath}\n`);