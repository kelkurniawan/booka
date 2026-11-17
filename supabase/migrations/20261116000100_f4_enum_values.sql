-- F4: nilai enum baru. Berkas sendiri karena nilai enum yang baru ditambah
-- tidak boleh dipakai di transaksi yang sama (20261116000200 memakainya).
alter type public.notification_kind add value if not exists 'REMINDER_CUSTOMER_SAME_DAY';
alter type public.notification_kind add value if not exists 'BOOKING_RESCHEDULED_MERCHANT';
alter type public.notification_kind add value if not exists 'BOOKING_CANCELLED_MERCHANT';
alter type public.notification_channel add value if not exists 'PUSH';
