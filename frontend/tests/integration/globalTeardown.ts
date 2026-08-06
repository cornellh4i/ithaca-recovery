import { stopTestPostgres } from "../postgres/embeddedPostgres";

export default async function globalTeardown(): Promise<void> {
  await stopTestPostgres();
}
