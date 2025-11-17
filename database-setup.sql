-- =====================================================================
-- AUTO-POSTING APP — FULL SUPABASE POSTGRES SCHEMA + UTILITIES
-- Includes:
--   • Core schema (connections, content, scheduling, analytics, features)
--   • RLS policies
--   • Indexes & views
--   • Partial unique index for dedupe
--   • Hot→Cold retention for analytics_events + archive functions
--   • Feature-builder (historic + future timeslots) with normalization
--   • FIX: media array → join tables (posts_media, scheduled_posts_media)
--   • FIX: UNIQUE index on mv_user_hourly_perf for concurrent refresh
--   • FIX: Replace functional UNIQUE indexes with partial UNIQUE indexes
-- =====================================================================

-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================
-- ENUMS
-- =========================
do $$ begin
  create type platform_enum as enum ('facebook','instagram');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_status_enum as enum ('draft','scheduled','posting','posted','failed','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_type_enum as enum ('image','video','reel','story','carousel','link');
exception when duplicate_object then null; end $$;

do $$ begin
  create type metric_enum as enum (
    'impressions','reach','likes','comments','shares','saves',
    'profile_visits','follows','clicks','video_views','engagement'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type log_step_enum as enum ('recommend','explore','post','reward','error');
exception when duplicate_object then null; end $$;

-- =========================
-- UTILS
-- =========================
create or replace function now_utc() returns timestamptz
language sql stable as $$ select timezone('UTC', now()) $$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now_utc();
  return new;
end $$;

-- =========================
-- CORE: USERS & CONNECTIONS
-- =========================
create table if not exists public.connected_meta_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  page_id text,
  page_name text,
  ig_user_id text,
  ig_username text,
  access_token text not null,
  token_expires_at timestamptz,
  scopes text[],
  created_at timestamptz not null default now_utc(),
  updated_at timestamptz not null default now_utc()
);
create index if not exists idx_cma_user_platform on public.connected_meta_accounts(user_id, platform);
create index if not exists idx_cma_token_expiry on public.connected_meta_accounts((token_expires_at));

drop trigger if exists trg_cma_updated on public.connected_meta_accounts;
create trigger trg_cma_updated before update on public.connected_meta_accounts
for each row execute function set_updated_at();

create table if not exists public.oauth_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  state text not null,
  code_verifier text,
  created_at timestamptz not null default now_utc(),
  expires_at timestamptz not null
);
create index if not exists idx_oauth_state_user_platform on public.oauth_state(user_id, platform);
create index if not exists idx_oauth_state_expires on public.oauth_state(expires_at);

-- =========================
-- CONTENT AUTHORING
-- =========================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  public_url text,
  width int,
  height int,
  duration_ms int,
  mime_type text,
  checksum bytea,
  created_at timestamptz not null default now_utc()
);
create index if not exists idx_media_user_created on public.media_assets(user_id, created_at desc);

create table if not exists public.captions_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null,
  hashtags text[],
  created_at timestamptz not null default now_utc(),
  updated_at timestamptz not null default now_utc()
);
drop trigger if exists trg_caps_updated on public.captions_library;
create trigger trg_caps_updated before update on public.captions_library
for each row execute function set_updated_at();

-- POSTS (no array FK; use join table below)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  caption text,
  post_type post_type_enum not null default 'image',
  tags text[],
  objective text,
  angle text,
  created_at timestamptz not null default now_utc(),
  updated_at timestamptz not null default now_utc()
);
create index if not exists idx_posts_user_created on public.posts(user_id, created_at desc);
drop trigger if exists trg_posts_updated on public.posts;
create trigger trg_posts_updated before update on public.posts
for each row execute function set_updated_at();

-- If an earlier run created posts.media_ids (uuid[]) drop it
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='posts' and column_name='media_ids'
  ) then
    alter table public.posts drop column media_ids;
  end if;
end$$;

-- =========================
-- SCHEDULING + PUBLICATION
-- =========================
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  target_id text not null,
  post_id uuid references public.posts(id) on delete set null,
  caption text,
  post_type post_type_enum not null default 'image',
  status post_status_enum not null default 'draft',
  recommended_score numeric,
  scheduled_at timestamptz,
  posted_at timestamptz,
  api_post_id text,
  permalink text,
  error_message text,
    objective text,
  angle text,
  created_at timestamptz not null default now_utc(),
  updated_at timestamptz not null default now_utc()
);
create index if not exists idx_sched_user_status_time on public.scheduled_posts(user_id, status, scheduled_at);
create index if not exists idx_sched_user_created on public.scheduled_posts(user_id, created_at desc);
create index if not exists idx_sched_platform_target on public.scheduled_posts(platform, target_id);
drop trigger if exists trg_sched_updated on public.scheduled_posts;
create trigger trg_sched_updated before update on public.scheduled_posts
for each row execute function set_updated_at();

-- If an earlier run created scheduled_posts.media_ids (uuid[]) drop it
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='scheduled_posts' and column_name='media_ids'
  ) then
    alter table public.scheduled_posts drop column media_ids;
  end if;
end$$;

-- PARTIAL UNIQUE (dedupe accidental double schedules while pending)
create unique index if not exists uq_scheduled_dedup
  on public.scheduled_posts (user_id, platform, scheduled_at, post_id)
  where status in ('scheduled','posting');

-- Optional dedupe guard for schedules without a post_id (commented)
-- create unique index if not exists uq_sched_dedup_nodraft
--   on public.scheduled_posts (user_id, platform, scheduled_at, md5(coalesce(caption,'')))
--   where status in ('scheduled','posting') and post_id is null;

create table if not exists public.post_logs (
  id bigserial primary key,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete cascade,
  step log_step_enum not null,
  request_summary jsonb,
  response_summary jsonb,
  reward numeric,
  created_at timestamptz not null default now_utc()
);
create index if not exists idx_postlogs_sched_created on public.post_logs(scheduled_post_id, created_at desc);
create index if not exists idx_postlogs_step_created on public.post_logs(step, created_at desc);

-- =========================
-- MEDIA JOIN TABLES (ordered)
-- =========================
create table if not exists public.posts_media (
  id bigserial primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  position int not null default 1,
  created_at timestamptz not null default now_utc()
);
create unique index if not exists uq_posts_media_unique
  on public.posts_media(post_id, media_id);
create unique index if not exists uq_posts_media_position
  on public.posts_media(post_id, position);
create index if not exists idx_posts_media_post_pos
  on public.posts_media(post_id, position);

create table if not exists public.scheduled_posts_media (
  id bigserial primary key,
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  position int not null default 1,
  created_at timestamptz not null default now_utc()
);
create unique index if not exists uq_sched_media_unique
  on public.scheduled_posts_media(scheduled_post_id, media_id);
create unique index if not exists uq_sched_media_position
  on public.scheduled_posts_media(scheduled_post_id, position);
create index if not exists idx_sched_media_sched_pos
  on public.scheduled_posts_media(scheduled_post_id, position);

-- =========================
-- ANALYTICS (HOT)
-- =========================
create table if not exists public.analytics_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  object_id text,
  metric metric_enum not null,
  value numeric not null,
  ts timestamptz not null
  constraint uq_analytics_event_unique unique (user_id, platform, object_id, metric, ts);

);
create index if not exists idx_analytics_user_ts on public.analytics_events(user_id, ts desc);
create index if not exists idx_analytics_object_metric on public.analytics_events(object_id, metric);

-- =========================
-- ANALYTICS COLD ARCHIVE + UNION VIEW + ARCHIVE FUNCTIONS
-- =========================
create table if not exists public.analytics_events_cold (
  like public.analytics_events including all
);
create index if not exists analytics_cold_ts_idx
  on public.analytics_events_cold (user_id, ts desc);

create or replace view public.v_analytics_events_all as
  select * from public.analytics_events
  union all
  select * from public.analytics_events_cold;

create or replace function public.archive_analytics_events(months_old int default 6)
returns json language plpgsql security definer as $$
declare
  cutoff timestamptz := now() - make_interval(months => months_old);
  moved bigint;
  deleted bigint;
begin
  insert into public.analytics_events_cold
  select * from public.analytics_events
  where ts < cutoff;
  get diagnostics moved = row_count;

  delete from public.analytics_events
  where ts < cutoff;
  get diagnostics deleted = row_count;

  return json_build_object('moved', moved, 'deleted', deleted, 'cutoff', cutoff);
end $$;

create or replace function public.archive_analytics_events_6m()
returns json language sql security definer as $$
  select public.archive_analytics_events(6);
