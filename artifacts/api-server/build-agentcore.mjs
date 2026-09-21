import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);

const execFileAsync = promisify(execFile);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(artifactDir, "agentcore-output");
const bundlePath = path.join(outputDir, "app.js");
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
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
});

await execFileAsync("zip", ["-q", "-j", zipPath, bundlePath]);
process.stdout.write(`Created ${zipPath}\n`);