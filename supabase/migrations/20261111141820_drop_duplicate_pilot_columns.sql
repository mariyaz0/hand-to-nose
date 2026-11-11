-- pilot_flag (is_pilot, pilot_note) and mark_pilot_sessions (pilot, note) added the same
-- information twice. Keep is_pilot / pilot_note, drop the duplicates.
-- No session or trial is deleted.
--
-- The four sessions recorded before app 2.2.0 are pilots (docs/decisions.md, D-32):
--   B34CF91D  app 2.0.0  researcher, S24 Ultra, first real test
--   F50F9F36  app 2.1.0  iPhone test, interleaved speeds
--   A56549CD  app 2.1.0  iPhone test, interleaved speeds
--   8DA2C63C  app 2.1.0  researcher, S24 Ultra, interleaved speeds
-- Their pilot_note values were set with the SQL editor on 11 Nov 2026.

update public.sessions
set is_pilot = true
where upper(left(id::text, 8)) in ('B34CF91D', 'F50F9F36', 'A56549CD', '8DA2C63C');

alter table public.sessions
    drop column pilot,
    drop column note;
