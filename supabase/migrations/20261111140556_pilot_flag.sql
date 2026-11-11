-- Mark pilot sessions instead of deleting them (docs/decisions.md, D-32).
--
-- is_pilot   : true = test run; kept in the database, excluded from the analysis
-- pilot_note : why the session is a pilot
--
-- The browser cannot set these columns: new sessions are always stored as not pilot,
-- and only the researcher (dashboard / service key) can mark a session.

alter table public.sessions
    add column is_pilot   boolean not null default false,
    add column pilot_note text check (char_length(pilot_note) <= 300);

comment on column public.sessions.is_pilot is 'Test run: kept, but excluded from the analysis.';

-- the insert-only browser role may not write the pilot columns
revoke insert on public.sessions from anon;
grant insert (id, created_at, app_version, mode, language, consent_given, age, sex,
              edinburgh, edinburgh_lq, first_hand, device)
    on public.sessions to anon;
