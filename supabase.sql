-- Ski World: databas för global topplista, unika namn och online-race.
-- Kör hela filen i Supabase → SQL Editor (den går att köra flera gånger).
-- Spelarna loggas in anonymt (Authentication → Sign In / Providers → Anonymous sign-ins: på,
-- e-postregistrering: av). Bara inloggade spelare får skriva, och bara i sitt eget namn.

-- ---------- Resultat ----------
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  player_id text not null check (char_length(player_id) between 8 and 64),
  name text not null check (char_length(name) between 1 and 24),
  score integer not null check (score between 1 and 200000),
  dist integer not null check (dist between 0 and 5000),
  course text not null check (course in ('classic', 'park', 'moguls', 'pipe', 'slalom', 'bigair')),
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  rider text not null check (rider in ('ski', 'board')),
  created_at timestamptz not null default now()
);
create index if not exists scores_course_score on public.scores (course, score desc);
-- Dagens utmaning: day är satt för dagens åk (de räknas inte i den vanliga topplistan)
alter table public.scores add column if not exists day date;
create index if not exists scores_day_score on public.scores (day, score desc) where day is not null;
create index if not exists scores_player_time on public.scores (player_id, created_at desc);

alter table public.scores enable row level security;
drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select to anon, authenticated using (true);
drop policy if exists "add scores" on public.scores;
drop policy if exists "add own scores" on public.scores;
create policy "add own scores" on public.scores for insert to authenticated
  with check (player_id = (select auth.uid())::text);
-- Ingen får ändra eller ta bort resultat
revoke insert, update, delete on public.scores from anon;
revoke update, delete on public.scores from authenticated;

-- Spamskydd: högst ett resultat var 5:e sekund och 300 per dygn per spelare
create or replace function public.scores_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from scores where player_id = new.player_id and created_at > now() - interval '5 seconds') then
    raise exception 'too many scores' using errcode = 'P0001';
  end if;
  if (select count(*) from scores where player_id = new.player_id and created_at > now() - interval '1 day') >= 300 then
    raise exception 'daily limit reached' using errcode = 'P0001';
  end if;
  if new.day is not null and (new.day < current_date - 1 or new.day > current_date + 1) then
    raise exception 'wrong day' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists scores_rate_limit on public.scores;
create trigger scores_rate_limit before insert on public.scores
  for each row execute function public.scores_rate_limit();
-- Spärren körs bara automatiskt vid sparning – den ska inte gå att anropa via API:t
revoke execute on function public.scores_rate_limit() from public, anon, authenticated;

-- Varje spelares bästa åk per bana (det är den som visas i topplistan)
create or replace view public.best_scores with (security_invoker = true) as
select distinct on (player_id, course) player_id, name, score, dist, course, difficulty, rider, created_at
from public.scores
where day is null
order by player_id, course, score desc, created_at;
grant select on public.best_scores to anon, authenticated;

-- Dagens utmaning: varje spelares bästa åk per dag
create or replace view public.daily_best with (security_invoker = true) as
select distinct on (player_id, day) player_id, name, score, dist, course, day, created_at
from public.scores
where day is not null
order by player_id, day, score desc, created_at;
grant select on public.daily_best to anon, authenticated;

-- Spöken: inspelningen av varje spelares bästa dagsåk (sparas bara via save_replay)
create table if not exists public.daily_replays (
  player_id text not null,
  day date not null,
  name text not null check (char_length(name) between 1 and 24),
  score integer not null check (score between 1 and 200000),
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);
alter table public.daily_replays enable row level security;
drop policy if exists "read replays" on public.daily_replays;
create policy "read replays" on public.daily_replays for select to anon, authenticated using (true);
revoke insert, update, delete on public.daily_replays from anon, authenticated;

create or replace function public.save_replay(p_day date, p_score integer, p_name text, p_data jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid text := (select auth.uid())::text;
begin
  if uid is null or p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then return false; end if;
  if p_score is null or p_score < 1 or p_score > 200000 then return false; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' or octet_length(p_data::text) > 80000 then return false; end if;
  insert into daily_replays (player_id, day, name, score, data)
    values (uid, p_day, left(coalesce(nullif(trim(p_name), ''), '?'), 24), p_score, p_data)
    on conflict (player_id, day) do update
      set name = excluded.name, score = excluded.score, data = excluded.data, created_at = now()
      where daily_replays.score < excluded.score;
  return true;
end $$;
revoke all on function public.save_replay(date, integer, text, jsonb) from public, anon;
grant execute on function public.save_replay(date, integer, text, jsonb) to authenticated;

-- ---------- Unika spelarnamn ----------
create table if not exists public.players (
  player_id text primary key check (char_length(player_id) between 8 and 64),
  name text not null check (char_length(name) between 3 and 16),
  updated_at timestamptz not null default now()
);
create unique index if not exists players_name_key on public.players (lower(name));
alter table public.players enable row level security;
drop policy if exists "read players" on public.players;
create policy "read players" on public.players for select to anon, authenticated using (true);
revoke insert, update, delete on public.players from anon, authenticated;

-- claim_name reserverar ett namn åt den inloggade spelaren (minst 3 tecken, skiftlägesokänsligt unikt)
drop function if exists public.claim_name(text, text);
create or replace function public.claim_name(p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n text := trim(p_name);
  uid text := (select auth.uid())::text;
begin
  if uid is null or char_length(n) < 3 or char_length(n) > 16 then return false; end if;
  if exists (select 1 from players where player_id = uid and updated_at > now() - interval '3 seconds') then return false; end if;
  if exists (select 1 from players where lower(name) = lower(n) and player_id <> uid) then return false; end if;
  insert into players (player_id, name) values (uid, n)
    on conflict (player_id) do update set name = excluded.name, updated_at = now();
  return true;
exception when unique_violation then
  return false;
end $$;
revoke all on function public.claim_name(text) from public, anon;
grant execute on function public.claim_name(text) to authenticated;

-- ---------- Online-party och race (Realtime) ----------
-- Spelets kanaler är privata: bara inloggade spelare, och bara kanaler som börjar med "ski-"
drop policy if exists "ski realtime read" on realtime.messages;
create policy "ski realtime read" on realtime.messages for select to authenticated
  using ((select realtime.topic()) like 'ski-%');
drop policy if exists "ski realtime write" on realtime.messages;
create policy "ski realtime write" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) like 'ski-%');
