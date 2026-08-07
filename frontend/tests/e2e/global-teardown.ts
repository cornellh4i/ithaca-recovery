import { stopTestPostgres } from "../postgres/embeddedPostgres";
import { stopNextDevServer } from "./support/serverProcess";

export default async function globalTeardown(): Promise<void> {
  stopNextDevServer();
  await stopTestPostgres();
}
