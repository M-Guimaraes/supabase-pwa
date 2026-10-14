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

-- ---------------------------------------------------------------------------
-- Casal: dois usuários acompanham gastos compartilhados num lugar só.
-- Cada um segue com os próprios lançamentos privados; só os marcados como
-- compartilhados (household_id + payer_share) ficam visíveis para o parceiro.
-- payer_share = percentual do valor que fica com quem pagou; o parceiro deve o resto.
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

-- Código de convite de 8 caracteres (sem 0/O/1/I), válido por 7 dias. Só as funções
-- abaixo criam e usam convites; o app não escreve direto nesta tabela.
create table public.household_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index household_invites_household_id_idx on public.household_invites (household_id);
create index household_invites_created_by_idx on public.household_invites (created_by);

-- "Acertei R$ X com o parceiro". Não vira despesa: só abate o saldo entre os dois.
create table public.household_settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  settled_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index household_settlements_household_id_idx on public.household_settlements (household_id);
create index household_settlements_from_user_idx on public.household_settlements (from_user);
create index household_settlements_to_user_idx on public.household_settlements (to_user);
create index households_created_by_idx on public.households (created_by);

alter table public.transactions
  add column household_id uuid references public.households (id) on delete set null,
  add column payer_share numeric(5, 2) check (payer_share between 0 and 100);
alter table public.recurring_transactions
  add column household_id uuid references public.households (id) on delete set null,
  add column payer_share numeric(5, 2) check (payer_share between 0 and 100);

create index transactions_household_idx on public.transactions (household_id, occurred_on desc)
  where household_id is not null;
create index recurring_transactions_household_idx on public.recurring_transactions (household_id)
  where household_id is not null;

-- Casal de quem está logado. security definer para as regras de RLS não se
-- referenciarem em círculo (household_members consulta a si mesma).
create or replace function private.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members where user_id = (select auth.uid())
$$;

revoke all on function private.my_household_id() from public, anon;
grant execute on function private.my_household_id() to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_settlements enable row level security;

create policy "households_select_member" on public.households
  for select to authenticated using (id = (select private.my_household_id()));
create policy "household_members_select_member" on public.household_members
  for select to authenticated using (household_id = (select private.my_household_id()));
-- O membro vê o convite ainda válido do próprio casal, para mostrar o código em Ajustes.
create policy "household_invites_select_member" on public.household_invites
  for select to authenticated
  using (household_id = (select private.my_household_id()) and used_at is null and expires_at > now());
create policy "household_settlements_select_member" on public.household_settlements
  for select to authenticated using (household_id = (select private.my_household_id()));
create policy "household_settlements_insert_own" on public.household_settlements
  for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and to_user <> from_user
    and household_id = (select private.my_household_id())
    and exists (
      select 1 from public.household_members m
      where m.household_id = household_settlements.household_id and m.user_id = household_settlements.to_user
    )
  );

create policy "require_aal2_if_enrolled" on public.households
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.household_members
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.household_invites
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));
create policy "require_aal2_if_enrolled" on public.household_settlements
  as restrictive for all to authenticated
  using ((select private.aal_ok())) with check ((select private.aal_ok()));

-- O parceiro lê (só lê) os lançamentos compartilhados do casal. Editar e excluir
-- continuam só para o dono, pelas regras "own" de antes.
create policy "transactions_select_household" on public.transactions
  for select to authenticated
  using (
    household_id is not null
    and payer_share is not null
    and household_id = (select private.my_household_id())
  );

-- Ninguém marca um lançamento como compartilhado com um casal que não é o seu.
create policy "household_must_be_mine_insert" on public.transactions
  as restrictive for insert to authenticated
  with check (household_id is null or household_id = (select private.my_household_id()));
create policy "household_must_be_mine_update" on public.transactions
  as restrictive for update to authenticated
  using (true)
  with check (household_id is null or household_id = (select private.my_household_id()));
create policy "household_must_be_mine_insert" on public.recurring_transactions
  as restrictive for insert to authenticated
  with check (household_id is null or household_id = (select private.my_household_id()));