$$;

-- =========================
-- FEATURE STORE
-- =========================
create table if not exists public.features_engagement_timeslots (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  timeslot timestamptz not null,
  dow int not null check (dow between 0 and 6),
  hour int not null check (hour between 0 and 23),
  is_weekend boolean generated always as (dow in (0,6)) stored,
  is_holiday boolean default false,
  post_type post_type_enum,
  audience_segment_id int,
  seasonal_daily double precision,
  seasonal_weekly double precision,
  recent_avg_engagement numeric,
  user_recent_avg_7d numeric,
  hour_dow_ctr_28d numeric,
  post_type_ctr_14d numeric,
  label_engagement numeric,
  industry industry_enum,
  constraint uq_feats_timeslot unique (user_id, platform, timeslot),
  created_at timestamptz not null default now_utc()
);

-- (IMMUTABILITY-SAFE) UNIQUE constraints for timeslots:
-- Replace functional unique (with COALESCE) by partial uniques
drop index if exists uq_timeslot_user_platform;

-- Case A: post_type IS NULL -> unique on (user_id, platform, timeslot)
create unique index if not exists uq_feats_timeslot_null
  on public.features_engagement_timeslots (user_id, platform, timeslot)
  where post_type is null;

-- Case B: post_type IS NOT NULL -> unique on (user_id, platform, timeslot, post_type)
create unique index if not exists uq_feats_timeslot_pt
  on public.features_engagement_timeslots (user_id, platform, timeslot, post_type)
  where post_type is not null;

create index if not exists idx_feats_user_created on public.features_engagement_timeslots(user_id, created_at desc);

-- For fast future scoring lookups
create index if not exists idx_feats_future_lookup
  on public.features_engagement_timeslots (user_id, platform, timeslot)
  where label_engagement is null;

-- Materialized rollup for heatmaps
create materialized view if not exists public.mv_user_hourly_perf as
select
  user_id,
  platform,
  dow,
  hour,
  avg(label_engagement) as avg_engagement,
  count(*) as n
from public.features_engagement_timeslots
group by 1,2,3,4;

-- UNIQUE index required for REFRESH CONCURRENTLY
do $$
begin
  perform 1
  from pg_indexes
  where schemaname = 'public' and indexname = 'uq_mv_hourly_perf';
  if not found then
    create unique index uq_mv_hourly_perf
      on public.mv_user_hourly_perf(user_id, platform, dow, hour);
  end if;
end$$;

-- =========================
-- SEGMENTATION
-- =========================
create table if not exists public.audience_segments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_id int not null,
  size int,
  summary jsonb,
  updated_at timestamptz not null default now_utc()
);
create unique index if not exists uq_segments_user_segment on public.audience_segments(user_id, segment_id);

-- =========================
-- BANDIT (Contextual Thompson Sampling)
-- =========================
create table if not exists public.bandit_contexts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  segment_id int,
  weekday int check (weekday between 0 and 6),
  hour_block int check (hour_block between 0 and 23),
  post_type post_type_enum,
  prior_success double precision not null default 1.0,
  prior_failure double precision not null default 1.0,
  updated_at timestamptz not null default now_utc()
);

-- (IMMUTABILITY-SAFE) UNIQUE constraints replacing COALESCE on nullable cols
drop index if exists uq_bandit_ctx;

-- 1) segment_id NULL, post_type NULL
create unique index if not exists uq_bandit_ctx_segnull_ptnull
  on public.bandit_contexts (user_id, platform, weekday, hour_block)
  where segment_id is null and post_type is null;

-- 2) segment_id NULL, post_type NOT NULL
create unique index if not exists uq_bandit_ctx_segnull_pt
  on public.bandit_contexts (user_id, platform, weekday, hour_block, post_type)
  where segment_id is null and post_type is not null;

-- 3) segment_id NOT NULL, post_type NULL
create unique index if not exists uq_bandit_ctx_seg_ptnull
  on public.bandit_contexts (user_id, platform, segment_id, weekday, hour_block)
  where segment_id is not null and post_type is null;

-- 4) segment_id NOT NULL, post_type NOT NULL
create unique index if not exists uq_bandit_ctx_seg_pt
  on public.bandit_contexts (user_id, platform, segment_id, weekday, hour_block, post_type)
  where segment_id is not null and post_type is not null;

create index if not exists idx_bandit_ctx_updated on public.bandit_contexts(user_id, updated_at desc);

create table if not exists public.bandit_rewards (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  context_id bigint references public.bandit_contexts(id) on delete cascade,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete set null,
  reward numeric not null,
  created_at timestamptz not null default now_utc()
);
create index if not exists idx_bandit_rewards_user_created on public.bandit_rewards(user_id, created_at desc);

-- =========================
-- MODEL REGISTRY & CACHE
-- =========================
create table if not exists public.model_registry (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,
  version text not null,
  artifact_url text not null,
  metrics jsonb,
  created_at timestamptz not null default now_utc()
);
create index if not exists idx_model_registry_user_model on public.model_registry(user_id, model_name, created_at desc);

create table if not exists public.recommendations_cache (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  generated_at timestamptz not null default now_utc(),
  horizon_days int not null default 14,
  payload jsonb not null
);
create index if not exists idx_rec_cache_user_platform on public.recommendations_cache(user_id, platform, generated_at desc);

-- =========================
-- OPS / WEBHOOKS / AUDIT
-- =========================
create table if not exists public.jobs (
  id bigserial primary key,
  job_name text not null,
  status text not null check (status in ('queued','running','success','error')),
  started_at timestamptz default now_utc(),
  finished_at timestamptz,
  details jsonb
);
create index if not exists idx_jobs_name_started on public.jobs(job_name, started_at desc);

create table if not exists public.webhooks_meta (
  id uuid primary key default gen_random_uuid(),
  platform platform_enum not null,
  verify_token text not null,
  created_at timestamptz not null default now_utc()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now_utc()
);
create index if not exists idx_audit_user_created on public.audit_logs(user_id, created_at desc);

-- =========================
-- RLS (Row Level Security)
-- =========================
alter table public.connected_meta_accounts enable row level security;
alter table public.oauth_state enable row level security;

alter table public.media_assets enable row level security;
alter table public.captions_library enable row level security;
alter table public.posts enable row level security;

alter table public.scheduled_posts enable row level security;
alter table public.post_logs enable row level security;

alter table public.posts_media enable row level security;
alter table public.scheduled_posts_media enable row level security;

alter table public.analytics_events enable row level security;
alter table public.analytics_events_cold enable row level security;
alter table public.features_engagement_timeslots enable row level security;

alter table public.audience_segments enable row level security;
alter table public.bandit_contexts enable row level security;
alter table public.bandit_rewards enable row level security;

alter table public.model_registry enable row level security;
alter table public.recommendations_cache enable row level security;

alter table public.jobs enable row level security;
alter table public.webhooks_meta enable row level security;
alter table public.audit_logs enable row level security;

-- Admin-close ops tables by default
do $$
begin
  begin
    create policy jobs_no_access on public.jobs for all using (false);
  exception when duplicate_object then null; end;

  begin
    create policy webhooks_no_access on public.webhooks_meta for all using (false);
  exception when duplicate_object then null; end;

  begin
    create policy audit_no_access on public.audit_logs for all using (false);
  exception when duplicate_object then null; end;
end$$;

-- User-scoped policies
do $$
begin
  begin
    create policy cma_user_rw on public.connected_meta_accounts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy oauth_user_rw on public.oauth_state
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy assets_user_rw on public.media_assets
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy caps_user_rw on public.captions_library
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy posts_user_rw on public.posts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy sched_user_rw on public.scheduled_posts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy postlogs_user_ro on public.post_logs
      for select using (
        auth.uid() in (select user_id from public.scheduled_posts sp where sp.id = scheduled_post_id)
      );
  exception when duplicate_object then null; end;

  begin
    create policy postlogs_user_write on public.post_logs
      for insert with check (true);
  exception when duplicate_object then null; end;

  begin
    create policy posts_media_user_rw on public.posts_media
      for all using (
        auth.uid() in (select p.user_id from public.posts p where p.id = post_id)
      )
      with check (
        auth.uid() in (select p.user_id from public.posts p where p.id = post_id)
      );
  exception when duplicate_object then null; end;

  begin
    create policy sched_media_user_rw on public.scheduled_posts_media
      for all using (
        auth.uid() in (select sp.user_id from public.scheduled_posts sp where sp.id = scheduled_post_id)
      )
      with check (
        auth.uid() in (select sp.user_id from public.scheduled_posts sp where sp.id = scheduled_post_id)
      );
  exception when duplicate_object then null; end;

  begin
    create policy analytics_user_rw on public.analytics_events
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy analytics_cold_user_rw on public.analytics_events_cold
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy feats_user_rw on public.features_engagement_timeslots
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy seg_user_rw on public.audience_segments
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy bandit_ctx_user_rw on public.bandit_contexts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy bandit_r_user_rw on public.bandit_rewards
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy modelreg_user_rw on public.model_registry
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;

  begin
    create policy rec_cache_user_rw on public.recommendations_cache
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;
end$$;


