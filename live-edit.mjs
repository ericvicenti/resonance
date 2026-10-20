import { watch } from "node:fs";
import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";

const root = fileURLToPath(new URL(".", import.meta.url));
const statusDir = join(root, ".live-edit");
await mkdir(statusDir, { recursive: true });
const pending = new Set();
let running = false,
  timer,
  closing = false;
function log(message) {
  console.log(new Date().toISOString(), message);
}
async function status(ok, message, files = []) {
  log(message);
  await writeFile(
    join(statusDir, "status.json"),
    JSON.stringify(
      { ok, message, files, updatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}
function command(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: process.env });
    if (input !== undefined) child.stdin.end(input);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (v) => (stdout += v));
    child.stderr.on("data", (v) => (stderr += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${executable} exited ${code}: ${stderr.trim()}`)),
    );
  });
}
// ssh -f returns only after forwarding has been established (ExitOnForwardFailure).
const socket = join(statusDir, "ssh.sock");
async function connect() {
  try {
    await command("/usr/bin/ssh", ["-S", socket, "-O", "check", "clipper"]);
  } catch {
    await unlink(socket).catch(() => {});
    await command("/usr/bin/ssh", [
      "-M",
      "-S",
      socket,
      "-fNT",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=2",
      "-L",
      "127.0.0.1:19227:127.0.0.1:9227",
      "clipper",
    ]);
  }
  return chromium.connectOverCDP("http://127.0.0.1:19227", { timeout: 10000 });
}
async function apply(files) {
  const browser = await connect();
  try {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith("http://localhost:8765"));
    if (!page)
      throw Error(
        "Open Resonance on Clipper with start.command to resume live editing.",
      );
    const reload = files.some((f) =>
      ["dist/index.html", "dist/app.js"].includes(f),
    );
    if (reload) {
      await page.reload();
      await page.waitForFunction(() => window.resonance?.snapshot().frames > 2);
      return "App reloaded. Reconnect computer audio in the browser if needed.";
    }
    const changed = files.filter((f) =>
      [
        "dist/visual.js",
        "dist/lib/resonance.js",
        "dist/presets.js",
        "dist/audio-features.js",
        "dist/style.css",
      ].includes(f),
    );
    if (!changed.length) return "Files synced to Clipper.";
    await page.evaluate(async (files) => {
      const version = Date.now();
      const previousDefinition = window.Resonance?.definition;
      try {
        for (const name of [
          "audio-features.js",
          "lib/resonance.js",
          "presets.js",
          "visual.js",
        ]) {
          if (!files.includes("dist/" + name)) continue;
          if (name === "visual.js") {
            await window.Resonance.loadScene("visual.js?live=" + version);
            continue;
          }
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = name + "?live=" + version;
            const failed = (event) => {
              if (event.filename === script.src) {
                cleanup();
                reject(Error(event.message));
              }
            };
            const cleanup = () => {
              window.removeEventListener("error", failed);
              script.remove();
            };
            window.addEventListener("error", failed);
            script.onload = () => {
              cleanup();
              resolve();
            };
            script.onerror = () => {
              cleanup();
              reject(Error("Could not load " + name));
            };
            document.head.append(script);
          });
        }
        if (files.includes("dist/audio-features.js") && session?.analyzer) {
          const active = session,
            features = new window.ResonanceFeatures();
          features.beats = state.beats;
          features.lastBeat = state.beatTime;
          active.analyzer._m.callback = (f) => {
            if (session !== active) return;
            Object.assign(
              state,
              features.update(
                f,
                active.context.sampleRate,
                performance.now() / 1000,
              ),
            );
            state.callbacks++;
          };
        }
        if (
          files.some((file) =>
            [
              "dist/visual.js",
              "dist/lib/resonance.js",
              "dist/presets.js",
              "dist/audio-features.js",
            ].includes(file),
          )
        )
          window.resonanceReloadVisual();
        if (files.includes("dist/style.css"))
          await new Promise((resolve, reject) => {
            const link = document.querySelector('link[rel="stylesheet"]');
            link.onload = resolve;
            link.onerror = () => reject(Error("Could not load styles"));
            link.href = "style.css?live=" + version;
          });
        document.getElementById("live-edit-error")?.remove();
        window.resonanceLiveEdit = {
          updatedAt: new Date().toISOString(),
          files,
        };
      } catch (error) {
        if (window.Resonance) window.Resonance.definition = previousDefinition;
        throw error;
      }
    }, changed);
    return "Live updated " + changed.join(", ") + "; audio capture preserved.";
  } finally {
    await browser.close();
  }
}
async function flush() {
  if (running || closing) return;
  running = true;
  try {
    while (pending.size) {
      const files = [];
      for (const file of pending) {
        if (
          await stat(join(root, file)).then(
            (value) => value.isFile(),
            () => false,
          )
        )
          files.push(file);
      }
      pending.clear();
      if (!files.length) continue;
      try {
        for (const file of files)
          if (file.endsWith(".js") || file.endsWith(".mjs"))
            await command(
              process.execPath,
              [
                "--check",
                "--input-type=" +
                  (file.endsWith(".mjs") ? "module" : "commonjs"),
              ],
              await readFile(join(root, file), "utf8"),
            );
        if (
          files.some((file) =>
            ["dist/visual.js", "dist/resonance.d.ts", "jsconfig.json"].includes(
              file,
            ),
          )
        )
          await command(process.execPath, [
            join(root, "node_modules/typescript/bin/tsc"),
            "-p",
            "jsconfig.json",
          ]);
        await command("/usr/bin/rsync", [
          "-az",
          "--exclude=node_modules",
          "--exclude=.live-edit",
          "--exclude=.git",
          "--exclude=.DS_Store",
          root,
          "clipper:Code/Resonance/",
        ]);
        await status(true, await apply(files), files);
      } catch (error) {
        await status(false, error.message, files);
        // Leave the active page and audio intact; the next save retries the failed update.
        files.forEach((f) => pending.add(f));
        break;
      }
    }
  } finally {
    running = false;
  }
}
const watcher = watch(root, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const file = filename.toString();
  if (
    file === "node_modules" ||
    file === ".live-edit" ||
    file === ".git" ||
    file === ".vscode" ||
    file.startsWith("node_modules/") ||
    file.startsWith(".live-edit/") ||
    file.startsWith(".git/") ||
    file.startsWith(".vscode/") ||
    file.endsWith("~") ||
    file.includes(".DS_Store")
  )
    return;
  pending.add(file);
  clearTimeout(timer);
  timer = setTimeout(flush, 120);
});
async function shutdown() {
  if (closing) return;
  closing = true;
  watcher.close();
  clearTimeout(timer);
  await command("/usr/bin/ssh", ["-S", socket, "-O", "exit", "clipper"]).catch(
    () => {},
  );
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
pending.add("dist/lib/resonance.js");
pending.add("dist/presets.js");
pending.add("dist/visual.js");
pending.add("dist/audio-features.js");
pending.add("dist/style.css");
await flush();
log("Watching " + root + " → Clipper. Save a file to update.");
