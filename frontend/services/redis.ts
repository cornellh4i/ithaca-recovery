import { createClient } from "redis";
import { redisUrl } from "../app/auth/authConfig";

export const redisClient = createClient(
    redisUrl ? { url: redisUrl } : undefined
);

redisClient.on("error", (err) => console.log("Redis Client Error", err));