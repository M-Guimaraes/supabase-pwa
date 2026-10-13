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

-- Metas: valor alvo, valor já guardado e prazo opcional.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  deadline date,
  created_at timestamptz not null default now()
);
create index goals_user_id_idx on public.goals (user_id);
alter table public.goals enable row level security;
create policy "goals_select_own" on public.goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "goals_update_own" on public.goals
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goals_delete_own" on public.goals
  for delete to authenticated using (user_id = (select auth.uid()));

-- Verificação em duas etapas (TOTP) opcional. Quem ativou só acessa os dados com sessão
-- aal2, então ela não pode ser contornada chamando a API direto com a senha. A função
-- fica no schema "private", que a API não expõe.
create schema if not exists private;

create or replace function private.aal_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    ) then coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    else true
  end
$$;

revoke all on function private.aal_ok() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.aal_ok() to authenticated;

create policy "require_aal2_if_enrolled" on public.categories
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.transactions
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.recurring_transactions
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.budgets
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.bills
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.goals
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));

-- Excluir a conta também exige a segunda etapa de quem a ativou.
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
  if not private.aal_ok() then
    raise exception 'mfa required';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Regras de classificação: "se a descrição contém <pattern>, a categoria é <category_id>".
-- O pattern é guardado já normalizado (minúsculas, sem acento nem pontuação).
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern text not null check (char_length(pattern) between 2 and 60),
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);
create index category_rules_user_id_idx on public.category_rules (user_id);
create index category_rules_category_id_idx on public.category_rules (category_id);
alter table public.category_rules enable row level security;
create policy "category_rules_select_own" on public.category_rules
  for select to authenticated using (user_id = (select auth.uid()));
create policy "category_rules_insert_own" on public.category_rules
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "category_rules_update_own" on public.category_rules
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "category_rules_delete_own" on public.category_rules
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "require_aal2_if_enrolled" on public.category_rules
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));

-- Cartões de crédito do usuário.
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  last4 text,
  created_at timestamptz not null default now()
);
create index credit_cards_user_id_idx on public.credit_cards (user_id);
alter table public.credit_cards enable row level security;
create policy "credit_cards_select_own" on public.credit_cards
  for select to authenticated using (user_id = (select auth.uid()));
create policy "credit_cards_insert_own" on public.credit_cards
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "credit_cards_update_own" on public.credit_cards
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "credit_cards_delete_own" on public.credit_cards
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "require_aal2_if_enrolled" on public.credit_cards
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));

-- Faturas: uma por cartão/vencimento. O pagamento (do extrato bancário) baixa a fatura
-- direto aqui (paid_on/paid_amount) e não vira uma despesa separada em transactions,
-- pra não contar o valor duas vezes (as compras da fatura já são despesas por si só).
create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_on date not null,
  total numeric(12, 2) not null check (total >= 0),
  min_payment numeric(12, 2),
  paid_on date,
  paid_amount numeric(12, 2),
  created_at timestamptz not null default now(),
  unique (user_id, card_id, due_on)
);
create index card_invoices_user_id_idx on public.card_invoices (user_id);
create index card_invoices_card_id_idx on public.card_invoices (card_id);
alter table public.card_invoices enable row level security;
create policy "card_invoices_select_own" on public.card_invoices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "card_invoices_insert_own" on public.card_invoices
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "card_invoices_update_own" on public.card_invoices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "card_invoices_delete_own" on public.card_invoices
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "require_aal2_if_enrolled" on public.card_invoices
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));

-- Compras do cartão viram transactions normais (entram em categorias, orçamento,
-- resumo...), só marcadas com a fatura a que pertencem.
alter table public.transactions
  add column card_invoice_id uuid references public.card_invoices (id) on delete set null;
create index transactions_card_invoice_idx on public.transactions (card_invoice_id);
