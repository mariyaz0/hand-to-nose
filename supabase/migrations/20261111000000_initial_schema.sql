-- Hand-to-nose v2: initial schema
--
-- Two tables:
--   sessions : one row per run of the web app (one participant in "collect" mode,
--              or one final-exam run in "test" mode)
--   trials   : one row per SUCCESSFUL movement (to the nose and back) with raw sensor data.
--              Failed attempts (moved before the beep / no nose touch within 10 s) are
--              discarded by the app; only their count and reason are kept in failed_before.
--
-- Access model: the browser uses the public (publishable/anon) key and may only INSERT.
-- Nobody can read, change or delete data from the browser. Analysis reads the data with
-- the service key (Python) or via the Supabase dashboard.

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table public.sessions (
    id              uuid primary key,             -- generated in the browser; doubles as the anonymous participant code
    created_at      timestamptz not null default now(),
    app_version     text not null check (char_length(app_version) <= 32),
    mode            text not null check (mode in ('collect', 'test')),
    language        text not null check (language in ('en', 'ru')),
    consent_given   boolean not null default false,
    age             smallint check (age between 10 and 110),
    sex             text check (sex in ('female', 'male', 'other', 'prefer_not_to_say')),
    edinburgh       jsonb,                        -- short Edinburgh inventory answers, e.g. {"writing":100,"throwing":50,"toothbrush":100,"spoon":100}
    edinburgh_lq    real check (edinburgh_lq between -100 and 100),   -- laterality quotient = mean of the 4 answers
    first_hand      text check (first_hand in ('right', 'left')),     -- which hand the app asked for in block 1 (random)
    device          jsonb,                        -- user agent, platform, screen size, pixel ratio, zone radius, sensor availability
    -- a collection session must have consent; a test run (final exam) does not ask for it
    constraint collect_requires_consent check (mode = 'test' or consent_given),
    constraint edinburgh_size check (edinburgh is null or pg_column_size(edinburgh) < 2000),
    constraint device_size    check (device    is null or pg_column_size(device)    < 8000)
);

comment on table public.sessions is 'One run of the web app: a participant in collect mode or a final-exam run in test mode.';

-- ---------------------------------------------------------------------------
-- trials
-- ---------------------------------------------------------------------------
create table public.trials (
    id                uuid primary key,           -- generated in the browser
    session_id        uuid not null references public.sessions (id) on delete cascade,
    created_at        timestamptz not null default now(),
    block_index       smallint not null check (block_index between 0 and 10),
    trial_index       smallint not null check (trial_index between 0 and 40),   -- order of saved trials within the session
    hand              text check (hand in ('right', 'left')),                  -- label; NULL in test mode (unknown)
    speed             text check (speed in ('slow', 'normal', 'fast')),        -- instructed speed; NULL in test mode
    failed_before     jsonb not null default '[]'::jsonb,  -- reasons of discarded attempts before this one, e.g. ["false_start","no_touch"]
    -- event times in ms on the same clock as samples.t
    t_beep_high_ms    double precision not null,
    t_touch_start_ms  double precision not null,  -- nose touched the zone (= low beep)
    t_touch_end_ms    double precision,           -- nose left the screen (start of the way back)
    t_rest_ms         double precision,           -- phone still again after the return
    touch_x_px        real,                       -- touch position relative to the dot centre, CSS pixels
    touch_y_px        real,
    touch_events      jsonb not null default '[]'::jsonb,  -- every touch incl. ignored ones outside the zone
    sample_rate_hz    real,                       -- measured mean rate of this recording
    n_samples         integer not null check (n_samples >= 0),
    samples           jsonb not null,             -- columnar arrays: t, ax, ay, az, lx, ly, lz, gx, gy, gz, oa, ob, og (see docs/data_format.md)
    predicted_hand    text check (predicted_hand in ('right', 'left')),         -- test mode only
    predicted_prob    real check (predicted_prob between 0 and 1),
    model_version     text check (char_length(model_version) <= 32),
    constraint trial_order unique (session_id, trial_index),
    constraint samples_size        check (pg_column_size(samples)       < 2000000),
    constraint touch_events_size   check (pg_column_size(touch_events)  < 20000),
    constraint failed_before_size  check (pg_column_size(failed_before) < 2000)
);

comment on table public.trials is 'One successful movement (to the nose and back) with raw sensor samples and event times.';

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.trials   enable row level security;

-- The browser may only insert. No select/update/delete grants and no policies for them.
revoke all on public.sessions from anon, authenticated;
revoke all on public.trials   from anon, authenticated;
grant insert on public.sessions to anon;
grant insert on public.trials   to anon;

-- Helper (not exposed through the API): a trial may only be added to a session that exists,
-- is less than 3 hours old and has fewer than 40 trials. Runs with owner rights because
-- the anon role cannot read sessions/trials itself.
create schema if not exists private;

create or replace function private.session_accepts_trials(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.sessions s
        where s.id = sid
          and s.created_at > now() - interval '3 hours'
    )
    and (select count(*) from public.trials t where t.session_id = sid) < 40;
$$;

revoke all on function private.session_accepts_trials(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.session_accepts_trials(uuid) to anon;

create policy "browser can create sessions"
    on public.sessions
    for insert
    to anon
    with check (created_at > now() - interval '1 minute');   -- cannot back-date a session

create policy "browser can add trials to an open session"
    on public.trials
    for insert
    to anon
    with check (private.session_accepts_trials(session_id));