create policy "household_must_be_mine_update" on public.recurring_transactions
  as restrictive for update to authenticated
  using (true)
  with check (household_id is null or household_id = (select private.my_household_id()));

-- O parceiro só enxerga as categorias que aparecem em lançamentos compartilhados.
create policy "categories_select_shared" on public.categories
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.category_id = categories.id
        and t.household_id is not null
        and t.household_id = (select private.my_household_id())
    )
  );

-- Quando alguém sai do casal (ou apaga a conta), o compartilhamento acaba para os dois:
-- os lançamentos voltam a ser privados e o histórico de acertos some. Sem isso, um
-- parceiro novo herdaria dívidas de uma divisão que ele não fez.
create or replace function private.on_household_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transactions set household_id = null, payer_share = null
    where household_id = old.household_id;
  update public.recurring_transactions set household_id = null, payer_share = null
    where household_id = old.household_id;
  delete from public.household_settlements where household_id = old.household_id;
  if not exists (select 1 from public.household_members where household_id = old.household_id) then
    delete from public.households where id = old.household_id;
  end if;
  return old;
end;
$$;

revoke all on function private.on_household_member_removed() from public, anon, authenticated;

create trigger on_household_member_removed
  after delete on public.household_members
  for each row execute function private.on_household_member_removed();

-- Código aleatório de 8 caracteres; os bytes vêm de gen_random_uuid() (aleatório forte).
create or replace function private.gen_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  i int;
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(raw, i) & 31) + 1, 1);
  end loop;
  code := code
    || substr(alphabet, (get_byte(raw, 9) & 31) + 1, 1)
    || substr(alphabet, (get_byte(raw, 10) & 31) + 1, 1);
  return code;
end;
$$;

revoke all on function private.gen_invite_code() from public, anon, authenticated;

create or replace function public.create_household(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_hid uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.aal_ok() then raise exception 'mfa required'; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'invalid name'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'already in household';
  end if;
  insert into public.households (created_by) values (v_uid) returning id into v_hid;
  insert into public.household_members (household_id, user_id, display_name) values (v_hid, v_uid, v_name);
  v_code := private.gen_invite_code();
  insert into public.household_invites (code, household_id, created_by) values (v_code, v_hid, v_uid);
  return v_code;
end;
$$;

-- Novo código enquanto falta o parceiro; os códigos antigos ainda não usados deixam de valer.
create or replace function public.new_household_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hid uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.aal_ok() then raise exception 'mfa required'; end if;
  select household_id into v_hid from public.household_members where user_id = v_uid;
  if v_hid is null then raise exception 'not in household'; end if;
  if (select count(*) from public.household_members where household_id = v_hid) >= 2 then
    raise exception 'household full';
  end if;
  update public.household_invites set used_at = now() where household_id = v_hid and used_at is null;
  v_code := private.gen_invite_code();
  insert into public.household_invites (code, household_id, created_by) values (v_code, v_hid, v_uid);
  return v_code;
end;
$$;

create or replace function public.join_household(p_code text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv public.household_invites;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.aal_ok() then raise exception 'mfa required'; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'invalid name'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'already in household';
  end if;
  select * into v_inv from public.household_invites where code = v_code for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at < now() then
    raise exception 'invalid invite';
  end if;
  if (select count(*) from public.household_members where household_id = v_inv.household_id) >= 2 then
    raise exception 'household full';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (v_inv.household_id, v_uid, v_name);
  update public.household_invites set used_at = now() where code = v_code;
end;
$$;

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not private.aal_ok() then raise exception 'mfa required'; end if;
  delete from public.household_members where user_id = auth.uid();
end;
$$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.new_household_invite() from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
revoke all on function public.leave_household() from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.new_household_invite() to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.leave_household() to authenticated;

-- Movimentações que não são gasto nem receita: pagamento da fatura do cartão (as compras da
-- fatura já são o gasto) e investimentos ou transferências entre contas. Vazio = lançamento
-- normal. Lançamentos com kind ficam fora dos totais do Resumo, da lista e dos gráficos.
alter table public.transactions
  add column kind text check (kind in ('card_payment', 'transfer'));
