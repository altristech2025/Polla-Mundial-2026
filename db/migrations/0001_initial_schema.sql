-- Polla Mundial 2026 — Initial schema (Neon Postgres)
-- Auth.js maneja sesiones via JWT en cookies; no necesitamos tabla de sessions.
-- Access control se enforca en TS, no via RLS.

create extension if not exists pgcrypto;

-- =============================================================
-- 1. App config
-- =============================================================
create table app_config (
  id smallint primary key default 1,
  predictions_lock_at timestamptz not null,
  reveal_at timestamptz not null,
  tournament_start_at timestamptz not null,
  constraint app_config_singleton check (id = 1)
);

insert into app_config (id, predictions_lock_at, reveal_at, tournament_start_at)
values (1, '2026-06-10T23:59:00-05:00', '2026-06-11T00:00:00-05:00', '2026-06-11T18:00:00-05:00');

-- =============================================================
-- 2. Allowed participants (whitelist invite-only)
-- =============================================================
create table allowed_participants (
  email text primary key,
  suggested_display_name text,
  added_at timestamptz not null default now(),
  notes text
);

-- =============================================================
-- 3. Users (con password hash bcrypt)
-- =============================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  is_admin boolean not null default false,
  tour_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 4. Teams (48 selecciones)
-- =============================================================
create table teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  flag_emoji text,
  group_letter char(1) not null check (group_letter in ('A','B','C','D','E','F','G','H','I','J','K','L')),
  group_position smallint not null check (group_position between 1 and 4),
  is_placeholder boolean not null default false,
  unique (group_letter, group_position)
);

-- =============================================================
-- 5. Group matches (72)
-- =============================================================
create table group_matches (
  id uuid primary key default gen_random_uuid(),
  group_letter char(1) not null,
  match_day smallint not null check (match_day between 1 and 3),
  match_date date not null,
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  official_home_score smallint,
  official_away_score smallint,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished')),
  created_at timestamptz not null default now()
);

create index group_matches_group_idx on group_matches (group_letter, match_day);

-- =============================================================
-- 6. Bracket matches (P73-P104)
-- =============================================================
create table bracket_matches (
  match_code text primary key,
  round text not null check (round in ('R32','R16','QF','SF','3RD','FINAL')),
  match_date date not null,
  venue text not null,
  slot_spec text not null,
  official_home_team_id uuid references teams(id),
  official_away_team_id uuid references teams(id),
  official_winner_id uuid references teams(id),
  official_loser_id uuid references teams(id),
  status text not null default 'scheduled' check (status in ('scheduled','live','finished'))
);

create index bracket_matches_round_idx on bracket_matches (round);

-- =============================================================
-- 7. Predictions (una por usuario)
-- =============================================================
create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  total_score integer not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index predictions_score_idx on predictions (total_score desc);

-- =============================================================
-- 8. Prediction details
-- =============================================================
create table prediction_group_scores (
  prediction_id uuid not null references predictions(id) on delete cascade,
  group_match_id uuid not null references group_matches(id),
  home_score smallint not null check (home_score >= 0),
  away_score smallint not null check (away_score >= 0),
  primary key (prediction_id, group_match_id)
);

create table prediction_bracket_picks (
  prediction_id uuid not null references predictions(id) on delete cascade,
  match_code text not null references bracket_matches(match_code),
  picked_home_team_id uuid references teams(id),
  picked_away_team_id uuid references teams(id),
  picked_winner_id uuid references teams(id),
  primary key (prediction_id, match_code)
);

create table prediction_final_order (
  prediction_id uuid primary key references predictions(id) on delete cascade,
  champion_id uuid references teams(id),
  runner_up_id uuid references teams(id),
  third_place_id uuid references teams(id),
  fourth_place_id uuid references teams(id)
);

-- =============================================================
-- 9. Scores audit (cron debugging)
-- =============================================================
create table scores_audit (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  source text not null,
  payload jsonb not null,
  status text not null check (status in ('ok','warning','error','needs_admin_review')),
  message text,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 10. Trigger: auto-update updated_at en predictions
-- =============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger predictions_touch_updated
  before update on predictions
  for each row execute function touch_updated_at();
