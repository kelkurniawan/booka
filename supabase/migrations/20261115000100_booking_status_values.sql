-- Nilai enum baru berdiri sendiri: ALTER TYPE ... ADD VALUE tidak boleh dipakai dalam transaksi yang sama dengan penggunaannya.
alter type public.booking_status add value if not exists 'CONFIRMED';
alter type public.booking_status add value if not exists 'REQUESTED';
alter type public.notification_kind add value if not exists 'BOOKING_CONFIRMED_MERCHANT';
alter type public.notification_kind add value if not exists 'BOOKING_CONFIRMED_CUSTOMER';
alter type public.notification_kind add value if not exists 'BOOKING_REQUESTED_MERCHANT';
alter type public.notification_kind add value if not exists 'BOOKING_APPROVED_CUSTOMER';
alter type public.notification_kind add value if not exists 'BOOKING_REJECTED_CUSTOMER';
