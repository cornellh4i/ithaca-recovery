import { stopTestMongo } from "../mongo/replicaSet";
import { stopNextDevServer } from "./support/serverProcess";

export default async function globalTeardown(): Promise<void> {
  stopNextDevServer();
  await stopTestMongo();
}
