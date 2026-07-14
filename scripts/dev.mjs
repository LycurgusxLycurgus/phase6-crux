import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["./node_modules/convex/bin/main.js", "dev"], { stdio: "inherit" }),
  spawn(process.execPath, ["./node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!closing && signal === null && code !== 0) close(code ?? 1);
  });
}

process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
