-- Create a simple users tabler
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.users enable row level security;

-- Create policies for the users table
create policy "Users can view their own data"
on public.users for select
using (auth.uid() = id);

create policy "Users can insert their own data"
on public.users for insert
with check (auth.uid() = id);

create policy "Users can update their own data"
on public.users for update
using (auth.uid() = id);

-- Create function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, username)
  values (
    new.id, 
    new.email,
    split_part(new.email, '@', 1) -- Use email prefix as username
  );
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger to automatically create user record on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

  -- =========================================================
-- 0) EXTENSIONS & ENUMS
-- =========================================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('user','faculty','admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'post_status') then
    create type post_status as enum ('draft','scheduled','published','failed','canceled');
  end if;
end $$;

-- =========================================================
-- 1) USERS TABLE & TRIGGER
-- =========================================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique,
  role user_role not null default 'user',
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Basic RLS
alter table public.users enable row level security;
create policy "Users can view own"
  on public.users for select using (auth.uid() = id);
create policy "Users can insert own"
  on public.users for insert with check (auth.uid() = id);
create policy "Users can update own"
  on public.users for update using (auth.uid() = id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- Signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, username)
  values (new.id, new.email, split_part(new.email,'@',1))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 2) ROLE HELPER FUNCTIONS (place *after* users table exists)
-- =========================================================
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'::user_role
  );
$$;

create or replace function public.is_faculty() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'faculty'::user_role
  );
$$;

-- =========================================================
-- (Now you can safely create the rest of your schema:
--   social_platforms, social_accounts, media_assets,
--   posts, schedules, publications, analytics, etc.)
-- =========================================================
-- Extend your existing profile with role + display fields
alter table public.users
  add column if not exists role user_role not null default 'user',
  add column if not exists full_name text,
  add column if not exists avatar_url text;

-- Keep your triggers/policies; add an updated_at auto-touch
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- 2.1) Reference social platforms (Twitter/X, Facebook, IG, TikTok, etc.)
create table if not exists public.social_platforms (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,         -- 'facebook', 'instagram', 'x', 'tiktok', etc.
  api_base_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger social_platforms_set_updated_at
before update on public.social_platforms
for each row execute function public.set_updated_at();

-- 2.2) A user's connected social account per platform
create table if not exists public.social_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform_id uuid not null references public.social_platforms(id) on delete restrict,
  handle text,                       -- @yourbrand
  external_account_id text,          -- platform-side id
  status text default 'active',      -- 'active','revoked','expired'
  -- NEVER store raw tokens in plain text in production; put them in Vault or an external secrets store.
  token_identifier text,             -- pointer to secret (e.g., vault key)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform_id)
);
create index if not exists idx_social_accounts_user on public.social_accounts(user_id);
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.set_updated_at();

alter table public.social_accounts enable row level security;

drop policy if exists "own social_accounts select" on public.social_accounts;
create policy "own social_accounts select"
on public.social_accounts for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own social_accounts write" on public.social_accounts;
create policy "own social_accounts write"
on public.social_accounts for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());


create table if not exists public.media_assets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  storage_path text not null,        -- e.g., 'public/posts/abc123.jpg' (store in Supabase Storage)
  mime_type text,
  file_size bigint,
  checksum text,                     -- optional integrity check
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_media_assets_user on public.media_assets(user_id);
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

alter table public.media_assets enable row level security;

create policy "own media view"
on public.media_assets for select
using (auth.uid() = user_id or public.is_admin() or public.is_faculty());

create policy "own media write"
on public.media_assets for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());


