export type TxtRecord = { type: "TXT"; name: string; value: string };

/** Record yang ditampilkan ke merchant baru. */
export function ownershipRecord(domain: string, token: string): TxtRecord {
  return { type: "TXT", name: `_marky.${domain}`, value: `marky-verify=${token}` };
}

/** Record baru plus record lama (_booka) agar merchant yang sudah terverifikasi tetap valid. */
export function acceptedOwnershipRecords(domain: string, token: string): TxtRecord[] {
  return [
    ownershipRecord(domain, token),
    { type: "TXT", name: `_booka.${domain}`, value: `booka-verify=${token}` },
  ];
}

/** `found`: nama record -> hasil resolveTxt (potongan 255 karakter digabung dulu). */
export function matchesOwnership(found: Record<string, string[][]>, domain: string, token: string): boolean {
  return acceptedOwnershipRecords(domain, token).some((r) =>
    (found[r.name] ?? []).some((chunks) => chunks.join("") === r.value),
  );
}
