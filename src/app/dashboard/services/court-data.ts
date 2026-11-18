/** Data lapangan untuk form layanan, dimuat sekali di page.tsx. */
export type CourtOption = { id: string; name: string; note: string };

export type CourtFormData = {
  courts: CourtOption[];
  /** serviceId -> id lapangan yang dipakai. */
  linksByService: Record<string, string[]>;
  /** serviceId -> kartu aturan jam ramai (hari digabung). */
  rulesByService: Record<string, { days: number[]; start: string; end: string; pricePerHour: number }[]>;
};

export const EMPTY_COURT_DATA: CourtFormData = { courts: [], linksByService: {}, rulesByService: {} };