-- 4.1) Posts (content authored by a user)
create table if not exists public.posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  body text,                          -- caption / content
  status post_status not null default 'draft',
  target_platform_ids uuid[] default '{}',  -- which platforms to publish to
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_posts_user on public.posts(user_id);
create index if not exists idx_posts_status on public.posts(status);
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- Assets attached to a post
create table if not exists public.post_assets (
  post_id uuid not null references public.posts(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  primary key(post_id, asset_id)
);

-- Row-Level Security
alter table public.posts enable row level security;
alter table public.post_assets enable row level security;

create policy "own posts read"
on public.posts for select
using (auth.uid() = user_id or public.is_admin() or public.is_faculty());  -- faculty view-only

create policy "own posts write"
on public.posts for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "post_assets read"
on public.post_assets for select
using (
  exists (
    select 1 from public.posts p
    where p.id = post_assets.post_id
      and (p.user_id = auth.uid() or public.is_admin() or public.is_faculty())
  )
);

create policy "post_assets write"
on public.post_assets for all
using (
  exists (
    select 1 from public.posts p
    where p.id = post_assets.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_assets.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
);

-- 4.2) Schedules (one post may have multiple scheduled runs)
create table if not exists public.schedules (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  scheduled_at timestamptz not null,
  timezone text default 'Asia/Manila',
  recurrence text,                     -- optional RRULE string
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_schedules_post on public.schedules(post_id);
create index if not exists idx_schedules_time on public.schedules(scheduled_at);
create trigger schedules_set_updated_at
before update on public.schedules
for each row execute function public.set_updated_at();

alter table public.schedules enable row level security;

create policy "own schedules read"
on public.schedules for select
using (
  exists (
    select 1 from public.posts p
    where p.id = schedules.post_id
      and (p.user_id = auth.uid() or public.is_admin() or public.is_faculty())
  )
);

create policy "own schedules write"
on public.schedules for all
using (
  exists (
    select 1 from public.posts p
    where p.id = schedules.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = schedules.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
);

-- 4.3) Publications (actual per-platform attempts/results)
create table if not exists public.publications (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform_id uuid not null references public.social_platforms(id) on delete restrict,
  scheduled_id uuid references public.schedules(id) on delete set null,
  published_at timestamptz,
  status post_status not null default 'scheduled',
  external_post_id text,
  external_url text,
  error_message text,                  -- if failed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_publications_post on public.publications(post_id);
create index if not exists idx_publications_platform on public.publications(platform_id);
create trigger publications_set_updated_at
before update on public.publications
for each row execute function public.set_updated_at();

alter table public.publications enable row level security;

create policy "own publications read"
on public.publications for select
using (
  exists (
    select 1 from public.posts p
    where p.id = public.publications.post_id
      and (p.user_id = auth.uid() or public.is_admin() or public.is_faculty())
  )
);

create policy "own publications write"
on public.publications for all
using (
  exists (
    select 1 from public.posts p
    where p.id = public.publications.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = public.publications.post_id
      and (p.user_id = auth.uid() or public.is_admin())
  )
);


-- 5.1) Metrics captured per publication (per pull or webhook)
create table if not exists public.analytics_metrics (
  id uuid primary key default uuid_generate_v4(),
  publication_id uuid not null references public.publications(id) on delete cascade,
  platform_id uuid not null references public.social_platforms(id) on delete restrict,
  captured_at timestamptz not null default now(),
  impressions integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  clicks integer,
  video_views integer,
  followers_delta integer,
  engagement_rate numeric(6,4),  -- precomputed if you like
  raw jsonb                      -- optional raw payload
);
create index if not exists idx_analytics_pub on public.analytics_metrics(publication_id);
create index if not exists idx_analytics_time on public.analytics_metrics(captured_at);

alter table public.analytics_metrics enable row level security;

create policy "analytics read (owner/faculty/admin)"
on public.analytics_metrics for select
using (
  exists (
    select 1
    from public.publications pub
    join public.posts p on p.id = pub.post_id
    where pub.id = analytics_metrics.publication_id
      and (p.user_id = auth.uid() or public.is_admin() or public.is_faculty())
  )
);

-- 5.2) Segments definition and (optional) members
create table if not exists public.segments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  definition jsonb not null,  -- store rules/filters used to compute the segment
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger segments_set_updated_at
before update on public.segments
for each row execute function public.set_updated_at();
create index if not exists idx_segments_user on public.segments(user_id);

alter table public.segments enable row level security;

create policy "segments read"
on public.segments for select
using (auth.uid() = user_id or public.is_admin() or public.is_faculty());

create policy "segments write"
on public.segments for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- Optional: audience members captured from platforms
create table if not exists public.segment_members (
  segment_id uuid not null references public.segments(id) on delete cascade,
  platform_id uuid not null references public.social_platforms(id) on delete restrict,
  external_user_id text not null,
  attributes jsonb,  -- snapshot of public attributes (avoid PII)
  primary key (segment_id, platform_id, external_user_id)
);
alter table public.segment_members enable row level security;

create policy "segment_members read"
on public.segment_members for select
using (
  exists (
    select 1 from public.segments s
    where s.id = segment_members.segment_id
      and (s.user_id = auth.uid() or public.is_admin() or public.is_faculty())
  )
);

create policy "segment_members write"
on public.segment_members for all
using (
  exists (
    select 1 from public.segments s
    where s.id = segment_members.segment_id
      and (s.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.segments s
    where s.id = segment_members.segment_id
      and (s.user_id = auth.uid() or public.is_admin())
  )
);


create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade, -- recipient
  type text not null,                   -- 'schedule_due','post_published','post_failed','evaluation_request', etc.
  payload jsonb,                        -- lightweight details
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id);
alter table public.notifications enable row level security;

create policy "notifications read (recipient or admin)"
on public.notifications for select
using (auth.uid() = user_id or public.is_admin());

create policy "notifications write (system/admin)"
on public.notifications for insert
with check (auth.uid() = user_id or public.is_admin());

-- Optional: allow updates to mark as read
create policy "notifications mark read"
on public.notifications for update
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());


