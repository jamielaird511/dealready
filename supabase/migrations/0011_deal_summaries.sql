create table if not exists deal_summaries (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  run_id uuid,
  content text not null,
  created_at timestamptz default now()
);
