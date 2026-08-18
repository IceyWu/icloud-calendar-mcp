import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

const FileConfig = z
  .object({
    allowedHosts: z
      .array(z.string())
      .default(["127.0.0.1", "localhost", "[::1]"]),
    allowedOrigins: z.array(z.string()).default([]),
    dataDir: z.string().optional(),
    maxEvents: z.number().int().min(1).max(1000).default(200),
    maxRequestBytes: z.number().int().min(1024).max(10485760).default(1048576),
    readRatePerMinute: z.number().int().min(1).default(60),
    timeoutMs: z.number().int().min(1000).max(120000).default(25000),
    writeRatePerMinute: z.number().int().min(1).default(20),
  })
  .strict();
export type AppConfig = Omit<z.infer<typeof FileConfig>, "dataDir"> & {
  dataDir: string;
  username: string;
  password: string;
  mode: "stdio" | "http";
  httpToken?: string;
  httpPort: number;
};
export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<AppConfig> {
  let raw: unknown = {};
  if (env.ICLOUD_MCP_CONFIG) {
    raw = JSON.parse(
      await readFile(resolve(env.ICLOUD_MCP_CONFIG), "utf8")
    ) as unknown;
  }
  const file = FileConfig.parse(raw);
  const username = z.string().email().parse(env.ICLOUD_USERNAME);
  const password = z.string().min(8).parse(env.ICLOUD_APP_PASSWORD);
  const mode = env.ICLOUD_MCP_TRANSPORT === "http" ? "http" : "stdio";
  const httpToken = env.ICLOUD_MCP_HTTP_TOKEN;
  if (mode === "http" && (!httpToken || httpToken.length < 24)) {
    throw new Error(
      "HTTP mode requires ICLOUD_MCP_HTTP_TOKEN with at least 24 characters"
    );
  }
  return {
    ...file,
    dataDir: file.dataDir ?? join(homedir(), ".icloud-caldav-mcp"),
    username,
    password,
    mode,
    ...(httpToken ? { httpToken } : {}),
    httpPort: Number(env.ICLOUD_MCP_HTTP_PORT ?? 3000),
  };
}
