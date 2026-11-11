-- Mark sessions that are not part of the study as pilots instead of deleting them.
-- The analysis uses only sessions with pilot = false.

alter table public.sessions
    add column pilot boolean not null default false,
    add column note  text check (char_length(note) <= 500);

comment on column public.sessions.pilot is 'true = test/pilot run, kept for reference but excluded from the analysis';
comment on column public.sessions.note  is 'Free-text note by the researcher (e.g. why a session is a pilot)';

-- The browser keeps insert-only access; pilot/note are set by the researcher.
revoke insert on public.sessions from anon;
grant insert (id, created_at, app_version, mode, language, consent_given, age, sex,
              edinburgh, edinburgh_lq, first_hand, device)
    on public.sessions to anon;

-- Sessions recorded before app 2.2.0 (protocol with interleaved speeds) are pilots.
update public.sessions set pilot = true, note = case upper(left(id::text, 8))
    when 'B34CF91D' then 'Pilot 1: Mariya, S24 Ultra, app 2.0.0 (first real test of the web app)'
    when 'F50F9F36' then 'Pilot 2: iPhone test, app 2.1.0, interleaved speeds (protocol changed in 2.2.0)'
    when 'A56549CD' then 'Pilot 3: iPhone test, app 2.1.0, interleaved speeds (protocol changed in 2.2.0)'
    when '8DA2C63C' then 'Pilot 4: Mariya, S24 Ultra, app 2.1.0, interleaved speeds (protocol changed in 2.2.0)'
  end
where upper(left(id::text, 8)) in ('B34CF91D', 'F50F9F36', 'A56549CD', '8DA2C63C');
