-- Run this in the Supabase SQL editor. Date-only billing values use `date` to
-- prevent timezone drift. Every user-owned table is protected by RLS.
create extension if not exists "pgcrypto";

-- SubTrack synchronizes the complete small account document atomically. This
-- keeps subscriptions, payment history, price changes, preferences, and the
-- recoverable trash in one versioned transaction.
create table if not exists public.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"subscriptions":[],"tombstones":{},"deletedSubscriptions":[]}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_state_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null,
  archived_at timestamptz not null default now()
);
create index if not exists account_state_history_user_idx on public.account_state_history(user_id, archived_at desc);

create or replace function public.archive_account_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.payload is distinct from new.payload then
    insert into public.account_state_history (user_id, payload, version) values (old.user_id, old.payload, old.version);
  end if;
  return new;
end; $$;
drop trigger if exists before_account_state_update on public.account_state;
create trigger before_account_state_update before update on public.account_state for each row execute procedure public.archive_account_state();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, preferred_currency text not null default 'EUR',
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  default_reminder_days integer, theme text not null default 'system' check (theme in ('light','dark','system')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), description text, price numeric(12,2) not null check (price >= 0), currency text not null,
  billing_frequency text not null check (billing_frequency in ('weekly','monthly','bimonthly','quarterly','biannual','yearly','custom','one-time')),
  custom_interval_number integer check (custom_interval_number > 0), custom_interval_unit text check (custom_interval_unit in ('days','weeks','months','years')),
  next_payment_date date not null, first_payment_date date, category text not null default 'Other', custom_category text, note text,
  payment_method_label text, website_url text, status text not null default 'active' check (status in ('active','paused','cancelled')),
  auto_renewal_status text not null default 'auto' check (auto_renewal_status in ('auto','manual','unknown')),
  is_free_trial boolean not null default false, trial_end_date date, trial_first_payment_amount numeric(12,2), reminder_days_before integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_date_idx on public.subscriptions(user_id, next_payment_date);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, status);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, amount numeric(12,2) not null check (amount >= 0), currency text not null,
  payment_date date not null, status text not null check (status in ('paid','missed','estimated')), note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists payments_user_subscription_idx on public.payments(user_id, subscription_id, payment_date desc);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, previous_price numeric(12,2) not null, new_price numeric(12,2) not null,
  effective_date date not null, note text, created_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists first_payment_date date;
alter table public.price_history add column if not exists note text;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('paid','missed','estimated'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade, scheduled_for timestamptz not null,
  notification_type text not null, status text not null default 'pending', sent_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists notifications_schedule_idx on public.notifications(status, scheduled_for);

alter table public.profiles enable row level security;
alter table public.account_state enable row level security;
alter table public.account_state_history enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.price_history enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "account state own row" on public.account_state;
create policy "account state own row" on public.account_state for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "account history own rows" on public.account_state_history;
create policy "account history own rows" on public.account_state_history for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own rows" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "subscriptions own rows" on public.subscriptions;
create policy "subscriptions own rows" on public.subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "payments own rows" on public.payments;
create policy "payments own rows" on public.payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "price history own rows" on public.price_history;
create policy "price history own rows" on public.price_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications own rows" on public.notifications;
create policy "notifications own rows" on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.account_state to authenticated;
grant select on public.account_state_history to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_state') then
    alter publication supabase_realtime add table public.account_state;
  end if;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
