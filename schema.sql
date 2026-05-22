-- Atelie Tati Brandao - Schema seguro Supabase
-- Execute no SQL Editor depois de criar os usuarios no Supabase Auth.
--
-- Usuarios esperados no Auth:
-- fabiola@atelietatibrandao.app
-- kaylane@atelietatibrandao.app
-- tati@atelietatibrandao.app
-- salao@atelietatibrandao.app
--
-- Depois de criar cada usuario, vincule o profile usando o e-mail:
-- insert into public.profiles (id, user_key, nome, role)
-- select id, 'fabiola', 'Fabíola', 'colab' from auth.users where email = 'fabiola@atelietatibrandao.app'
-- on conflict (id) do update set user_key = excluded.user_key, nome = excluded.nome, role = excluded.role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_key text not null unique,
  nome text not null,
  role text not null,
  criado_em timestamptz not null default now(),
  constraint profiles_user_key_check check (user_key in ('fabiola', 'kaylane', 'tati', 'salao')),
  constraint profiles_role_check check (role in ('colab', 'dona')),
  constraint profiles_role_user_check check (
    (role = 'dona' and user_key = 'salao')
    or (role = 'colab' and user_key in ('fabiola', 'kaylane', 'tati'))
  )
);

create table if not exists public.records (
  id bigserial primary key,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  user_key text not null,
  type text not null,
  descricao text not null,
  cliente text not null default '',
  valor numeric(10,2) not null,
  bronze_salao numeric(10,2) not null default 0,
  data_ref date not null,
  fechado boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint records_user_key_check check (user_key in ('fabiola', 'kaylane', 'tati')),
  constraint records_type_check check (type in ('ganho', 'vale', 'bronze')),
  constraint records_valor_check check (valor > 0 and valor <= 999999.99),
  constraint records_bronze_check check (
    (type = 'bronze' and valor = 10 and bronze_salao > 0)
    or (type in ('ganho', 'vale') and bronze_salao = 0)
  ),
  constraint records_text_size_check check (
    char_length(descricao) <= 160 and char_length(cliente) <= 100
  )
);

create table if not exists public.despesas (
  id bigserial primary key,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  descricao text not null,
  valor numeric(10,2) not null,
  data_ref date not null default current_date,
  criado_em timestamptz not null default now(),
  constraint despesas_valor_check check (valor > 0 and valor <= 999999.99),
  constraint despesas_text_size_check check (char_length(descricao) <= 160)
);

create table if not exists public.caixa_fechamentos (
  id bigserial primary key,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  valor numeric(10,2) not null,
  criado_em timestamptz not null default now(),
  constraint caixa_fechamentos_valor_check check (valor >= 0 and valor <= 999999.99)
);

create index if not exists idx_records_user_data on public.records (user_key, data_ref desc);
create index if not exists idx_despesas_data on public.despesas (data_ref desc);
create index if not exists idx_caixa_fechamentos_criado on public.caixa_fechamentos (criado_em desc);

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.despesas enable row level security;
alter table public.caixa_fechamentos enable row level security;

revoke all on public.profiles from anon;
revoke all on public.records from anon;
revoke all on public.despesas from anon;
revoke all on public.caixa_fechamentos from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, update, delete on public.despesas to authenticated;
grant select, insert on public.caixa_fechamentos to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select user_key from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_key() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_key() to authenticated;

drop policy if exists "profiles_select_own_or_dona" on public.profiles;
create policy "profiles_select_own_or_dona"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'dona'
);

drop policy if exists "records_select_own_or_dona" on public.records;
create policy "records_select_own_or_dona"
on public.records
for select
to authenticated
using (
  user_key = public.current_user_key()
  or public.current_user_role() = 'dona'
);

drop policy if exists "records_insert_own_colab" on public.records;
create policy "records_insert_own_colab"
on public.records
for insert
to authenticated
with check (
  created_by = auth.uid()
  and user_key = public.current_user_key()
  and public.current_user_role() = 'colab'
);

drop policy if exists "records_update_dona" on public.records;
create policy "records_update_dona"
on public.records
for update
to authenticated
using (
  public.current_user_role() = 'dona'
)
with check (
  public.current_user_role() = 'dona'
);

drop policy if exists "records_delete_dona" on public.records;
create policy "records_delete_dona"
on public.records
for delete
to authenticated
using (
  public.current_user_role() = 'dona'
);

drop policy if exists "despesas_select_dona" on public.despesas;
create policy "despesas_select_dona"
on public.despesas
for select
to authenticated
using (
  public.current_user_role() = 'dona'
);

drop policy if exists "despesas_insert_dona" on public.despesas;
create policy "despesas_insert_dona"
on public.despesas
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.current_user_role() = 'dona'
);

drop policy if exists "despesas_update_dona" on public.despesas;
create policy "despesas_update_dona"
on public.despesas
for update
to authenticated
using (
  public.current_user_role() = 'dona'
)
with check (
  public.current_user_role() = 'dona'
);

drop policy if exists "despesas_delete_dona" on public.despesas;
create policy "despesas_delete_dona"
on public.despesas
for delete
to authenticated
using (
  public.current_user_role() = 'dona'
);

drop policy if exists "caixa_fechamentos_select_dona" on public.caixa_fechamentos;
create policy "caixa_fechamentos_select_dona"
on public.caixa_fechamentos
for select
to authenticated
using (
  public.current_user_role() = 'dona'
);

drop policy if exists "caixa_fechamentos_insert_dona" on public.caixa_fechamentos;
create policy "caixa_fechamentos_insert_dona"
on public.caixa_fechamentos
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.current_user_role() = 'dona'
);
