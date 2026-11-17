import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { contactLinks } from "@/lib/marketing/contact";

import { Masthead } from "./masthead";
import { RadioSwitch, SwitchPanel } from "./radio-switch";
import { SiteFooter } from "./site-footer";
import { withMarketing } from "./story-decorator";

const meta = {
  title: "Landing/Kerangka",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [withMarketing],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const semua = contactLinks({
  whatsapp: "6281234567890",
  email: "halo@contoh.id",
  instagram: "akun",
  threads: "akun",
  x: "akun",
  tiktok: "akun",
  discord: "https://discord.gg/abc123",
});

export const MastheadHP: Story = {
  render: () => <Masthead />,
  globals: { viewport: { value: "hp", isRotated: false } },
};

export const MastheadDesktop: Story = {
  render: () => <Masthead />,
  globals: { viewport: { value: "desktop", isRotated: false } },
};

export const KakiHalamanSemuaKontak: Story = { render: () => <SiteFooter contact={semua} /> };

export const KakiHalamanTanpaKontak: Story = { render: () => <SiteFooter contact={[]} /> };

const OPSI = ["Salon", "Fotografer", "Kelas"] as const;

function Pemilih({ tone }: { tone: "paper" | "board" }) {
  return (
    <div
      data-switch
      className="wrap"
      style={{
        padding: 24,
        background: tone === "board" ? "var(--color-board)" : undefined,
        color: tone === "board" ? "var(--color-board-type)" : undefined,
      }}
    >
      <RadioSwitch name={`demo-${tone}`} legend="Contoh usaha" options={OPSI} tone={tone} />
      {OPSI.map((o, i) => (
        <SwitchPanel key={o} index={i} className="">
          <p>Panel {o}</p>
        </SwitchPanel>
      ))}
    </div>
  );
}

export const PemilihPaper: Story = { render: () => <Pemilih tone="paper" /> };
export const PemilihBoard: Story = { render: () => <Pemilih tone="board" /> };
