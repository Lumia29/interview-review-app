create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_type text not null,
  company text,
  job_title text not null,
  job_description text
);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  job_type text not null,
  company text,
  job_title text not null,
  interview_round text not null,
  job_description text,
  transcript text not null,
  report jsonb not null
);

alter table public.review_reports
add column if not exists job_id uuid references public.jobs(id) on delete set null;

alter table public.jobs enable row level security;
alter table public.review_reports enable row level security;

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read their own jobs" on public.jobs;
create policy "Users can read their own jobs"
on public.jobs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own jobs" on public.jobs;
create policy "Users can insert their own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own jobs" on public.jobs;
create policy "Users can update their own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own jobs" on public.jobs;
create policy "Users can delete their own jobs"
on public.jobs
for delete
to authenticated
using (auth.uid() = user_id);

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

create index if not exists jobs_user_updated_idx
on public.jobs (user_id, updated_at desc);

create index if not exists jobs_user_identity_idx
on public.jobs (user_id, job_type, company, job_title);

create index if not exists review_reports_job_created_idx
on public.review_reports (job_id, created_at desc);

insert into public.jobs (user_id, job_type, company, job_title, job_description)
select
  reports.user_id,
  reports.job_type,
  reports.company,
  reports.job_title,
  max(reports.job_description) filter (where reports.job_description is not null and reports.job_description <> '')
from public.review_reports reports
left join public.jobs existing
  on existing.user_id = reports.user_id
  and existing.job_type = reports.job_type
  and existing.company is not distinct from reports.company
  and existing.job_title = reports.job_title
where reports.job_id is null
  and existing.id is null
group by reports.user_id, reports.job_type, reports.company, reports.job_title;

update public.review_reports reports
set job_id = jobs.id
from public.jobs jobs
where reports.job_id is null
  and jobs.user_id = reports.user_id
  and jobs.job_type = reports.job_type
  and jobs.company is not distinct from reports.company
  and jobs.job_title = reports.job_title;