-- =========================
-- INDEXING HINTS
-- =========================
create index if not exists idx_sched_due on public.scheduled_posts(status, scheduled_at)
  where status in ('scheduled','posting');

create index if not exists idx_analytics_ts on public.analytics_events(user_id, ts desc);

create index if not exists idx_feats_dow_hour on public.features_engagement_timeslots(user_id, platform, dow, hour);

-- =========================
-- VIEWS (Developer-friendly)
-- =========================
create or replace view public.v_user_recent_engagement as
select
  user_id,
  platform,
  date_trunc('day', ts) as day,
  sum(case when metric = 'engagement' then value else 0 end) as engagement,
  sum(case when metric = 'impressions' then value else 0 end) as impressions
from public.v_analytics_events_all
group by 1,2,3;

create or replace view public.v_best_time_slots as
select
  user_id, platform, dow, hour,
  avg(label_engagement) as predicted_avg
from public.features_engagement_timeslots
group by 1,2,3,4
order by predicted_avg desc;

-- Media-as-array helper views (ordered)
create or replace view public.v_posts_with_media as
select
  p.*,
  coalesce(
    (select array_agg(pm.media_id order by pm.position)
     from public.posts_media pm
     where pm.post_id = p.id),
    '{}'
  ) as media_ids
from public.posts p;

create or replace view public.v_scheduled_posts_with_media as
select
  sp.id,
  sp.user_id,
  sp.platform,
  sp.target_id,
  sp.post_id,
  sp.caption,
  sp.post_type,
  sp.status,
  sp.recommended_score,
  sp.scheduled_at,
  sp.posted_at,
  sp.api_post_id,
  sp.permalink,
  sp.error_message,
  sp.objective,
  sp.angle,
  sp.attempts,
  sp.created_at,
  sp.updated_at,
  coalesce(
    (select array_agg(spm.media_id order by spm.position)
     from public.scheduled_posts_media spm
     where spm.scheduled_post_id = sp.id),
    '{}'
  ) as media_ids
from public.scheduled_posts sp;

-- =========================
-- HELPERS & FEATURE BUILDER
-- =========================
create or replace function public.norm_engagement(
  e numeric,
  p10 double precision,
  p90 double precision
) returns numeric
language sql
immutable
as $$
  select greatest(
    0,
    least(
      1,
      (e - p10::numeric) / nullif(p90::numeric - p10::numeric, 0)
    )
  )
$$;

create or replace function public.build_timeslot_features(
  p_user_id uuid,
  p_platform platform_enum,
  p_history_days int default 90,
  p_future_days int default 14
) returns json
language plpgsql
security definer
as $$
declare
  history_start timestamptz := now() - make_interval(days => p_history_days);
  history_end   timestamptz := now();
  future_end    timestamptz := now() + make_interval(days => p_future_days);
  ins_hist      bigint;
  ins_future    bigint;
  v_industry    industry_enum;
begin
  -- Resolve user's industry once; fallback to 'other'
  select bp.industry
  into v_industry
  from public.brand_profiles bp
  where bp.user_id = p_user_id
  limit 1;

  if v_industry is null then
    v_industry := 'other'::industry_enum;
  end if;

  -- HISTORICAL (labels)
  with hist as (
    select
      p_user_id                  as user_id,
      p_platform                 as platform,
      date_trunc('hour', ts)     as timeslot,
      extract(dow  from ts)::int as dow,
      extract(hour from ts)::int as hour,
      sum(case when metric = 'likes'       then value else 0 end) as likes,
      sum(case when metric = 'comments'    then value else 0 end) as comments,
      sum(case when metric = 'saves'       then value else 0 end) as saves,
      sum(case when metric = 'shares'      then value else 0 end) as shares,
      sum(case when metric = 'impressions' then value else 0 end) as impressions
    from public.v_analytics_events_all
    where user_id = p_user_id
      and platform = p_platform
      and ts >= history_start
      and ts <  history_end
    group by 1,2,3,4,5
  ),
  hist_e as (
    select
      user_id,
      platform,
      timeslot,
      dow,
      hour,
      case
        when impressions <= 0 then 0
        else (likes + comments + 0.5*saves + 0.2*shares) / impressions
      end as engagement
    from hist
  ),
  bounds as (
    select
      user_id,
      platform,
      percentile_cont(0.10) within group (order by engagement) as p10,
      percentile_cont(0.90) within group (order by engagement) as p90
    from hist_e
    group by 1,2
  ),
  hist_norm as (
    select
      h.user_id,
      h.platform,
      h.timeslot,
      h.dow,
      h.hour,
      public.norm_engagement(h.engagement, b.p10, b.p90) as label_engagement
    from hist_e h
    join bounds b using (user_id, platform)
  ),
  recency as (
    select
      p_user_id as user_id,
      p_platform as platform,
      extract(dow  from ts)::int as dow,
      extract(hour from ts)::int as hour,
      avg(case when metric = 'engagement'   then value else null end) filter (where metric='engagement')   as avg_engagement_hour_dow,
      avg(case when metric = 'impressions' then value else null end) filter (where metric='impressions') as avg_impr_hour_dow
    from public.v_analytics_events_all
    where user_id = p_user_id
      and platform = p_platform
      and ts >= history_start
      and ts <  history_end
    group by 1,2,3,4
  )
  insert into public.features_engagement_timeslots (
    user_id, platform, timeslot, dow, hour,
    is_holiday, post_type, audience_segment_id,
    seasonal_daily, seasonal_weekly,
    recent_avg_engagement, user_recent_avg_7d,
    hour_dow_ctr_28d, post_type_ctr_14d,
    label_engagement,
    industry
  )
  select
    h.user_id, h.platform, h.timeslot, h.dow, h.hour,
    false as is_holiday,
    null::post_type_enum as post_type,
    null::int as audience_segment_id,
    sin(2*pi()*h.hour/24.0)::float8 as seasonal_daily,
    sin(2*pi()*h.dow/7.0)::float8  as seasonal_weekly,
    r.avg_engagement_hour_dow as recent_avg_engagement,
    r.avg_engagement_hour_dow as user_recent_avg_7d,
    case when r.avg_impr_hour_dow is null or r.avg_impr_hour_dow = 0
      then null
      else (r.avg_engagement_hour_dow / r.avg_impr_hour_dow)
    end as hour_dow_ctr_28d,
    null::numeric as post_type_ctr_14d,
    h.label_engagement,
    v_industry as industry
  from hist_norm h
  left join recency r
    on r.user_id = h.user_id
   and r.platform = h.platform
   and r.dow = h.dow
   and r.hour = h.hour
  on conflict (user_id, platform, timeslot)
  do update set
    dow                   = excluded.dow,
    hour                  = excluded.hour,
    seasonal_daily        = excluded.seasonal_daily,
    seasonal_weekly       = excluded.seasonal_weekly,
    recent_avg_engagement = excluded.recent_avg_engagement,
    user_recent_avg_7d    = excluded.user_recent_avg_7d,
    hour_dow_ctr_28d      = excluded.hour_dow_ctr_28d,
    post_type_ctr_14d     = excluded.post_type_ctr_14d,
    label_engagement      = excluded.label_engagement,
    industry              = excluded.industry,
    created_at            = now_utc()
  ;
  get diagnostics ins_hist = row_count;

  -- FUTURE (no labels)
  with future_slots as (
    select
      p_user_id  as user_id,
      p_platform as platform,
      gs as timeslot,
      extract(dow  from gs)::int  as dow,
      extract(hour from gs)::int  as hour
    from generate_series(
      date_trunc('hour', now()),
      date_trunc('hour', now() + make_interval(days => p_future_days)),
      interval '1 hour'
    ) as gs
  ),
  recency as (
    select
      p_user_id as user_id,
      p_platform as platform,
      extract(dow  from ts)::int as dow,
      extract(hour from ts)::int as hour,
      avg(case when metric = 'engagement'   then value else null end) filter (where metric='engagement')   as avg_engagement_hour_dow,
      avg(case when metric = 'impressions' then value else null end) filter (where metric='impressions') as avg_impr_hour_dow
    from public.v_analytics_events_all
    where user_id = p_user_id
      and platform = p_platform
      and ts >= (now() - make_interval(days => p_history_days))
      and ts <  now()
    group by 1,2,3,4
  )
  insert into public.features_engagement_timeslots (
    user_id, platform, timeslot, dow, hour,
    is_holiday, post_type, audience_segment_id,
    seasonal_daily, seasonal_weekly,
    recent_avg_engagement, user_recent_avg_7d,
    hour_dow_ctr_28d, post_type_ctr_14d,
    label_engagement,
    industry
  )
  select
    f.user_id, f.platform, f.timeslot, f.dow, f.hour,
    false as is_holiday,
    null::post_type_enum as post_type,
    null::int as audience_segment_id,
    sin(2*pi()*f.hour/24.0)::float8 as seasonal_daily,
    sin(2*pi()*f.dow/7.0)::float8  as seasonal_weekly,
    r.avg_engagement_hour_dow as recent_avg_engagement,
    r.avg_engagement_hour_dow as user_recent_avg_7d,
    case when r.avg_impr_hour_dow is null or r.avg_impr_hour_dow = 0
      then null
      else (r.avg_engagement_hour_dow / r.avg_impr_hour_dow)
    end as hour_dow_ctr_28d,
    null::numeric as post_type_ctr_14d,
    null::numeric as label_engagement,
    v_industry as industry
  from future_slots f
  left join recency r
    on r.user_id = f.user_id
   and r.platform = f.platform
   and r.dow = f.dow
   and r.hour = f.hour
  on conflict (user_id, platform, timeslot)
  do update set
    dow                   = excluded.dow,
    hour                  = excluded.hour,
    seasonal_daily        = excluded.seasonal_daily,
    seasonal_weekly       = excluded.seasonal_weekly,
    recent_avg_engagement = excluded.recent_avg_engagement,
    user_recent_avg_7d    = excluded.user_recent_avg_7d,
    hour_dow_ctr_28d      = excluded.hour_dow_ctr_28d,
    post_type_ctr_14d     = excluded.post_type_ctr_14d,
    industry              = excluded.industry,
    created_at            = now_utc()
  ;
  get diagnostics ins_future = row_count;

  -- Refresh heatmap (requires UNIQUE index on mv)
  refresh materialized view concurrently public.mv_user_hourly_perf;

  return json_build_object(
    'inserted_or_updated_historic', ins_hist,
    'inserted_or_updated_future',  ins_future,
    'history_days',                p_history_days,
    'future_days',                 p_future_days
  );
