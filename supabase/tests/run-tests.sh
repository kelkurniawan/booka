#!/bin/sh
# Dijalankan otomatis oleh image postgres saat database pertama kali dibuat
# (lihat service `db-test` di compose.yaml).
#
# Urutannya: tiruan lingkungan Supabase -> semua migration -> uji perilaku.
set -e

PSQL="psql --username $POSTGRES_USER --dbname $POSTGRES_DB --no-psqlrc"

echo ""
echo "=============================================="
echo " 1/3  Menyiapkan tiruan lingkungan Supabase"
echo "=============================================="
$PSQL --set ON_ERROR_STOP=1 --quiet --file /supabase/tests/00_supabase_stub.sql

echo ""
echo "=============================================="
echo " 2/3  Menjalankan migration"
echo "=============================================="
# Glob shell mengurutkan berdasarkan nama, dan nama migration diawali stempel
# waktu — jadi migration baru otomatis ikut tanpa mengubah skrip ini.
for migration in /supabase/migrations/*.sql; do
  echo "  -> $(basename "$migration")"
  $PSQL --set ON_ERROR_STOP=1 --quiet --file "$migration"
done

echo ""
echo "=============================================="
echo " 3/3  Uji perilaku skema"
echo "=============================================="
# Tanpa ON_ERROR_STOP: skrip ini memang sengaja memicu constraint violation
# untuk membuktikan penolakannya bekerja.
$PSQL --tuples-only --no-align --file /supabase/tests/99_verify.sql

echo ""
echo "=============================================="
echo " Selesai. Baris diawali FAIL berarti ada masalah."
echo "=============================================="
echo ""
