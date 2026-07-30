import { stopTestMongo } from "../mongo/replicaSet";

export default async function globalTeardown(): Promise<void> {
  await stopTestMongo();
}