end;
$$;



-- 1) Ensure the bucket exists and is public
insert into storage.buckets (id, name, public)
values ('media','media', true)
on conflict (id) do nothing;

-- 2) Public read for the media bucket
drop policy if exists "Public read media" on storage.objects;
create policy "Public read media"
on storage.objects for select
to public
using (bucket_id = 'media');

-- 3) Authenticated users can INSERT files into their own folder: {uid}/...
drop policy if exists "Users can upload to their folder" on storage.objects;
create policy "Users can upload to their folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'media'
  and name like auth.uid()::text || '/%'   -- path starts with their UID/
);

-- 4) Authenticated users can UPDATE their own files
drop policy if exists "Users can update their files" on storage.objects;
create policy "Users can update their files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'media'
  and name like auth.uid()::text || '/%'
)
with check (
  bucket_id = 'media'
  and name like auth.uid()::text || '/%'
);

-- 5) Authenticated users can DELETE their own files
drop policy if exists "Users can delete their files" on storage.objects;
create policy "Users can delete their files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and name like auth.uid()::text || '/%'
);


-- =========================
-- DONE
-- =========================
-- RPC: create_post_with_schedules
-- Atomic post + schedules writer
create or replace function public.create_post_with_schedules(
  p_user_id uuid,
  p_caption text,
  p_post_type post_type_enum,
  p_media_ids uuid[],                 -- ordered
  p_platforms platform_enum[],        -- same length as p_target_ids
  p_target_ids text[],                -- 1-1 with platforms
  p_status post_status_enum,          -- 'draft' for calendar, or 'scheduled'
  p_scheduled_at timestamptz          -- nullable for plain draft post
) returns table(post_id uuid, scheduled_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
  v_sched_ids uuid[] := '{}';
  i int;
begin
  -- Enforce caller = owner
  if p_user_id <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  -- 1) Create the post
  insert into public.posts(user_id, caption, post_type)
  values (p_user_id, p_caption, p_post_type)
  returning id into v_post_id;

  -- 2) Attach ordered media
  if p_media_ids is not null then
    insert into public.posts_media(post_id, media_id, position)
    select v_post_id, mid, idx
    from unnest(p_media_ids) with ordinality as t(mid, idx);
  end if;

  -- 3) Schedules (optional)
  if p_platforms is not null and p_target_ids is not null then
    if array_length(p_platforms,1) <> array_length(p_target_ids,1) then
      raise exception 'platforms and target_ids length mismatch';
    end if;

    for i in 1..coalesce(array_length(p_platforms,1),0) loop
      declare v_sched_id uuid;
      begin
        insert into public.scheduled_posts(
          user_id, platform, target_id, post_id,
          caption, post_type, status, scheduled_at
        ) values (
          p_user_id, p_platforms[i], p_target_ids[i], v_post_id,
          p_caption, p_post_type, p_status, p_scheduled_at
        ) returning id into v_sched_id;

        -- link media to scheduled post (preserve order)
        if p_media_ids is not null then
          insert into public.scheduled_posts_media(scheduled_post_id, media_id, position)
          select v_sched_id, mid, idx
          from unnest(p_media_ids) with ordinality as t(mid, idx);
        end if;

        v_sched_ids := array_append(v_sched_ids, v_sched_id);
      end;
    end loop;
  end if;

  return query select v_post_id, v_sched_ids;
end $$;

alter table public.scheduled_posts
  add column if not exists attempts int not null default 0;

-- atomic failure handler: attempts+1, set status back to 'scheduled' so next tick can retry
create or replace function public.sp_attempt_fail(p_id uuid, p_message text)
returns void
language sql
security definer
as $$
  update public.scheduled_posts
     set attempts = coalesce(attempts,0) + 1,
         status = 'scheduled',
         error_message = p_message,
         updated_at = now()
   where id = p_id;
$$;

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text,
  created_at timestamptz default now()
);
create index if not exists idx_user_devices_user on public.user_devices(user_id);
alter table public.user_devices enable row level security;

