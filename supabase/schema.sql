-- Esquema do banco do Caixa. Já aplicado no projeto Supabase;
-- guardado aqui para reproduzir o banco em outro projeto.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_category_idx on public.transactions (category_id);
create index categories_user_idx on public.categories (user_id);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "categories_select_own" on public.categories
  for select to authenticated using (user_id = (select auth.uid()));
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "categories_update_own" on public.categories
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "categories_delete_own" on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "transactions_select_own" on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Categorias padrão para cada nova conta
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, type) values
    (new.id, 'Salário', 'income'),
    (new.id, 'Outras receitas', 'income'),
    (new.id, 'Moradia', 'expense'),
    (new.id, 'Alimentação', 'expense'),
    (new.id, 'Transporte', 'expense'),
    (new.id, 'Lazer', 'expense'),
    (new.id, 'Saúde', 'expense'),
    (new.id, 'Outras despesas', 'expense');
  return new;
end;
$$;

revoke all on function public.seed_default_categories() from public, anon, authenticated;

create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row execute function public.seed_default_categories();

-- Exclusão da própria conta (chamada pelo app em "Ajustes → Excluir minha conta").
-- Apaga o usuário; categories e transactions saem junto por "on delete cascade".
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Importação de extratos (OFX e CSV): identificador do lançamento no arquivo, para que
-- importar o mesmo arquivo duas vezes não duplique nada. Lançamentos manuais ficam com
-- external_id nulo (NULL é sempre distinto em índices únicos).
alter table public.transactions add column external_id text;

create unique index transactions_user_external_id_key
  on public.transactions (user_id, external_id);

-- Lançamentos fixos (aluguel, assinaturas, salário). O app gera os lançamentos de cada
-- mês em transactions, com external_id "rec:<id>:<AAAA-MM>", então gerar duas vezes não duplica.
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  description text not null,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_on date not null default date_trunc('month', current_date)::date,
  generated_through date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index recurring_transactions_user_id_idx on public.recurring_transactions (user_id);
create index recurring_transactions_category_id_idx on public.recurring_transactions (category_id);

alter table public.recurring_transactions enable row level security;

create policy "recurring_select_own" on public.recurring_transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recurring_insert_own" on public.recurring_transactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recurring_update_own" on public.recurring_transactions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recurring_delete_own" on public.recurring_transactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Orçamento: limite mensal por categoria de despesa (um por categoria).
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);
create index budgets_category_id_idx on public.budgets (category_id);
alter table public.budgets enable row level security;
create policy "budgets_select_own" on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "budgets_insert_own" on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "budgets_update_own" on public.budgets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "budgets_delete_own" on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

-- Contas a pagar. Ao pagar, o app cria a despesa em transactions com external_id
-- "bill:<id>" (sem duplicar) e preenche paid_on.
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_on date not null,
  paid_on date,
  created_at timestamptz not null default now()
);
create index bills_user_id_idx on public.bills (user_id);
create index bills_category_id_idx on public.bills (category_id);
alter table public.bills enable row level security;
create policy "bills_select_own" on public.bills
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bills_insert_own" on public.bills
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bills_update_own" on public.bills
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bills_delete_own" on public.bills
  for delete to authenticated using (user_id = (select auth.uid()));
