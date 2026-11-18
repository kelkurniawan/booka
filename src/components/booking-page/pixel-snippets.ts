import { isValidGa4Id, isValidMetaPixelId, isValidTiktokPixelId } from "@/lib/funnel/pixel-ids";

export type PixelIds = { meta?: string | null; tiktok?: string | null; ga4?: string | null };
export type PixelSnippets = { meta: string | null; tiktok: string | null; ga4: string | null };

const pick = (id: string | null | undefined, ok: (v: string) => boolean) => (id && ok(id) ? JSON.stringify(id) : null);

/**
 * Kode init per platform dari ID yang lolos regex; ID tak valid dibuang.
 * ID masuk hanya lewat JSON.stringify, tidak pernah disambung mentah.
 * Murni (tanpa React/Next) supaya bisa diuji.
 */
export function pixelSnippets(ids: PixelIds): PixelSnippets {
  const meta = pick(ids.meta, isValidMetaPixelId);
  const tiktok = pick(ids.tiktok, isValidTiktokPixelId);
  const ga4 = pick(ids.ga4, isValidGa4Id);
  return {
    meta: meta
      ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq.disablePushState=true;fbq('set','autoConfig',false,${meta});fbq('init',${meta});fbq('track','PageView');`
      : null,
    tiktok: tiktok
      ? `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var u="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=u;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=u+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${tiktok});ttq.page()}(window,document,'ttq');`
      : null,
    ga4: ga4
      ? `window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};gtag('js',new Date());gtag('config',${ga4},{send_page_view:false});gtag('event','page_view');var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(${ga4});document.head.appendChild(s);`
      : null,
  };
}
