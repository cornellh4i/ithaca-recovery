import { spawn, ChildProcess } from "child_process";
import path from "path";

let serverProcess: ChildProcess | null = null;

// Spawns `next dev` directly with the test env passed in its own process.env,
// rather than relying on Playwright's webServer + a written env file (which
// races: webServer can start before global-setup.ts finishes writing it).
// Polls the server until it responds before resolving, so no test starts
// against a half-booted server.
export async function startNextDevServer(env: Record<string, string>, port: number): Promise<void> {
  const frontendRoot = path.resolve(__dirname, "../../..");
  serverProcess = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: frontendRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next.js dev server did not become ready at ${url} within 60s`);
}

export function stopNextDevServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}
