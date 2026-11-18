/**
 * Klien Supabase palsu untuk tes handler route: `from(tabel)` mengembalikan
 * rantai yang bisa di-await (daftar) atau `.maybeSingle()` (satu baris),
 * `rpc(nama)` memanggil fungsi yang disediakan dan mencatat argumennya.
 */
export type FakeResult = { data: unknown; error?: unknown };

export function fakeClient(
  tables: Record<string, FakeResult>,
  rpcs: Record<string, (args: Record<string, unknown>) => FakeResult> = {},
) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? { data: null, error: { code: "FAKE", message: `tabel ${table} tidak disiapkan` } };
      const out = { data: res.data ?? null, error: res.error ?? null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "in", "update"]) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(res.data) ? res.data[0] ?? null : out.data, error: out.error });
      chain.then = (ok: (v: typeof out) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(out).then(ok, bad);
      return chain;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      const fn = rpcs[name];
      const res = fn ? fn(args) : { data: null, error: { code: "PGRST202", message: `rpc ${name} tidak disiapkan` } };
      return Promise.resolve({ data: res.data ?? null, error: res.error ?? null });
    },
  };
  return { client, rpcCalls };
}