create table if not exists public.system_logs (
  id bigserial primary key,
  actor_id uuid,                         -- nullable for background jobs
  actor_role user_role,
  action text not null,                  -- 'create_post','publish_attempt','metrics_pull', etc.
  entity text,                           -- 'post','publication','schedule','segment' ...
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_system_logs_entity on public.system_logs(entity, entity_id);
create index if not exists idx_system_logs_time on public.system_logs(created_at);

alter table public.system_logs enable row level security;

-- Admin sees all; users see summarized logs about their own entities; faculty see summaries
create policy "system_logs read (owner/faculty/admin)"
on public.system_logs for select
using (
  public.is_admin()
  or public.is_faculty()
  or exists (
    -- tie logs back to user's content (posts/publications/schedules)
    select 1
    from public.posts p
    where p.id = system_logs.entity_id and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.publications pub
    join public.posts p on p.id = pub.post_id
    where pub.id = system_logs.entity_id and p.user_id = auth.uid()
  )
);


-- If you’d like faculty as a true role, we already added role='faculty' to users.
-- This table requests a faculty member to review a post/publication.

create table if not exists public.evaluation_requests (
  id uuid primary key default uuid_generate_v4(),
  requested_by uuid not null references public.users(id) on delete cascade,  -- the owner/user
  faculty_id uuid not null references public.users(id) on delete cascade,    -- must have role='faculty'
  post_id uuid references public.posts(id) on delete cascade,
  publication_id uuid references public.publications(id) on delete cascade,
  status text not null default 'pending',  -- 'pending','reviewed','declined'
  notes text,
  created_at timestamptz default now(),
  responded_at timestamptz
);
create index if not exists idx_eval_faculty on public.evaluation_requests(faculty_id);
create index if not exists idx_eval_post on public.evaluation_requests(post_id);

alter table public.evaluation_requests enable row level security;

-- Requester can create & read their requests; assigned faculty can read/update status/notes; admin full
create policy "evaluation requester read"
on public.evaluation_requests for select
using (requested_by = auth.uid() or faculty_id = auth.uid() or public.is_admin());

create policy "evaluation requester create"
on public.evaluation_requests for insert
with check (requested_by = auth.uid() or public.is_admin());

create policy "evaluation requester update own"
on public.evaluation_requests for update
using (requested_by = auth.uid() or public.is_admin() or faculty_id = auth.uid())
with check (requested_by = auth.uid() or public.is_admin() or faculty_id = auth.uid());

create or replace view public.v_post_analytics_summary as
select
  p.user_id,
  p.id as post_id,
  coalesce(sum(am.impressions),0) as impressions,
  coalesce(sum(am.reach),0) as reach,
  coalesce(sum(am.likes),0) as likes,
  coalesce(sum(am.comments),0) as comments,
  coalesce(sum(am.shares),0) as shares,
  coalesce(sum(am.clicks),0) as clicks,
  count(distinct am.publication_id) as datapoints
from public.posts p
left join public.publications pub on pub.post_id = p.id
left join public.analytics_metrics am on am.publication_id = pub.id
group by 1,2;

-- Optional RLS via a SECURITY-BARRIER view pattern: wrap with a SECURITY INVOKER function if needed.