do $$ begin
  create policy devices_user_rw on public.user_devices
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.sp_insights_candidate_posts(p_since timestamptz)
returns table (
  id uuid,
  user_id uuid,
  platform platform_enum,
  api_post_id text,
  posted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    id,
    user_id,
    platform,
    api_post_id,
    coalesce(posted_at, scheduled_at, created_at) as posted_at
  from public.scheduled_posts
  where status = 'posted'
    and coalesce(posted_at, scheduled_at, created_at) >= p_since
    and api_post_id is not null;
$$;

create or replace function public.get_time_segment_recommendations(
  p_platform      platform_enum default null,
  p_horizon_days  int           default 7
)
returns table (
  platform      platform_enum,
  timeslot      timestamptz,
  dow           int,
  hour          int,
  predicted_avg numeric,
  segment_id    int,
  segment_name  text
)
language sql
security definer
set search_path = public
as $$
  with base as (
   select
      f.user_id,
      f.platform,
      f.timeslot,
      extract(dow  from f.timeslot)::int  as dow,
      extract(hour from f.timeslot)::int  as hour,
      f.label_engagement,
      f.user_recent_avg_7d,
      f.post_type,
      f.audience_segment_id               as segment_id
    from public.features_engagement_timeslots f
    where f.timeslot >= date_trunc('hour', now_utc())
      and f.timeslot <  date_trunc('hour', now_utc())
                          + (p_horizon_days || ' days')::interval
  ),
  brand as (
    select
      bp.user_id,
      bp.industry
    from public.brand_profiles bp
    where bp.user_id = auth.uid()
  ),
  -- Combine per-timeslot label, recent avg, and GLOBAL + INDUSTRY priors
  scored as (
    select
      b.user_id,
      b.platform,
      b.timeslot,
      b.dow,
      b.hour,
      b.segment_id,
      b.post_type,
      case
        -- 1) direct per-timeslot label if we have it
        when b.label_engagement   is not null then b.label_engagement
        -- 2) recent user average for this platform
        when b.user_recent_avg_7d is not null then b.user_recent_avg_7d
        -- 3) industry-specific prior
        when ghp_ind.prior_score   is not null then ghp_ind.prior_score
        -- 4) global prior fallback
        when ghp_global.prior_score is not null then ghp_global.prior_score
        -- 5) hard default (tweak if you like)
        else 0.2::numeric
      end as predicted_avg
    from base b
    left join brand br
      on br.user_id = b.user_id
    -- industry-specific priors
    left join public.global_hourly_priors ghp_ind
      on ghp_ind.platform = b.platform
     and ghp_ind.dow      = b.dow
     and ghp_ind.hour     = b.hour
     and ghp_ind.industry = coalesce(br.industry, 'other'::industry_enum)
    -- global fallbacks (industry is null)
    left join public.global_hourly_priors ghp_global
      on ghp_global.platform = b.platform
     and ghp_global.dow      = b.dow
     and ghp_global.hour     = b.hour
     and ghp_global.industry = 'other'::industry_enum
  ),
  -- Mix in bandit parameters (alpha/beta) to get a hybrid score
  scored_with_bandit as (
    select
      s.user_id,
      s.platform,
      s.timeslot,
      s.dow,
      s.hour,
      s.segment_id,
      s.post_type,
      s.predicted_avg,
      bp2.context_id,
      bp2.alpha,
      bp2.beta,
      case
        when bp2.context_id is null
             or (bp2.alpha + bp2.beta) <= 0
          then s.predicted_avg
        else
          -- blend model prediction + bandit mean
          0.7 * s.predicted_avg
          + 0.3 * (bp2.alpha::numeric / (bp2.alpha + bp2.beta))
      end as final_score
    from scored s
    -- pick the best-matching context via lateral join:
    left join lateral (
      select
        bp.context_id,
        bp.alpha,
        bp.beta
      from public.v_bandit_params bp
      where bp.user_id    = s.user_id
        and bp.platform   = s.platform
        and bp.weekday    = s.dow
        and bp.hour_block = s.hour
        and (
             -- exact match on segment + post_type
             (bp.segment_id is not distinct from s.segment_id
              and bp.post_type is not distinct from s.post_type)
          or (bp.segment_id is not distinct from s.segment_id
              and bp.post_type is null)
          or (bp.segment_id is null
              and bp.post_type is not distinct from s.post_type)
          or (bp.segment_id is null
              and bp.post_type is null)
        )
      order by
        -- prefer most specific: (segment + post_type) > segment-only/post-type-only > generic
        (
          (bp.segment_id is not distinct from s.segment_id)::int +
          (bp.post_type  is not distinct from s.post_type)::int
        ) desc
      limit 1
    ) bp2 on true
  ),
  seg as (
    select
      user_id,
      segment_id,
      (summary ->> 'name')::text as segment_name
    from public.audience_segments
    where user_id = auth.uid()
  )
  select
    b.platform,
    b.timeslot,
    b.dow,
    b.hour,
    b.final_score as predicted_avg,
    b.segment_id,
    coalesce(seg.segment_name, null) as segment_name
  from scored_with_bandit b
  left join seg
    on seg.user_id   = b.user_id
   and seg.segment_id = b.segment_id
  order by b.final_score desc nulls last, b.timeslot
  limit 20;
$$;


create table if not exists public.global_hourly_priors (
  id bigserial primary key,
  platform platform_enum not null,
  dow int not null check (dow between 0 and 6),
  hour int not null check (hour between 0 and 23),
  prior_score numeric not null, -- 0–1, roughly like label_engagement
  industry industry_enum not null default 'other',
  constraint uq_global_hour unique (platform, industry, dow, hour)
);

with
-- hours 0–23 and days 0–6
hours as (
  select generate_series(0, 23) as hour
),
days as (
  select generate_series(0, 6) as dow
),

-- Base hourly pattern (before industry)
-- dow: 0 = Sunday, 6 = Saturday
base_pattern as (
  select
    d.dow      as base_dow,
    h.hour     as base_hour,
    (
      -- 1. Raw hour-of-day shape (global + PH trend-ish)
      case
        -- Very low: 0–4 AM
        when h.hour between 0 and 4 then 0.10

        -- Early: 5–7 AM
        when h.hour between 5 and 7 then 0.20

        -- Workday: 8–11 AM
        when h.hour between 8 and 11 then 0.35

        -- Lunch spike: 12–13
        when h.hour between 12 and 13 then 0.55

        -- Afternoon dip: 14–16
        when h.hour between 14 and 16 then 0.35

        -- Early evening ramp: 17–18
        when h.hour between 17 and 18 then 0.55

        -- Prime time: 19–21
        when h.hour between 19 and 21 then 0.80

        -- Late evening: 22–23
        when h.hour between 22 and 23 then 0.50

        else 0.30
      end
    )
    *
    (
      -- 2. Day-of-week modifier
      case
        when d.dow in (0, 6) then 1.10  -- Sun / Sat
        when d.dow = 5 then 1.05        -- Fri
        else 1.00                       -- Mon–Thu
      end
    ) as base_score
  from days d
  cross join hours h
),

-- Enumerate industries from your existing enum
industries as (
  select unnest(array[
    'restaurant'::industry_enum,
    'cafe'::industry_enum,
    'clinic'::industry_enum,
    'ecommerce'::industry_enum,
    'coach_consultant'::industry_enum,
    'content_creator'::industry_enum,
    'agency'::industry_enum,
    'education'::industry_enum,
    'other'::industry_enum,
    'influencer'::industry_enum,
    'school_organization'::industry_enum,
    'nonprofit'::industry_enum,
    'personal_brand'::industry_enum,
    'local_business'::industry_enum,
    'freelancer'::industry_enum,
    'service_business'::industry_enum,
    'real_estate'::industry_enum,
    'fitness'::industry_enum,
    'beauty'::industry_enum,
    'photography'::industry_enum,
    'events_planner'::industry_enum,
    'therapist'::industry_enum,
    'law_firm'::industry_enum,
    'accountant'::industry_enum,
    'consulting_firm'::industry_enum,
    'career_coach'::industry_enum,
    'virtual_assistant'::industry_enum,
    'fashion_brand'::industry_enum,
    'accessories'::industry_enum,
    'home_goods'::industry_enum,
    'toy_store'::industry_enum,
    'bookstore'::industry_enum,
    'yoga_studio'::industry_enum,
    'nutritionist'::industry_enum,
    'spa_wellness'::industry_enum,
    'mental_health'::industry_enum,
    'plumber'::industry_enum,
    'electrician'::industry_enum,
    'cleaning_service'::industry_enum,
    'landscaping'::industry_enum,
    'auto_repair'::industry_enum,
    'graphic_designer'::industry_enum,
    'videographer'::industry_enum,
    'artist'::industry_enum,
    'writer'::industry_enum,
    'voice_actor'::industry_enum,
    'tutor'::industry_enum,
    'language_school'::industry_enum,
    'test_prep'::industry_enum,
    'edu_creator'::industry_enum,
    'saas'::industry_enum,
    'web_agency'::industry_enum,
    'mobile_app'::industry_enum,
    'tech_startup'::industry_enum,
    'it_services'::industry_enum,
    'food_truck'::industry_enum,
    'catering'::industry_enum,
    'event_venue'::industry_enum,
    'wedding_vendor'::industry_enum,
    'pet_services'::industry_enum,
    'travel_blog'::industry_enum,
    'gaming_channel'::industry_enum,
    'parenting'::industry_enum,
    'diy_maker'::industry_enum
  ]) as industry
),


