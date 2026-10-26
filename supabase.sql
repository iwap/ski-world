-- Kör det här en gång i Supabase → SQL Editor. Skapar tabellen för den globala topplistan.
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

-- Alla får läsa och lägga till resultat, ingen får ändra eller ta bort
alter table public.scores enable row level security;
drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select to anon using (true);
drop policy if exists "add scores" on public.scores;
create policy "add scores" on public.scores for insert to anon with check (true);

-- Varje spelares bästa åk per bana (det är den som visas i topplistan)
create or replace view public.best_scores with (security_invoker = true) as
select distinct on (player_id, course) player_id, name, score, dist, course, difficulty, rider, created_at
from public.scores
order by player_id, course, score desc, created_at;
grant select on public.best_scores to anon;

-- Unika spelarnamn: claim_name reserverar ett namn (minst 3 tecken, skiftlägesokänsligt unikt)
create table if not exists public.players (
  player_id text primary key check (char_length(player_id) between 8 and 64),
  name text not null check (char_length(name) between 3 and 16),
  updated_at timestamptz not null default now()
);
create unique index if not exists players_name_key on public.players (lower(name));
alter table public.players enable row level security;
drop policy if exists "read players" on public.players;
create policy "read players" on public.players for select to anon using (true);

create or replace function public.claim_name(p_id text, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n text := trim(p_name);
begin
  if char_length(n) < 3 or char_length(n) > 16 then return false; end if;
  if exists (select 1 from players where lower(name) = lower(n) and player_id <> p_id) then return false; end if;
  insert into players (player_id, name) values (p_id, n)
    on conflict (player_id) do update set name = excluded.name, updated_at = now();
  return true;
exception when unique_violation then
  return false;
end $$;
grant execute on function public.claim_name(text, text) to anon;
