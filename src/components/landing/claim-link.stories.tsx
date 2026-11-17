import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { USERNAME_CHECK_MESSAGES, type UsernameCheckResult } from "@/lib/marketing/username-check";
import { ClaimLink, type CheckFn } from "./claim-link";
import { withMarketing } from "./story-decorator";

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

const fixed = (result: UsernameCheckResult): CheckFn => async (_slug, signal) => {
  await wait(200, signal);
  return result;
};
const msg = (s: keyof typeof USERNAME_CHECK_MESSAGES): UsernameCheckResult => ({
  status: s,
  message: USERNAME_CHECK_MESSAGES[s],
});

const meta = {
  title: "Landing/ClaimLink",
  component: ClaimLink,
  decorators: [withMarketing],
  parameters: { nextjs: { appDirectory: true } },
  args: { host: "marky.id", check: fixed(msg("available")) },
} satisfies Meta<typeof ClaimLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tersedia: Story = {};
export const SudahDipakai: Story = { args: { check: fixed(msg("taken")) } };
export const DipakaiSistem: Story = { args: { check: fixed(msg("reserved")) } };
export const TidakValid: Story = {
  args: { check: fixed({ status: "invalid", message: "Minimal 3 karakter" }) },
};
export const TerlaluBanyak: Story = { args: { check: fixed(msg("rate_limited")) } };
export const Gagal: Story = { args: { check: fixed(msg("error")) } };
export const HostPanjang: Story = {
  args: { host: "booking.marky.id" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

/** Ketik "studio", lalu cepat "studio-mawar": hanya status studio-mawar yang tampil. */
export const BalasanTidakBerurutan: Story = {
  args: {
    check: async (slug) => {
      // Tanpa signal sengaja: mensimulasikan balasan lambat yang datang terlambat.
      await new Promise((r) => setTimeout(r, slug === "studio" ? 1500 : 200));
      return { status: slug === "studio" ? "taken" : "available", message: `Balasan untuk ${slug}` };
    },
  },
};