-- Combine base pattern with industry-specific multipliers
scored as (
  select
    'facebook'::platform_enum as platform,
    b.base_dow  as dow,
    b.base_hour as hour,
    i.industry,

    case
      -- RESTAURANT: strong lunch & dinner, esp. Fri–Sun evenings
      when i.industry = 'restaurant' then
        b.base_score *
        (
          case
            when b.base_hour between 11 and 14 then 1.20   -- lunch
            when b.base_hour between 18 and 21 then 1.25   -- dinner / primetime
            when b.base_dow in (5, 6, 0) and b.base_hour between 18 and 22 then 1.30
            else 0.95
          end
        )

      -- CAFE: mornings + weekends
      when i.industry = 'cafe' then
        b.base_score *
        (
          case
            when b.base_hour between 7 and 10 then 1.25
            when b.base_dow in (6, 0) and b.base_hour between 9 and 17 then 1.20
            else 0.95
          end
        )

      -- CLINIC: weekday daytime + early evening
      when i.industry = 'clinic' then
        b.base_score *
        (
          case
            when b.base_dow between 1 and 5 and b.base_hour between 9 and 18 then 1.20
            when b.base_dow in (6, 0) and b.base_hour between 10 and 15 then 1.10
            else 0.90
          end
        )

      -- ECOMMERCE: late evening + weekends
      when i.industry = 'ecommerce' then
        b.base_score *
        (
          case
            when b.base_hour between 20 and 23 then 1.25
            when b.base_dow in (5, 6, 0) and b.base_hour between 14 and 23 then 1.20
            else 0.95
          end
        )

      -- COACH / CONSULTANT: weekday noon + evening, Sun PM
      when i.industry = 'coach_consultant' then
        b.base_score *
        (
          case
            when b.base_dow between 1 and 4 and b.base_hour between 12 and 14 then 1.20
            when b.base_dow between 1 and 4 and b.base_hour between 19 and 21 then 1.20
            when b.base_dow = 0 and b.base_hour between 18 and 21 then 1.25
            else 0.95
          end
        )

      -- CONTENT CREATOR: evenings, late nights, weekends
      when i.industry = 'content_creator' then
        b.base_score *
        (
          case
            when b.base_hour between 19 and 23 then 1.25
            when b.base_hour between 0 and 1 then 1.15
            when b.base_dow in (5, 6, 0) and b.base_hour between 14 and 23 then 1.20
            else 0.95
          end
        )

      -- AGENCY: B2B-ish, strong weekday hours
      when i.industry = 'agency' then
        b.base_score *
        (
          case
            when b.base_dow between 1 and 5 and b.base_hour between 9 and 18 then 1.20
            else 0.90
          end
        )

      -- EDUCATION: weekday daytime + early evening, Sun PM
      when i.industry = 'education' then
        b.base_score *
        (
          case
            when b.base_dow between 1 and 5 and b.base_hour between 9 and 19 then 1.20
            when b.base_dow = 0 and b.base_hour between 18 and 21 then 1.25
            else 0.90
          end
        )

      -- OTHER: just base
      else
        b.base_score * 1.00
    end as raw_prior_score
  from base_pattern b
  cross join industries i
),

-- Clamp to [0.05, 0.95]
final_scores as (
  select
    platform,
    dow,
    hour,
    industry,
    greatest(0.05, least(0.95, raw_prior_score)) as prior_score
  from scored
)

insert into public.global_hourly_priors (
  platform,
  dow,
  hour,
  prior_score,
  industry
)
select
  platform,
  dow,
  hour,
  prior_score,
  industry
from final_scores
on conflict (platform, industry, dow, hour)
do update
set prior_score = excluded.prior_score;


create or replace function public.upsert_bandit_context(
  p_user_id    uuid,
  p_platform   platform_enum,
  p_weekday    int,
  p_hour_block int,
  p_segment_id int           default null,
  p_post_type  post_type_enum default null
) returns bigint
language plpgsql
security definer
as $$
declare
  ctx_id bigint;
begin
  -- Case 1: generic context (no segment, no post_type)
  if p_segment_id is null and p_post_type is null then
    insert into public.bandit_contexts (
      user_id,
      platform,
      segment_id,
      weekday,
      hour_block,
      post_type
    ) values (
      p_user_id,
      p_platform,
      null,
      p_weekday,
      p_hour_block,
      null
    )
    on conflict (user_id, platform, weekday, hour_block)
      where segment_id is null and post_type is null
      do update set updated_at = now_utc()
    returning id into ctx_id;

  -- Case 2: segment NULL, post_type NOT NULL
  elsif p_segment_id is null and p_post_type is not null then
    insert into public.bandit_contexts (
      user_id,
      platform,
      segment_id,
      weekday,
      hour_block,
      post_type
    ) values (
      p_user_id,
      p_platform,
      null,
      p_weekday,
      p_hour_block,
      p_post_type
    )
    on conflict (user_id, platform, weekday, hour_block, post_type)
      where segment_id is null and p_post_type is not null
      do update set updated_at = now_utc()
    returning id into ctx_id;

  -- Case 3: segment NOT NULL, post_type NULL
  elsif p_segment_id is not null and p_post_type is null then
    insert into public.bandit_contexts (
      user_id,
      platform,
      segment_id,
      weekday,
      hour_block,
      post_type
    ) values (
      p_user_id,
      p_platform,
      p_segment_id,
      p_weekday,
      p_hour_block,
      null
    )
    on conflict (user_id, platform, segment_id, weekday, hour_block)
      where segment_id is not null and post_type is null
      do update set updated_at = now_utc()
    returning id into ctx_id;

  -- Case 4: segment NOT NULL, post_type NOT NULL
  else
    insert into public.bandit_contexts (
      user_id,
      platform,
      segment_id,
      weekday,
      hour_block,
      post_type
    ) values (
      p_user_id,
      p_platform,
      p_segment_id,
      p_weekday,
      p_hour_block,
      p_post_type
    )
    on conflict (user_id, platform, segment_id, weekday, hour_block, post_type)
      where segment_id is not null and post_type is not null
      do update set updated_at = now_utc()
    returning id into ctx_id;
  end if;

  return ctx_id;
end;
$$;

create or replace function public.record_bandit_reward_for_post(p_scheduled_post_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id    uuid;
  v_platform   platform_enum;
  v_posted_at  timestamptz;
  v_weekday    int;
  v_hour       int;
  v_ctx_id     bigint;
  v_reward     numeric;
  v_post_type  post_type_enum;
  v_segment_id int;
begin
  -- 1) Get core info about the scheduled post
  select
    user_id,
    platform,
    posted_at,
    post_type
  into
    v_user_id,
    v_platform,
    v_posted_at,
    v_post_type
  from public.scheduled_posts
  where id = p_scheduled_post_id;

  -- If it hasn't actually been posted yet, nothing to record
  if v_posted_at is null then
    return;
  end if;

  v_weekday := extract(dow from v_posted_at)::int;
  v_hour    := extract(hour from v_posted_at)::int;

  -- 2) Compute reward + segment info from features_engagement_timeslots
  select
    label_engagement,
    audience_segment_id
  into
    v_reward,
    v_segment_id
  from public.features_engagement_timeslots
  where user_id  = v_user_id
    and platform = v_platform
    and timeslot = date_trunc('hour', v_posted_at)
  order by id desc
  limit 1;

  -- No features => no reward
  if v_reward is null then
    return;
  end if;

  -- 3) Upsert the appropriate bandit context (segment + post_type aware)
  v_ctx_id := public.upsert_bandit_context(
    v_user_id,
    v_platform,
    v_weekday,
    v_hour,
    v_segment_id,
    v_post_type
  );

  -- 4) Log the reward (idempotently per scheduled_post_id)
  insert into public.bandit_rewards (
    user_id,
    context_id,
    scheduled_post_id,
    reward
  ) values (
    v_user_id,
    v_ctx_id,
    p_scheduled_post_id,
    v_reward
  )
  on conflict (scheduled_post_id) do nothing;  -- idempotent
end;
$$;


