create extension if not exists "pgcrypto";

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  job_type text not null,
  company text,
  job_title text not null,
  interview_round text not null,
  job_description text,
  transcript text not null,
  report jsonb not null
);

alter table public.review_reports enable row level security;

drop policy if exists "Users can read their own review reports" on public.review_reports;
create policy "Users can read their own review reports"
on public.review_reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own review reports" on public.review_reports;
create policy "Users can insert their own review reports"
on public.review_reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own review reports" on public.review_reports;
create policy "Users can update their own review reports"
on public.review_reports
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own review reports" on public.review_reports;
create policy "Users can delete their own review reports"
on public.review_reports
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists review_reports_user_created_idx
on public.review_reports (user_id, created_at desc);
