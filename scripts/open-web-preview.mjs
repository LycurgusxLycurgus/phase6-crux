import { spawnSync } from "node:child_process";
import path from "node:path";

const label = process.argv[2] ?? "browser-integration";
const convexCli = path.join(process.cwd(), "node_modules", "convex", "bin", "main.js");
const seeded = spawnSync(process.execPath, [convexCli, "run", "webPreview:seedPreviewAccess", JSON.stringify({ label })], { encoding: "utf8" });

if (seeded.status !== 0) throw new Error("No se pudo crear el acceso efímero de prueba.");
const access = JSON.parse(seeded.stdout);
const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const opened = spawnSync(process.execPath, [npxCli, "--yes", "--package", "@playwright/cli", "playwright-cli", "-s=arqueidentidad", "open", access.url, "--headed"], { encoding: "utf8" });

if (opened.status !== 0) {
  const detail = `${opened.error?.message ?? ""}\n${opened.stdout ?? ""}\n${opened.stderr ?? ""}`.replace(/[A-Za-z0-9_-]{43}/g, "[REDACTED]");
  throw new Error(`Playwright no pudo abrir la aplicación. ${detail.trim()}`);
}
console.log("Sesión de navegador abierta con un enlace efímero (valor oculto).");
