import "server-only";

import { serverEnv } from "@/lib/env/server";

import type { VercelConfig } from "./vercel";

/** Konfigurasi Vercel dari env, atau null bila fitur domain belum diaktifkan. */
export function vercelConfig(): VercelConfig | null {
  const env = serverEnv();
  if (!env.vercelApiToken || !env.vercelProjectId) return null;
  return { token: env.vercelApiToken, projectId: env.vercelProjectId, teamId: env.vercelTeamId };
}

/** Record TXT bukti kepemilikan -- lihat migration 20261005000400. */
export function ownershipRecord(domain: string, token: string) {
  return { type: "TXT" as const, name: `_booka.${domain}`, value: `booka-verify=${token}` };
}
