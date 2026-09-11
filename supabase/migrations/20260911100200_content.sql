-- =============================================================================
--  SAMIKSHA · 0003 · Learning Content
--  Courses (iGOT-synced), uploaded materials + RAG chunks, curated YouTube.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  COURSES  — mirrored from iGOT Karmayogi via the adapter, or authored here
-- ─────────────────────────────────────────────────────────────────────────────
create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  external_id       text,                       -- iGOT/Sunbird `identifier`
  source            public.content_source not null default 'internal',

  title             text not null,
  description       text,
  provider          text,                       -- 'NSSTA', 'Karmayogi Bharat', …
  thumbnail_url     text,
  content_url       text,                       -- deep-link into iGOT
  language          text not null default 'en',

  duration_minutes  int check (duration_minutes >= 0),
  difficulty        public.proficiency_level not null default 'practitioner',
  rating            real check (rating >= 0 and rating <= 5),
  enrolled_count    int not null default 0,

  -- Raw payload from the source system, kept for lossless round-trip
  raw               jsonb not null default '{}'::jsonb,

  is_active         boolean not null default true,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index courses_source_idx on public.courses(source);
create index courses_title_trgm on public.courses using gin (title extensions.gin_trgm_ops);

-- Which competencies a course actually develops, and to what level
create table public.course_competencies (
  course_id       uuid not null references public.courses(id) on delete cascade,
  competency_id   uuid not null references public.competencies(id) on delete cascade,
  targets_level   public.proficiency_level not null default 'practitioner',
  relevance       real not null default 1.0 check (relevance between 0 and 1),
  primary key (course_id, competency_id)
);
create index course_comp_comp_idx on public.course_competencies(competency_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  ENROLMENTS  — local mirror of iGOT progress
-- ─────────────────────────────────────────────────────────────────────────────
create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  status         text not null default 'enrolled'
                 check (status in ('enrolled','in_progress','completed','dropped')),
  progress_pct   real not null default 0 check (progress_pct between 0 and 100),
  started_at     timestamptz default now(),
  completed_at   timestamptz,
  last_synced_at timestamptz,
  unique (user_id, course_id)
);
create index enrollments_user_idx on public.enrollments(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIALS  — user-uploaded PDFs / DOCX / PPTX / images
--  This is the input side of "generate quizzes from uploaded learning material".
-- ─────────────────────────────────────────────────────────────────────────────
create table public.materials (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,

  title           text not null,
  description     text,
  storage_path    text,                    -- Supabase Storage object path
  mime_type       text,
  file_size_bytes bigint,
  page_count      int,

  status          public.material_status not null default 'uploaded',
  error_message   text,

  -- Extracted plain text. DeepSeek v4 Flash's 1M context means we can often
  -- pass the whole document in one call rather than stitching chunks.
  extracted_text  text,
  word_count      int,

  -- AI-derived metadata
  summary         text,
  key_topics      text[] not null default '{}',
  detected_language text,

  visibility      text not null default 'private'
                  check (visibility in ('private','organization','public')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index materials_owner_idx  on public.materials(owner_id);
create index materials_status_idx on public.materials(status);

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.tg_set_updated_at();

-- Competencies a material covers (AI-tagged)
create table public.material_competencies (
  material_id   uuid not null references public.materials(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  relevance     real not null default 1.0 check (relevance between 0 and 1),
  primary key (material_id, competency_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIAL CHUNKS  — semantic retrieval (RAG) for grounded Q&A + citations
--  384-dim to match Supabase Edge Runtime's built-in `gte-small` embedder,
--  which is free and runs in-process — no external embedding API needed.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.material_chunks (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references public.materials(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  token_count   int,
  page_from     int,
  page_to       int,
  heading       text,
  embedding     extensions.vector(384),
  created_at    timestamptz not null default now(),
  unique (material_id, chunk_index)
);
create index material_chunks_material_idx on public.material_chunks(material_id);

-- HNSW beats IVFFlat for our size/latency profile and needs no training step
create index material_chunks_embedding_idx
  on public.material_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────────────────────
--  match_material_chunks()  — cosine KNN used by the tutor for citations
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.match_material_chunks(
  p_material_id   uuid,
  p_query_embedding extensions.vector(384),
  p_match_count   int default 6,
  p_min_similarity real default 0.25
)
returns table (
  id          uuid,
  content     text,
  chunk_index int,
  page_from   int,
  page_to     int,
  heading     text,
  similarity  real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mc.id,
    mc.content,
    mc.chunk_index,
    mc.page_from,
    mc.page_to,
    mc.heading,
    (1 - (mc.embedding operator(extensions.<=>) p_query_embedding))::real as similarity
  from public.material_chunks mc
  where mc.material_id = p_material_id
    and mc.embedding is not null
    and (1 - (mc.embedding operator(extensions.<=>) p_query_embedding)) >= p_min_similarity
  order by mc.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  VIDEOS  — AI-curated YouTube tutoring content
--  We store only metadata + IDs and play via the official YouTube IFrame
--  player. We never download or re-host streams (YouTube ToS).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.videos (
  id                uuid primary key default gen_random_uuid(),
  youtube_id        text not null unique,
  title             text not null,
  channel_title     text,
  channel_id        text,
  description       text,
  thumbnail_url     text,
  duration_seconds  int,
  published_at      timestamptz,
  view_count        bigint,
  language          text default 'en',

  -- AI quality gate: is this actually good pedagogy for this topic?
  quality_score     real check (quality_score between 0 and 1),
  quality_rationale text,
  is_vetted         boolean not null default false,

  -- AI-generated chapter markers → learners jump to the exact concept
  chapters          jsonb not null default '[]'::jsonb,

  search_query      text,
  created_at        timestamptz not null default now()
);
create index videos_quality_idx on public.videos(quality_score desc);

create table public.video_competencies (
  video_id      uuid not null references public.videos(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  relevance     real not null default 1.0 check (relevance between 0 and 1),
  primary key (video_id, competency_id)
);
create index video_comp_comp_idx on public.video_competencies(competency_id);

-- Watch progress — feeds the analytics engine
create table public.video_progress (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  video_id          uuid not null references public.videos(id) on delete cascade,
  seconds_watched   int not null default 0,
  last_position_sec int not null default 0,
  completed         boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (user_id, video_id)
);
create index video_progress_user_idx on public.video_progress(user_id);

create trigger video_progress_set_updated_at
  before update on public.video_progress
  for each row execute function public.tg_set_updated_at();