-- Trigger fn: record bandit reward when a schedule transitions to 'posted'
create or replace function public.trg_sched_posts_record_bandit()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only fire on UPDATE → posted (avoid re-running on no-op updates)
  if TG_OP = 'UPDATE'
     and new.status = 'posted'
     and (old.status is distinct from new.status)
  then
    -- Assumes posted_at is set in the same update that sets status='posted'
    perform public.record_bandit_reward_for_post(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sched_posts_record_bandit on public.scheduled_posts;

create trigger trg_sched_posts_record_bandit
after update of status on public.scheduled_posts
for each row
execute function public.trg_sched_posts_record_bandit();

create unique index if not exists uq_bandit_rewards_sched
  on public.bandit_rewards(scheduled_post_id)
  where scheduled_post_id is not null;

create view public.v_bandit_params as
select
  c.id as context_id,
  c.user_id,
  c.platform,
  c.segment_id,
  c.post_type,
  c.weekday,
  c.hour_block,

  c.prior_success
    + coalesce(
        sum(
          exp(
            -ln(2)
            * (extract(epoch from (now_utc() - r.created_at)) / 86400.0)
            / 30.0
          ) * r.reward
        ),
        0
      ) as alpha,

  c.prior_failure
    + coalesce(
        sum(
          exp(
            -ln(2)
            * (extract(epoch from (now_utc() - r.created_at)) / 86400.0)
            / 30.0
          ) * (1 - r.reward)
        ),
        0
      ) as beta

from public.bandit_contexts c
left join public.bandit_rewards r
  on r.context_id = c.id
group by
  c.id,
  c.user_id,
  c.platform,
  c.segment_id,
  c.post_type,
  c.weekday,
  c.hour_block,
  c.prior_success,
  c.prior_failure;



do $$ begin
  begin
    create type industry_enum as enum (
      'restaurant',
      'cafe',
      'clinic',
      'ecommerce',
      'coach_consultant',
      'content_creator',
      'agency',
      'education',
      'other',
      -- Newly added
      'influencer',
      'school_organization',
      'nonprofit',
      'personal_brand',
      'local_business',
      'freelancer',
      'service_business',
      'real_estate',
      'fitness',
      'beauty',
      'photography',
      'events_planner',
      'therapist',
      'law_firm',
      'accountant',
      'consulting_firm',
      'career_coach',
      'virtual_assistant',
      'fashion_brand',
      'accessories',
      'home_goods',
      'toy_store',
      'bookstore',
      'yoga_studio',
      'nutritionist',
      'spa_wellness',
      'mental_health',
      'plumber',
      'electrician',
      'cleaning_service',
      'landscaping',
      'auto_repair',
      'graphic_designer',
      'videographer',
      'artist',
      'writer',
      'voice_actor',
      'tutor',
      'language_school',
      'test_prep',
      'edu_creator',
      'saas',
      'web_agency',
      'mobile_app',
      'tech_startup',
      'it_services',
      'food_truck',
      'catering',
      'event_venue',
      'wedding_vendor',
      'pet_services',
      'travel_blog',
      'gaming_channel',
      'parenting',
      'diy_maker'
    );
  exception when duplicate_object then
    null;
  end;

create table if not exists public.brand_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  industry industry_enum not null default 'other',
  brand_name text,
  goals jsonb,             -- e.g. {"awareness": 0.4, "engagement": 0.4, "sales": 0.2}
  target_audience jsonb,   -- free-form description / segments
  created_at timestamptz not null default now_utc(),
  updated_at timestamptz not null default now_utc()
);

alter table public.brand_profiles enable row level security;

do $$ begin
  create policy brand_profiles_user_rw on public.brand_profiles
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

drop trigger if exists trg_brand_profiles_updated on public.brand_profiles;
create trigger trg_brand_profiles_updated
before update on public.brand_profiles
for each row execute function set_updated_at();

create table if not exists public.content_priors (
  id bigserial primary key,
  industry industry_enum,
  content_type post_type_enum,         -- 'image','video','reel','story','carousel','link'
  objective text,                      -- 'awareness','engagement','conversion' (or enum later)
  angle text,                          -- 'how_to','testimonial','promo','faq',...
  prior_multiplier numeric not null,   -- e.g. 1.2 means +20% vs baseline
  constraint uq_content_prior unique (industry, content_type, objective, angle)
);

create table if not exists public.external_posts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform platform_enum not null,
  object_id text not null, -- Facebook post ID
  page_id text not null,   -- FB page id
  caption text,
  content_type text,       -- e.g. "photo", "video", "reel", "link"
  created_at timestamptz not null,
  objective text,
  angle text,
  post_type post_type_enum,
  labeled_at timestamptz,
label_source text,
  constraint uq_external_post unique (user_id, platform, object_id)
);

create or replace function public.map_external_content_type(p_content_type text)
returns post_type_enum
language sql
immutable
as $$
  select case
    -- FB/IG API often gives things like "photo", "album", "status", "video", "reels"
    when p_content_type is null then null
    when lower(p_content_type) in ('photo', 'image', 'status') then 'image'::post_type_enum
    when lower(p_content_type) in ('video', 'video_inline', 'video_hd') then 'video'::post_type_enum
    when lower(p_content_type) in ('reel', 'reels') then 'reel'::post_type_enum
    when lower(p_content_type) in ('story', 'stories') then 'story'::post_type_enum
    when lower(p_content_type) in ('carousel', 'album') then 'carousel'::post_type_enum
    when lower(p_content_type) in ('link', 'share') then 'link'::post_type_enum
    else null -- unknown / fallback
  end;
$$;
create or replace function public.trg_external_posts_normalize()
returns trigger
language plpgsql
as $$
begin
  -- Only recompute if post_type is null or content_type changed
  if (tg_op = 'INSERT')
     or (tg_op = 'UPDATE' and new.content_type is distinct from old.content_type)
  then
    new.post_type := public.map_external_content_type(new.content_type);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_external_posts_normalize on public.external_posts;

create trigger trg_external_posts_normalize
before insert or update of content_type on public.external_posts
for each row
execute function public.trg_external_posts_normalize();

create or replace view public.v_unlabeled_external_posts as
select
  id,
  user_id,
  platform,
  object_id,
  page_id,
  caption,
  post_type,
  created_at
from public.external_posts
where objective is null
  and angle is null;

create or replace view public.v_all_labeled_posts as
select
  p.user_id,
  sp.platform,
  p.id as local_post_id,
  null::bigint as external_post_id,
  p.post_type,
  p.caption,
  sp.created_at as created_at,
  p.objective,
  p.angle
from public.posts p
join public.scheduled_posts sp
  on sp.post_id = p.id
where p.objective is not null
  and p.angle     is not null

union all

select
  e.user_id,
  e.platform,
  null::uuid as local_post_id,
  e.id       as external_post_id,
  e.post_type,
  e.caption,
  e.created_at,
  e.objective,
  e.angle
from public.external_posts e
where e.objective is not null
  and e.angle     is not null;


create or replace function public.get_time_segment_bandit_inputs(
  p_platform      platform_enum default null,
  p_horizon_days  int           default 7
)
returns table (
  platform      platform_enum,
  timeslot      timestamptz,
  dow           int,
  hour          int,
  segment_id    int,
  predicted_avg numeric,
  bandit_alpha  numeric,
  bandit_beta   numeric
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      f.user_id,
      f.platform,
      f.timeslot,
      extract(dow  from f.timeslot)::int  as dow,
      extract(hour from f.timeslot)::int  as hour,
      f.label_engagement,
      f.user_recent_avg_7d,
      f.audience_segment_id               as segment_id
    from public.features_engagement_timeslots f
    where f.user_id = auth.uid()
      and (p_platform is null or f.platform = p_platform)
      and f.timeslot >= date_trunc('hour', now())
      and f.timeslot <  date_trunc('hour', now() + make_interval(days => p_horizon_days))
  ),
  brand as (
    select
      bp.user_id,
      bp.industry
    from public.brand_profiles bp
    where bp.user_id = auth.uid()
  ),
  -- Combine per-timeslot label, recent avg, and GLOBAL + INDUSTRY priors
  scored as (
    select
      b.user_id,
      b.platform,
      b.timeslot,
      b.dow,
      b.hour,
      b.segment_id,
      case
        when b.label_engagement   is not null then b.label_engagement
        when b.user_recent_avg_7d is not null then b.user_recent_avg_7d
        else coalesce(
          ghp_ind.prior_score,   -- industry-specific prior
          ghp_global.prior_score, -- global prior
          0
        )
      end as predicted_avg
    from base b
    left join brand br
      on br.user_id = b.user_id
    -- industry-specific priors
    left join public.global_hourly_priors ghp_ind
      on ghp_ind.platform = b.platform
     and ghp_ind.dow      = b.dow
     and ghp_ind.hour     = b.hour
     and ghp_ind.industry = coalesce(br.industry, 'other'::industry_enum)
    -- global fallbacks (industry is null)
    left join public.global_hourly_priors ghp_global
      on ghp_global.platform = b.platform
     and ghp_global.dow      = b.dow
     and ghp_global.hour     = b.hour
     and ghp_global.industry is null
  ),
  scored_with_bandit as (
    select
      s.user_id,
      s.platform,
      s.timeslot,
      s.dow,
      s.hour,
      s.segment_id,
      s.predicted_avg,
      bp2.alpha as bandit_alpha,
      bp2.beta  as bandit_beta
    from scored s
    left join public.v_bandit_params bp2
      on bp2.user_id    = s.user_id
     and bp2.platform   = s.platform
     and bp2.weekday    = s.dow
     and bp2.hour_block = s.hour
  )
  select
    platform,
    timeslot,
    dow,
    hour,
    segment_id,
    predicted_avg,
    bandit_alpha,
    bandit_beta
  from scored_with_bandit
  where platform = coalesce(p_platform, platform)
  order by timeslot
  limit 200;  -- or whatever
$$;

