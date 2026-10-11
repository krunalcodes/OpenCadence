import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const apiEntry = args.find((arg) => !arg.startsWith("--")) ?? "dist/main.js";
const workerEntry = join(dirname(apiEntry), "worker.js");
const workerFlags = flags.filter((flag) => !flag.startsWith("--inspect"));

let stopping = false;
let failed = false;

const children = [
  spawn(process.execPath, [...flags, apiEntry], { stdio: "inherit" }),
  spawn(process.execPath, [...workerFlags, workerEntry], { stdio: "inherit" }),
];
const running = new Set(children);

function stop(signal) {
  stopping = true;
  for (const child of running) {
    child.kill(signal);
  }
}

for (const child of children) {
  child.on("exit", () => {
    running.delete(child);
    if (!stopping) {
      failed = true;
      stop("SIGTERM");
    }
    if (running.size === 0) {
      process.exit(failed ? 1 : 0);
    }
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
