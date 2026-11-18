import { z } from "zod";

import type { AdChannel } from "@/types/database";

import { LINK_PLACEMENTS } from "@/lib/funnel/link-placement";
import { isSafeLinkUrl, isValidGa4Id, isValidMetaPixelId, isValidTiktokPixelId } from "@/lib/funnel/pixel-ids";

export const AD_CHANNELS = ["IG_BIO", "META_ADS", "TIKTOK_ADS", "WA_STATUS", "OTHER"] as const satisfies readonly AdChannel[];

export const adLinkSchema = z.object({
  name: z.string().trim().min(1, "Beri nama tautan").max(60, "Nama tautan maksimal 60 karakter"),
  channel: z.enum(AD_CHANNELS, "Pilih kanal"),
  serviceId: z.string().uuid().nullable(),
  voucherCode: z.string().trim().min(1).max(40).nullable(),
});

const linkUrl = z.string().trim().refine(isSafeLinkUrl, "Alamat harus lengkap dan diawali https://, misalnya https://maps.app.goo.gl/...");

export const merchantLinksSchema = z.object({
  links: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1, "Isi nama tombol").max(40, "Nama tombol maksimal 40 karakter"),
        url: linkUrl,
        isVisible: z.boolean(),
      }),
    )
    .max(8, "Maksimal 8 tautan"),
});

export const saveLinksInputSchema = merchantLinksSchema.extend({
  showSocialIcons: z.boolean(),
  publicWhatsapp: z.boolean(),
  placement: z.enum(LINK_PLACEMENTS),
});

const optionalId = (valid: (v: string) => boolean, msg: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || valid(v), msg);

export const trackingSchema = z
  .object({
    metaPixelId: optionalId(isValidMetaPixelId, "Pixel ID Meta berisi 15 atau 16 angka, tanpa tanda baca."),
    tiktokPixelId: optionalId(isValidTiktokPixelId, "Pixel ID TikTok berisi 20 huruf besar dan angka."),
    ga4MeasurementId: optionalId(isValidGa4Id, "Measurement ID GA4 diawali G- lalu 6 sampai 12 huruf besar atau angka."),
    metaEnabled: z.boolean(),
    tiktokEnabled: z.boolean(),
    ga4Enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const need = [
      ["metaEnabled", "metaPixelId", v.metaPixelId],
      ["tiktokEnabled", "tiktokPixelId", v.tiktokPixelId],
      ["ga4Enabled", "ga4MeasurementId", v.ga4MeasurementId],
    ] as const;
    for (const [on, field, id] of need) {
      if (v[on] && !id) ctx.addIssue({ code: "custom", path: [field], message: "Isi ID sebelum mengaktifkan" });
    }
  });

const attr = (max: number) => z.string().max(max).nullable();

export const eventBodySchema = z.object({
  merchantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  kind: z.enum(["VIEW", "SERVICE", "CHECKOUT", "LINK_CLICK"]),
  serviceId: z.string().uuid().optional(),
  merchantLinkId: z.string().uuid().optional(),
  attribution: z.object({
    adLinkSlug: attr(40),
    utmSource: attr(64),
    utmMedium: attr(64),
    utmCampaign: attr(64),
    referrerHost: attr(100),
  }),
});
