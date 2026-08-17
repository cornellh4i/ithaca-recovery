import { spawn, execFileSync, ChildProcess } from "child_process";
import path from "path";

let serverProcess: ChildProcess | null = null;

// Spawns `next dev` directly with the test env passed in its own process.env,
// rather than relying on Playwright's webServer + a written env file (which
// races: webServer can start before global-setup.ts finishes writing it).
// Polls the server until it responds before resolving, so no test starts
// against a half-booted server.
export async function startNextDevServer(env: Record<string, string>, port: number): Promise<void> {
  const frontendRoot = path.resolve(__dirname, "../../..");
  // Spawning `next dev` directly skips the package.json dev script's docs-content generation
  // step -- fine locally where the gitignored docsContent.generated.ts lingers from past runs,
  // but on CI's fresh checkout every /docs route 500s without it. Generate before booting.
  execFileSync("node", ["build-scripts/generate-docs-content.mjs"], { cwd: frontendRoot, stdio: "inherit" });
  serverProcess = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: frontendRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Keep inheriting output live (matches the old stdio: "inherit" behavior) while
  // also buffering the tail of it — if readiness never happens, the thrown error
  // below includes what `next dev` actually printed instead of a bare timeout.
  const outputTail: string[] = [];
  const capture = (chunk: Buffer) => {
    process.stdout.write(chunk);
    outputTail.push(chunk.toString());
    if (outputTail.length > 200) outputTail.shift();
  };
  serverProcess.stdout?.on("data", capture);
  serverProcess.stderr?.on("data", capture);

  let exitInfo: string | null = null;
  serverProcess.on("exit", (code, signal) => {
    exitInfo = `next dev exited early (code ${code}, signal ${signal})`;
  });

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exitInfo) throw new Error(`${exitInfo}\n--- last output ---\n${outputTail.join("")}`);
    try {
      // A single fetch() has no timeout of its own — on a cold first compile
      // it can hang well past our deadline (Next dev accepts the connection
      // immediately but doesn't respond until compilation finishes), which
      // previously defeated the deadline check below entirely. Bound each
      // attempt so the loop always gets to re-check the deadline.
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.status < 500) return;
      } finally {
        clearTimeout(abortTimer);
      }
    } catch {
      // not up yet (connection refused, or the 5s per-attempt abort above)
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Next.js dev server did not become ready at ${url} within 60s\n--- last output ---\n${outputTail.join("")}`,
  );
}

export function stopNextDevServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}
