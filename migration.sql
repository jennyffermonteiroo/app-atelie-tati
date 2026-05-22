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

insert into public.profiles (id, user_key, nome, role)
select id, 'fabiola', 'Fabíola', 'colab' from auth.users where email = 'fabiola@atelietatibrandao.app'
on conflict (id) do update set user_key = excluded.user_key, nome = excluded.nome, role = excluded.role;

insert into public.profiles (id, user_key, nome, role)
select id, 'kaylane', 'Kaylane', 'colab' from auth.users where email = 'kaylane@atelietatibrandao.app'
on conflict (id) do update set user_key = excluded.user_key, nome = excluded.nome, role = excluded.role;

insert into public.profiles (id, user_key, nome, role)
select id, 'tati', 'Tati', 'colab' from auth.users where email = 'tati@atelietatibrandao.app'
on conflict (id) do update set user_key = excluded.user_key, nome = excluded.nome, role = excluded.role;

insert into public.profiles (id, user_key, nome, role)
select id, 'salao', 'Salão', 'dona' from auth.users where email = 'salao@atelietatibrandao.app'
on conflict (id) do update set user_key = excluded.user_key, nome = excluded.nome, role = excluded.role;

alter table public.records add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.despesas add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.caixa_fechamentos add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.records add column if not exists bronze_salao numeric(10,2) not null default 0;

update public.records r
set created_by = p.id
from public.profiles p
where r.created_by is null and r.user_key = p.user_key;

update public.despesas d
set created_by = p.id
from public.profiles p
where d.created_by is null and p.user_key = 'salao';

update public.caixa_fechamentos c
set created_by = p.id
from public.profiles p
where c.created_by is null and p.user_key = 'salao';

alter table public.records alter column created_by set default auth.uid();
alter table public.despesas alter column created_by set default auth.uid();
alter table public.caixa_fechamentos alter column created_by set default auth.uid();

alter table public.records alter column created_by set not null;
alter table public.despesas alter column created_by set not null;
alter table public.caixa_fechamentos alter column created_by set not null;

alter table public.records drop constraint if exists records_user_key_check;
alter table public.records add constraint records_user_key_check check (user_key in ('fabiola', 'kaylane', 'tati'));
alter table public.records drop constraint if exists records_type_check;
alter table public.records add constraint records_type_check check (type in ('ganho', 'vale', 'bronze'));
alter table public.records drop constraint if exists records_valor_check;
alter table public.records add constraint records_valor_check check (valor > 0 and valor <= 999999.99);
alter table public.records drop constraint if exists records_bronze_check;
alter table public.records add constraint records_bronze_check check (
  (type = 'bronze' and valor = 10 and bronze_salao > 0)
  or (type in ('ganho', 'vale') and bronze_salao = 0)
);
alter table public.records drop constraint if exists records_text_size_check;
alter table public.records add constraint records_text_size_check check (
  char_length(descricao) <= 160 and char_length(cliente) <= 100
);

alter table public.despesas drop constraint if exists despesas_valor_check;
alter table public.despesas add constraint despesas_valor_check check (valor > 0 and valor <= 999999.99);
alter table public.despesas drop constraint if exists despesas_text_size_check;
alter table public.despesas add constraint despesas_text_size_check check (char_length(descricao) <= 160);

alter table public.caixa_fechamentos drop constraint if exists caixa_fechamentos_valor_check;
alter table public.caixa_fechamentos add constraint caixa_fechamentos_valor_check check (valor >= 0 and valor <= 999999.99);

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
create policy "profiles_select_own_or_dona" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'dona');

drop policy if exists "records_select_own_or_dona" on public.records;
create policy "records_select_own_or_dona" on public.records
for select to authenticated
using (user_key = public.current_user_key() or public.current_user_role() = 'dona');

drop policy if exists "records_insert_own_colab" on public.records;
create policy "records_insert_own_colab" on public.records
for insert to authenticated
with check (
  created_by = auth.uid()
  and user_key = public.current_user_key()
  and public.current_user_role() = 'colab'
);

drop policy if exists "records_update_dona" on public.records;
create policy "records_update_dona" on public.records
for update to authenticated
using (public.current_user_role() = 'dona')
with check (public.current_user_role() = 'dona');

drop policy if exists "records_delete_dona" on public.records;
create policy "records_delete_dona" on public.records
for delete to authenticated
using (public.current_user_role() = 'dona');

drop policy if exists "despesas_select_dona" on public.despesas;
create policy "despesas_select_dona" on public.despesas
for select to authenticated
using (public.current_user_role() = 'dona');

drop policy if exists "despesas_insert_dona" on public.despesas;
create policy "despesas_insert_dona" on public.despesas
for insert to authenticated
with check (created_by = auth.uid() and public.current_user_role() = 'dona');

drop policy if exists "despesas_update_dona" on public.despesas;
create policy "despesas_update_dona" on public.despesas
for update to authenticated
using (public.current_user_role() = 'dona')
with check (public.current_user_role() = 'dona');

drop policy if exists "despesas_delete_dona" on public.despesas;
create policy "despesas_delete_dona" on public.despesas
for delete to authenticated
using (public.current_user_role() = 'dona');

drop policy if exists "caixa_fechamentos_select_dona" on public.caixa_fechamentos;
create policy "caixa_fechamentos_select_dona" on public.caixa_fechamentos
for select to authenticated
using (public.current_user_role() = 'dona');

drop policy if exists "caixa_fechamentos_insert_dona" on public.caixa_fechamentos;
create policy "caixa_fechamentos_insert_dona" on public.caixa_fechamentos
for insert to authenticated
with check (created_by = auth.uid() and public.current_user_role() = 'dona');
