export type FunnelStep = "VIEW" | "SERVICE" | "CHECKOUT" | "BOOKED" | "PAID";

export const PIXEL_EVENTS: Record<FunnelStep, { meta: string; tiktok: string; ga4: string }> = {
  VIEW: { meta: "PageView", tiktok: "Pageview", ga4: "page_view" },
  SERVICE: { meta: "ViewContent", tiktok: "ViewContent", ga4: "view_item" },
  CHECKOUT: { meta: "InitiateCheckout", tiktok: "InitiateCheckout", ga4: "begin_checkout" },
  BOOKED: { meta: "Lead", tiktok: "SubmitForm", ga4: "generate_lead" },
  PAID: { meta: "Purchase", tiktok: "CompletePayment", ga4: "purchase" },
};
