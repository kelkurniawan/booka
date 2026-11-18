-- Funnel iklan: nilai enum dipisah dari pemakaiannya (migration berikutnya).
create type public.ad_channel as enum ('IG_BIO', 'META_ADS', 'TIKTOK_ADS', 'WA_STATUS', 'OTHER');
create type public.funnel_event_kind as enum ('VIEW', 'SERVICE', 'CHECKOUT', 'BOOKED', 'PAID', 'LINK_CLICK');
