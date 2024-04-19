import "server-only";
"server-only";

import { SessionPartitionManager } from "../app/auth/SessionPartitionManager";
import RedisCacheClient from "../app/auth/redis/redisCacheClient";
import { redisClient } from "./redis";
import { AuthProvider } from "../app/auth/AuthProvider";
import { getSession } from "./session";
import { cookies } from "next/headers";
import { authCallbackUri, msalConfig } from "../app/auth/authConfig";

async function partitionManagerFactory() {
    const cookie = cookies().get("__session");

    const session = await getSession(`__session=${cookie?.value}`);

    return new SessionPartitionManager(session);
}

export const authProvider = new AuthProvider(
    msalConfig,
    authCallbackUri,
    new RedisCacheClient(redisClient),
    partitionManagerFactory
);