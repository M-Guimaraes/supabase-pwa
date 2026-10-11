# Planejamento do Caixa

Features mais pedidas em apps de finanças pessoais, com o plano de execução de cada uma. A lista vem de uma pesquisa de mercado feita em outubro de 2026; as fontes ficam no fim do arquivo.

Estados possíveis: pendente, em andamento, concluído.

| # | Tópico | Prioridade | Status |
|---|---|---|---|
| 4 | Gastos recorrentes e assinaturas | 1 | pendente |
| 3 | Orçamento por categoria, alertas e lembretes de contas | 2 | pendente |
| 7 | Itens menores: CSV, metas, offline e casais | 3 | pendente |
| 2 | Menos digitação manual | 4 | pendente |
| 5 | Segurança e controle dos dados | 5 | pendente |
| 6 | Preço baixo e simplicidade | 6 | pendente |
| 1 | Visão única das contas e sincronização automática | 7 | pendente |

A numeração segue a ordem da pesquisa; a prioridade é a ordem sugerida de execução.

## 4. Gastos recorrentes e assinaturas

Status: pendente

1. Criar a tabela `recurring_transactions` (tipo, valor, categoria, dia do mês, ativa, última geração) com RLS por usuário.
2. Ao abrir o app, gerar de forma idempotente os lançamentos do mês que ainda não existem, para não duplicar.
3. Tela para criar, pausar e excluir recorrências.
4. Sugerir possíveis assinaturas quando houver lançamentos parecidos em meses seguidos.
5. Mostrar o total mensal de assinaturas no Resumo.

A avaliar: gerar por rotina agendada no Supabase (`pg_cron`) em vez de no app.

Pronto quando: lançamentos fixos aparecem sozinhos todo mês, sem duplicar.

## 3. Orçamento por categoria, alertas e lembretes de contas

Status: pendente

1. Criar a tabela `budgets` (usuário, categoria, limite mensal) com RLS, via migration.
2. Tela para definir o limite de cada categoria.
3. Barra de progresso no Resumo, com aviso a partir de 80% e ao passar de 100%.
4. Contas a pagar: campo de vencimento e situação (pendente ou paga), e lista de contas a vencer nos próximos 7 dias.
5. Avisos dentro do app primeiro. Notificação push fica para depois, porque exige Web Push e tem limites no iOS.

Pronto quando: dá para ver quanto resta de cada categoria no mês.

## 7. Itens menores: CSV, metas, offline e casais

Status: pendente

- **CSV:** exportar os lançamentos (do mês ou todos) e importar. Compartilha a base do tópico 1, Fase A.
- **Metas:** tabela `goals` (nome, valor alvo, prazo, valor guardado) com barra de progresso.
- **Offline:** guardar lançamentos feitos sem internet numa fila local (IndexedDB) e enviar quando a conexão voltar. Hoje o app abre offline, mas os dados precisam de internet.
- **Casais:** grupo familiar com membros e RLS compartilhado. É o mais complexo e exige desenho próprio, por isso fica por último.

Pronto quando: um item por vez, cada um testado no celular.

## 2. Menos digitação manual

Status: pendente

1. Tela de novo lançamento com o valor primeiro e campos mínimos.
2. Botão para repetir o último lançamento.
3. Sugestão de categoria pela descrição, aprendendo dos lançamentos anteriores do próprio usuário.
4. Atalhos do PWA no manifesto (por exemplo, "Nova despesa") direto da tela inicial do celular.
5. Sem notificações insistentes.

Pronto quando: registrar uma despesa comum em até 3 toques.

## 5. Segurança e controle dos dados

Status: pendente

1. Ligar a proteção contra senhas vazadas no Supabase Auth (verificar se o plano permite).
2. Autenticação em dois fatores (TOTP) opcional.
3. Exportar todos os dados do usuário em CSV ou JSON.
4. Texto curto de privacidade dentro do app, explicando o que é guardado.
5. Rodar de novo os alertas de segurança do Supabase depois de cada migration.
6. Revisar cabeçalhos e política de conteúdo da página.

Já feito: exclusão de conta e RLS por usuário.

Pronto quando: os alertas de segurança não têm pendências evitáveis.

## 6. Preço baixo e simplicidade

Status: pendente

1. Manter o app gratuito e conferir os limites do plano gratuito do Supabase (armazenamento, usuários, pausa por inatividade).
2. Onboarding de 3 passos no primeiro acesso: criar conta, conferir as categorias, registrar o primeiro lançamento.
3. Tela inicial enxuta (saldo, divisão e categorias), com recursos avançados em Ajustes.
4. Testar com 3 pessoas reais e anotar onde travam.

Pronto quando: uma pessoa nova registra o primeiro lançamento sem ajuda.

## 1. Visão única das contas e sincronização automática

Status: pendente

**Fase A (viável já):**
1. Importar extrato em CSV ou OFX, com mapeamento de colunas.
2. Detectar duplicados e mostrar uma prévia antes de salvar.

**Fase B (exploratória):**
1. Avaliar agregadores de Open Finance (por exemplo, Pluggy e Belvo; verificar preço e termos).
2. Conectar por uma Supabase Edge Function, para a chave do agregador nunca ficar no navegador.

Decisões pendentes: custo por usuário, LGPD e consentimento.

Pronto quando (Fase A): importar um extrato real sem duplicar lançamentos.

## Fontes da pesquisa

- [MX: Why financial apps fall short](https://mx.com/research/financial-apps-fall-short/)
- [Quantilope: features mais importantes em apps financeiros](https://www.quantilope.com/en/blog/insight-studies-most-important-features-finance-app)
- [Unstar: comparação de YNAB, Rocket Money e Monarch](https://unstar.app/blog/ynab-vs-rocket-money-vs-monarch-budgeting-apps-ranked-2026)
- [Waypoint: alternativas ao Mint](https://waypointbudget.com/blog/mint-alternative-2026)
- [Kimola: feedback de usuários do Spendee](https://kimola.com/reports/unlock-insights-into-spendees-user-feedback-app-store-id-151835)
- [Product Hunt: apps de dinheiro que as pessoas abandonaram](https://www.producthunt.com/p/general/what-s-the-money-app-you-rage-quit-and-what-finally-did-it)
- [Origin: apps de orçamento para casais](https://useorigin.com/resources/blog/best-budgeting-app-for-couples-in-2026)
- [Tecnoblog: Pix Automático](https://tecnoblog.net/comunidade/t/pix-automatico-estreia-no-brasil-streamings-ja-testam-a-funcao/151941)
- [InfoMoney: Open Finance no app do BB](https://www.infomoney.com.br/minhas-financas/open-finance-ganha-espaco-bb-ja-gerencia-r-7-bi-em-saldos-com-outros-bancos-em-app-de-gestao-financeira/)

Algumas fontes são conteúdo de empresas do setor, e há poucas pesquisas com usuários brasileiros.
