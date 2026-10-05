/**
 * Klien kecil Vercel REST API untuk domain merchant (paket Studio).
 * Tanpa `server-only`/env supaya bisa diuji dengan `fetch` tiruan;
 * konfigurasinya disuntik oleh pemanggil (actions.ts).
 *
 *   POST   /v10/projects/{project}/domains            tambah domain
 *   GET    /v9/projects/{project}/domains/{domain}    status verifikasi
 *   POST   /v9/projects/{project}/domains/{domain}/verify
 *   GET    /v6/domains/{domain}/config                DNS sudah benar?
 *   DELETE /v9/projects/{project}/domains/{domain}    lepas domain
 */

export type VercelConfig = { token: string; projectId: string; teamId?: string };

export type VerificationRecord = { type: string; domain: string; value: string };

export type DomainStatus = {
  /** Kepemilikan terverifikasi untuk proyek ini. */
  verified: boolean;
  /** DNS belum mengarah ke Vercel. */
  misconfigured: boolean;
  /** Record TXT yang diminta Vercel bila domainnya dipakai proyek lain. */
  verification: VerificationRecord[];
};

export type DomainResult<T> = { ok: true; value: T } | { ok: false; message: string };

const API = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;

function url(config: VercelConfig, path: string): string {
  const team = config.teamId ? `?teamId=${encodeURIComponent(config.teamId)}` : "";
  return `${API}${path}${team}`;
}

async function call<T>(
  config: VercelConfig,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<DomainResult<T>> {
  try {
    const response = await fetchImpl(url(config, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string };
    };
    if (!response.ok) {
      return { ok: false, message: body.error?.code ?? `HTTP ${response.status}` };
    }
    return { ok: true, value: body };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.name : "fetch gagal" };
  }
}

const project = (config: VercelConfig) => `/projects/${encodeURIComponent(config.projectId)}`;

export async function addProjectDomain(
  config: VercelConfig,
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DomainResult<null>> {
  const result = await call<unknown>(
    config,
    `/v10${project(config)}/domains`,
    { method: "POST", body: JSON.stringify({ name: domain }) },
    fetchImpl,
  );
  // Sudah terpasang di proyek ini (mis. merchant menekan tambah dua kali)
  // bukan kegagalan.
  if (!result.ok && result.message !== "domain_already_in_use_by_project") return result;
  return { ok: true, value: null };
}

export async function getDomainStatus(
  config: VercelConfig,
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DomainResult<DomainStatus>> {
  const name = encodeURIComponent(domain);
  let projectDomain = await call<{ verified?: boolean; verification?: VerificationRecord[] }>(
    config,
    `/v9${project(config)}/domains/${name}`,
    { method: "GET" },
    fetchImpl,
  );
  if (!projectDomain.ok) return projectDomain;

  if (!projectDomain.value.verified) {
    const verify = await call<{ verified?: boolean; verification?: VerificationRecord[] }>(
      config,
      `/v9${project(config)}/domains/${name}/verify`,
      { method: "POST" },
      fetchImpl,
    );
    // Verifikasi yang belum lolos dibalas error oleh Vercel; status lama
    // (dengan record TXT-nya) tetap yang ditampilkan.
    if (verify.ok) projectDomain = verify;
  }

  const dns = await call<{ misconfigured?: boolean }>(
    config,
    `/v6/domains/${name}/config`,
    { method: "GET" },
    fetchImpl,
  );
  if (!dns.ok) return dns;

  return {
    ok: true,
    value: {
      verified: Boolean(projectDomain.value.verified),
      misconfigured: dns.value.misconfigured !== false,
      verification: projectDomain.value.verification ?? [],
    },
  };
}

export async function removeProjectDomain(
  config: VercelConfig,
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DomainResult<null>> {
  const result = await call<unknown>(
    config,
    `/v9${project(config)}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" },
    fetchImpl,
  );
  // Sudah tidak ada di Vercel -- tujuan akhirnya tercapai.
  if (!result.ok && result.message !== "not_found") return result;
  return { ok: true, value: null };
}

/** Domain tingkat dua Indonesia: salon.co.id adalah apex, bukan subdomain. */
const SECOND_LEVEL_ID = /\.(ac|co|go|mil|my|net|or|ponpes|sch|web|biz)\.id$/;

/** Bagian apex sebuah domain: salon.id, salon.co.id, salon.com. */
export function apexOf(domain: string): string {
  const labels = domain.split(".");
  return labels.slice(SECOND_LEVEL_ID.test(domain) ? -3 : -2).join(".");
}

/**
 * Record DNS yang harus dipasang merchant. Subdomain (booking.salon.id)
 * memakai CNAME; domain apex (salon.id) tidak boleh CNAME, jadi A record.
 * Nilainya mengikuti panduan domain kustom Vercel.
 */
export function dnsInstruction(domain: string): { type: "A" | "CNAME"; name: string; value: string } {
  const apex = apexOf(domain);
  if (apex === domain) return { type: "A", name: "@", value: "76.76.21.21" };
  return {
    type: "CNAME",
    name: domain.slice(0, -(apex.length + 1)),
    value: "cname.vercel-dns.com",
  };
}
