-- CivicPulse AI 0021 — Modular AI Audit Trail & Analysis Tables
--
-- Preserves complete provenance, predictions, detections, and human review status
-- for every AI analysis run. Never overwrites historical predictions.

-- 1. Master AI Analysis Record
create table if not exists ai_analysis (
  id text primary key,                                 -- e.g. 'CP-AI-A1B2C3D4'
  complaint_id bigint references complaints(id) on delete set null,
  image_sha256 text,
  quality_score int check (quality_score between 0 and 100),
  civic_decision text not null check (civic_decision in ('CIVIC', 'NON_CIVIC', 'UNCERTAIN')),
  civic_confidence numeric(5,2),
  domain text,
  category text,
  subcategory text,
  category_confidence numeric(5,2),
  severity_score int check (severity_score between 0 and 100),
  severity_level text check (severity_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  authenticity_score int check (authenticity_score between 0 and 100),
  authenticity_status text,
  duplicate_risk int check (duplicate_risk between 0 and 100),
  ward text,
  ward_confidence numeric(5,2),
  requires_review boolean default false,
  review_reasons jsonb default '[]'::jsonb,
  description text,
  evidence jsonb default '[]'::jsonb,
  warnings jsonb default '[]'::jsonb,
  model_versions jsonb not null default '{}'::jsonb,
  elapsed_ms int,
  created_at timestamptz default now()
);

create index if not exists idx_ai_analysis_decision on ai_analysis(civic_decision);
create index if not exists idx_ai_analysis_category on ai_analysis(category);
create index if not exists idx_ai_analysis_review on ai_analysis(requires_review) where requires_review;
create index if not exists idx_ai_analysis_created on ai_analysis(created_at desc);

-- 2. Top-K Category Predictions
create table if not exists ai_predictions (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  category text not null,
  domain text,
  confidence numeric(5,2) not null,
  rank int not null
);
create index if not exists idx_ai_predictions_analysis on ai_predictions(analysis_id);

-- 3. Object Detections & Spatial Bounding Boxes
create table if not exists ai_detections (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  label text not null,
  confidence numeric(5,2) not null,
  bbox_ymin int not null,
  bbox_xmin int not null,
  bbox_ymax int not null,
  bbox_xmax int not null,
  area_ratio numeric(5,3)
);
create index if not exists idx_ai_detections_analysis on ai_detections(analysis_id);

-- 4. Dynamic Questions Generated
create table if not exists ai_questions (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  question_id text not null,
  question_text text not null,
  question_type text not null,
  required boolean default false
);

-- 5. Citizen Answers Provided
create table if not exists ai_answers (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  question_id text not null,
  answer_value jsonb not null,
  answered_at timestamptz default now()
);

-- 6. Authenticity & Manipulation Signals
create table if not exists ai_authenticity (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  sha256 text not null,
  phash text,
  dhash text,
  camera text,
  software text,
  ela_divergence numeric(5,2),
  has_exif boolean default false,
  status text not null
);

-- 7. Potential Duplicate Report Matches
create table if not exists ai_duplicates (
  id bigserial primary key,
  analysis_id text not null references ai_analysis(id) on delete cascade,
  matched_report_ref text not null,
  similarity_score numeric(5,2) not null,
  geo_distance_meters numeric(8,2),
  time_diff_hours numeric(8,2)
);

-- 8. Model Registry & Version Tracking
create table if not exists ai_model_versions (
  id serial primary key,
  model_name text not null,
  version text not null,
  architecture text,
  threshold numeric(5,2),
  active boolean default true,
  deployed_at timestamptz default now()
);

-- Seed current model versions
insert into ai_model_versions (model_name, version, architecture, threshold)
values
  ('civic_classifier', 'civic-v1.2', 'MobileNetV2-Transfer', 0.45),
  ('category_classifier', 'category-v1.4', 'MobileNetV2-Centroids-Hierarchical', 0.45),
  ('detector', 'detector-v1.1', 'Saliency-Contour-Localizer', 0.50),
  ('authenticity_model', 'authenticity-v1.0', 'EXIF-pHash-ELA', null),
  ('duplicate_engine', 'duplicate-v1.0', 'MobileNetV2-Embeddings-1280d', 0.75)
on conflict do nothing;
