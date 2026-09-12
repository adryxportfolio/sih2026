#!/usr/bin/env node
/**
 * One command to bring the whole demo up.
 *
 *   node scripts/start.mjs
 *
 * The setup has three parts that each need to agree about one thing — the
 * address of this machine on the local network — and every painful failure in
 * this project has come from one of them disagreeing. The phone cannot reach
 * the laptop's loopback; a container cannot reach the host's 127.0.0.1; and
 * Better Auth refuses a sign-in whose origin does not match its configured URL,
 * with an error that never mentions origins. So this resolves the address once
 * and writes it everywhere, rather than asking anyone to keep four files in
 * sync by hand.
 *
 * Safe to re-run. It edits values in place and leaves everything else alone.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE = process.argv.includes("--native");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
};
const step = (s) => console.log(`\n${c.bold("▸")} ${c.bold(s)}`);
const info = (s) => console.log(`  ${s}`);
const good = (s) => console.log(`  ${c.ok("✓")} ${s}`);
const warn = (s) => console.log(`  ${c.warn("!")} ${s}`);

/**
 * This machine's address on the local network.
 *
 * Prefers a private range on a non-virtual interface: Docker Desktop and WSL
 * both add adapters whose addresses route nowhere useful from a phone, and
 * picking one of those produces a setup that looks correct and cannot connect.
 */
function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|vEthernet|WSL|Loopback|utun|llw|awdl)/i.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const priv =
        a.address.startsWith("192.168.") ||
        a.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a.address);
      if (priv) candidates.push({ name, address: a.address });
    }
  }
  return candidates[0]?.address;
}

function setEnv(file, updates) {
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
  }
  writeFileSync(file, text);
}

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const has = (cmd, args = ["--version"]) => {
  const r = spawnSync(cmd, args, { stdio: "ignore", shell: process.platform === "win32" });
  return r.status === 0;
};

// ── 1. Prerequisites ────────────────────────────────────────────────────────
step("Checking prerequisites");
const missing = [];
if (!has("node")) missing.push("Node");
if (!NATIVE && !has("docker")) missing.push("Docker Desktop");
if (missing.length) {
  console.log(c.err(`\n  Missing: ${missing.join(", ")}`));
  console.log("  Install them, then run this again.\n");
  process.exit(1);
}
good(`Node ${process.version}`);
if (!NATIVE) {
  const up = spawnSync("docker", ["info"], { stdio: "ignore", shell: process.platform === "win32" });
  if (up.status !== 0) {
    console.log(c.err("\n  Docker is installed but not running. Start Docker Desktop, then re-run.\n"));
    process.exit(1);
  }
  good("Docker is running");
}

// ── 2. Env files ────────────────────────────────────────────────────────────
step("Checking configuration");
const rootEnv = join(root, ".env");
const wsEnv = join(root, "workspace", ".env");
for (const [file, example] of [[rootEnv, join(root, ".env.example")], [wsEnv, join(root, "workspace", ".env.example")]]) {
  if (!existsSync(file)) {
    copyFileSync(example, file);
    warn(`Created ${file.replace(root, ".")} from the example — fill in the Supabase keys.`);
  }
}
const ws = readEnv(wsEnv);
for (const key of ["BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "SANDBOX_SUPERVISOR_TOKEN", "SCREEN_PROXY_SECRET"]) {
  if (!ws[key] || ws[key].startsWith("replace-with")) {
    const { randomBytes } = await import("node:crypto");
    setEnv(wsEnv, { [key]: randomBytes(32).toString("hex") });
    good(`Generated ${key}`);
  }
}
if (!ws.POSTGRES_PASSWORD) {
  const { randomBytes } = await import("node:crypto");
  setEnv(wsEnv, { POSTGRES_PASSWORD: randomBytes(16).toString("hex") });
  good("Generated POSTGRES_PASSWORD");
}

// ── 3. Network ──────────────────────────────────────────────────────────────
step("Resolving this machine's address");
const lan = lanAddress();
if (!lan) {
  warn("No private network address found — the phone will not be able to connect.");
  warn("Connect to wifi (or a phone hotspot) and run this again.");
} else {
  good(`${lan}  ${c.dim("(the phone will use this)")}`);
}
const host = lan ?? "127.0.0.1";

setEnv(wsEnv, {
  API_HOST: "0.0.0.0",
  API_URL: `http://${host}:3100`,
  WEB_ORIGIN: `http://${host}:5173`,
  // Better Auth matches the request origin against this. On loopback while the
  // phone uses the LAN address, every sign-in fails with a CORS error that
  // never says "wrong origin".
  BETTER_AUTH_URL: `http://${host}:5173`,
  SIGNUPS_ENABLED: "false",
  SAMIKSHA_COMPUTER_MEMORY: ws.SAMIKSHA_COMPUTER_MEMORY || "2g",
  SAMIKSHA_COMPUTER_CPUS: ws.SAMIKSHA_COMPUTER_CPUS || "2",
  SAMIKSHA_COMPUTER_PIDS_LIMIT: ws.SAMIKSHA_COMPUTER_PIDS_LIMIT || "512",
  // Native runs reach the model on loopback; containers must go via the host.
  SAMIKSHA_LOCAL_MODELS_URL: NATIVE
    ? "http://127.0.0.1:11434/v1"
    : "http://host.docker.internal:11434/v1",
});
setEnv(rootEnv, { EXPO_PUBLIC_WORKSPACE_URL: `http://${host}:5173` });
good("Wrote the address into the workspace and mobile configuration");

spawnSync(process.execPath, [join(root, "scripts", "sync-env.mjs")], { stdio: "ignore" });
good("Synced client-safe values into mobile/.env");

// ── 4. Model server ─────────────────────────────────────────────────────────
step("Checking the model server");
const modelId = ws.PI_DEFAULT_MODEL || "qwen3:1.7b";
try {
  const res = await fetch("http://127.0.0.1:11434/v1/models", { signal: AbortSignal.timeout(2500) });
  const body = await res.json();
  const ids = (body.data ?? []).map((m) => m.id);
  if (ids.includes(modelId)) good(`${modelId} is being served`);
  else {
    warn(`Serving ${ids.length ? ids.join(", ") : "nothing"} — but configured for ${modelId}.`);
    warn(`Run:  ollama pull ${modelId}`);
  }
} catch {
  warn("No model server on port 11434.");
  warn("Run  ollama serve  in another terminal, then re-run this.");
  warn("Everything else will still start; agents just cannot think yet.");
}

// ── 5. Start ────────────────────────────────────────────────────────────────
step(NATIVE ? "Starting services" : "Starting services in Docker");
console.log(c.dim("  First run builds images and takes a few minutes.\n"));

const wsDir = join(root, "workspace");
const child = NATIVE
  ? spawn("pnpm", ["dev"], { cwd: wsDir, stdio: "inherit", shell: process.platform === "win32" })
  : spawn(
      "docker",
      ["compose", "--env-file", ".env", "-f", "infra/compose/docker-compose.yml", "up", "--build"],
      {
        cwd: wsDir,
        stdio: "inherit",
        shell: process.platform === "win32",
        env: { ...process.env, BIND_HOST: "0.0.0.0" },
      },
    );

console.log(c.bold("\n  Once it settles:\n"));
console.log(`    Workspace      ${c.bold(`http://${host}:5173`)}`);
console.log(`    On the phone   open the app and tap the mascot`);
console.log(`    Sign in        with an account an administrator created\n`);

child.on("exit", (code) => process.exit(code ?? 0));