create table if not exists public.scheduled_posts_target_segments (
  id bigserial primary key,
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  segment_id int not null,
  created_at timestamptz not null default now_utc()
);

alter table public.scheduled_posts_target_segments enable row level security;

do $$ begin
  create policy sched_post_seg_user_rw on public.scheduled_posts_target_segments
    for all using (
      auth.uid() in (select sp.user_id from public.scheduled_posts sp where sp.id = scheduled_post_id)
    )
    with check (
      auth.uid() in (select sp.user_id from public.scheduled_posts sp where sp.id = scheduled_post_id)
    );
exception when duplicate_object then null; end $$;

create or replace view public.v_post_engagement_rate as
select
  sp.user_id,
  sp.platform,
  sp.id           as scheduled_post_id,
  sp.api_post_id  as object_id,
  sp.post_type,
  sp.objective,
  sp.angle,
  sum(case when a.metric = 'engagement'  then a.value else 0 end) as engagement,
  sum(case when a.metric = 'impressions' then a.value else 0 end) as impressions,
  case
    when sum(case when a.metric = 'impressions' then a.value else 0 end) <= 0
      then 0::numeric
    else
      sum(case when a.metric = 'engagement'  then a.value else 0 end)
      / nullif(sum(case when a.metric = 'impressions' then a.value else 0 end), 0)
  end as engagement_rate
from public.scheduled_posts sp
join public.v_analytics_events_all a
  on a.user_id  = sp.user_id
 and a.platform = sp.platform
 and a.object_id = sp.api_post_id
where sp.status = 'posted'
group by
  sp.user_id,
  sp.platform,
  sp.id,
  sp.api_post_id,
  sp.post_type,
  sp.objective,
  sp.angle;


create or replace view public.v_content_mix_response as
with brand_baseline as (
  select
    user_id,
    platform,
    sum(engagement)  as total_eng,
    sum(impressions) as total_impr,
    case
      when sum(impressions) <= 0
        then 0::numeric
      else
        sum(engagement) / nullif(sum(impressions), 0)
    end as baseline_rate
  from public.v_post_engagement_rate
  group by user_id, platform
),
per_combo as (
  select
    p.user_id,
    p.platform,
    p.post_type                                  as content_type,
    coalesce(p.objective, 'engagement')         as objective,
    coalesce(p.angle,     'generic')            as angle,
    sum(p.engagement)                           as combo_eng,
    sum(p.impressions)                          as combo_impr,
    case
      when sum(p.impressions) <= 0
        then 0::numeric
      else
        sum(p.engagement) / nullif(sum(p.impressions), 0)
    end as combo_rate
  from public.v_post_engagement_rate p
  group by
    p.user_id,
    p.platform,
    p.post_type,
    coalesce(p.objective, 'engagement'),
    coalesce(p.angle,     'generic')
),
joined as (
  select
    c.user_id,
    c.platform,
    c.content_type,
    c.objective,
    c.angle,
    bb.baseline_rate,
    c.combo_rate,
    c.combo_impr,
    cp.prior_multiplier
  from per_combo c
  left join brand_baseline bb
    on bb.user_id  = c.user_id
   and bb.platform = c.platform
  left join public.brand_profiles bp
    on bp.user_id = c.user_id
  left join public.content_priors cp
    on cp.industry     = coalesce(bp.industry, 'other'::industry_enum)
   and cp.content_type = c.content_type
   and cp.objective    = c.objective
   and cp.angle        = c.angle
)
select
  user_id,
  platform,
  content_type,
  objective,
  angle,
  combo_impr,
  baseline_rate,
  combo_rate,
  prior_multiplier,
  (
    (coalesce(prior_multiplier, 1.0)
      * coalesce(baseline_rate, 0.05)
      * 100::numeric
    )
    +
    (coalesce(combo_impr, 0) * coalesce(combo_rate, 0))
  )
  / nullif(100::numeric + coalesce(combo_impr, 0), 0)
    as posterior_engagement_rate
from joined;


create or replace function public.get_content_mix_recommendations(
  p_platform platform_enum default null
)
returns table (
  content_type post_type_enum,
  objective    text,
  angle        text,
  expected_engagement_rate numeric
)
language sql
security definer
set search_path = public
as $$
with me as (
  select auth.uid() as user_id
),

-- Baseline per user+platform, used when we have priors but no combo data
baseline as (
  select
    v.user_id,
    v.platform,
    avg(v.baseline_rate) as baseline_rate
  from public.v_content_mix_response v
  join me on v.user_id = me.user_id
  where (p_platform is null or v.platform = p_platform)
  group by v.user_id, v.platform
),

-- Historical combos with posterior_engagement_rate
historical as (
  select
    v.content_type,
    v.objective,
    v.angle,
    v.posterior_engagement_rate as expected_engagement_rate
  from public.v_content_mix_response v
  join me on v.user_id = me.user_id
  where (p_platform is null or v.platform = p_platform)
),

-- Figure out my brand + industry
my_brand as (
  select bp.user_id, bp.industry
  from public.brand_profiles bp
  join me on bp.user_id = me.user_id
),

-- All candidate priors for my industry (including all expanded industries/angles)
prior_candidates as (
  select
    cp.content_type,
    cp.objective,
    cp.angle,
    (coalesce(b.baseline_rate, 0.05) * coalesce(cp.prior_multiplier, 1.0))
      as expected_engagement_rate
  from public.content_priors cp
  join my_brand mb
    on cp.industry = coalesce(mb.industry, 'other'::industry_enum)
  left join baseline b
    on b.user_id = mb.user_id
   and (p_platform is null or b.platform = p_platform)
),

-- Priors that don't yet have any historical data for this user
prior_only as (
  select p.*
  from prior_candidates p
  left join historical h
    on h.content_type = p.content_type
   and h.objective    = p.objective
   and h.angle        = p.angle
  where h.content_type is null
)

select
  content_type,
  objective,
  angle,
  expected_engagement_rate
from (
  select * from historical
  union all
  select * from prior_only
) t
order by expected_engagement_rate desc
limit 50;
$$;


create or replace view public.v_segment_engagement_scores as
with per_post as (
  select
    sp.user_id,
    ts.segment_id,
    sp.platform,
    sp.id          as scheduled_post_id,
    sp.api_post_id as object_id,
    sum(case when a.metric = 'engagement'   then a.value else 0 end) as engagement,
    sum(case when a.metric = 'impressions' then a.value else 0 end) as impressions,
    max(a.ts) as last_event_ts
  from public.scheduled_posts sp
  join public.scheduled_posts_target_segments ts
    on ts.scheduled_post_id = sp.id
  join public.v_analytics_events_all a
    on a.user_id  = sp.user_id
   and a.platform = sp.platform
   and a.object_id = sp.api_post_id
  where sp.status = 'posted'
  group by
    sp.user_id,
    ts.segment_id,
    sp.platform,
    sp.id,
    sp.api_post_id
),
weighted as (
  select
    p.user_id,
    p.platform,
    p.segment_id,
    p.engagement,
    p.impressions,
    exp(
      -ln(2) * (extract(epoch from (now_utc() - p.last_event_ts)) / 86400.0) / 30.0
    ) as w
  from per_post p
)
select
  w.user_id,
  w.platform,
  w.segment_id,
  (seg.summary ->> 'name') as segment_name,
  sum(w.w * w.engagement)  as w_engagement,
  sum(w.w * w.impressions) as w_impressions,
  case
    when sum(w.w * w.impressions) <= 0 then 0::numeric
    else sum(w.w * w.engagement) / sum(w.w * w.impressions)
  end as segment_engagement_rate
from weighted w
left join public.audience_segments seg
  on seg.user_id = w.user_id
 and seg.segment_id = w.segment_id
group by
  w.user_id,
  w.platform,
  w.segment_id,
  (seg.summary ->> 'name');


create or replace function public.generate_7day_smart_plan(
  p_platform platform_enum,
  p_n_slots  int default 7
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with ranked as (
  select
    timeslot,
    dow,
    hour,
    predicted_avg,
    row_number() over (order by timeslot) as idx
  from public.get_time_segment_recommendations(p_platform, 7)
  limit p_n_slots
),
with_objects as (
  select
    idx,
    jsonb_build_object(
      'slot_index', idx,
      'platform',   p_platform,
      'timeslot',   timeslot,
      'dow',        dow,
      'hour',       hour,
      'score',      predicted_avg
    ) as obj
  from ranked
)
select coalesce(jsonb_agg(obj order by idx), '[]'::jsonb)
from with_objects;
$$;
