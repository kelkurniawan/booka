-- 20261126001300 membuat ulang reschedule_booking_by_merchant dengan tanda tangan baru
-- tetapi tidak memuat ulang cache skema PostgREST; migration itu tidak diubah.
notify pgrst, 'reload schema';
