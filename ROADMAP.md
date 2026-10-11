# Planejamento do Caixa

Features mais pedidas em apps de finanças pessoais, com o plano de execução de cada uma. A lista vem de uma pesquisa de mercado feita em outubro de 2026; as fontes ficam no fim do arquivo.

Estados possíveis: pendente, em andamento, concluído.

| # | Tópico | Prioridade | Status |
|---|---|---|---|
| 1A | Importar extrato (CSV e OFX) | 1 | concluído |
| 4 | Gastos recorrentes e assinaturas | 2 | implementado, falta testar no celular |
| 3 | Orçamento por categoria, alertas e lembretes de contas | 3 | implementado, falta testar no celular |
| 7 | Itens menores: exportar CSV, metas, offline e casais | 4 | em andamento: CSV, metas e gráfico de evolução (6 meses) implementados, falta testar; offline pendente; casais em segundo plano |
| 2 | Menos digitação manual | 5 | implementado, falta testar no celular |
| 5 | Segurança e controle dos dados | 6 | implementado no app; falta aplicar a migration das duas etapas e ligar a proteção de senhas vazadas |
| 6 | Preço baixo e simplicidade | 7 | parcial: onboarding e telas enxutas feitos; falta conferir limites do plano e testar com pessoas |
| 1B | Sincronização automática (Open Finance) | 8 | segundo plano (backlog) |

A numeração segue a ordem da pesquisa; a prioridade é a ordem sugerida de execução.

## 4. Gastos recorrentes e assinaturas

Status: implementado em 11/10/2026, falta testar no celular.

1. Criar a tabela `recurring_transactions` (tipo, valor, categoria, dia do mês, ativa, última geração) com RLS por usuário.
2. Ao abrir o app, gerar de forma idempotente os lançamentos do mês que ainda não existem, para não duplicar.
3. Tela para criar, pausar e excluir recorrências.
4. Sugerir possíveis assinaturas quando houver lançamentos parecidos em meses seguidos.
5. Mostrar o total mensal de assinaturas no Resumo.

Feito: tabela `recurring_transactions` com RLS; geração ao abrir o app (uma vez por dia), com `external_id` `rec:<id>:<mês>` para não duplicar; dia 31 vira o último dia de meses curtos; preenchimento retroativo de até 24 meses; ao retomar uma recorrência pausada, os meses parados não são preenchidos; tela em Ajustes para criar, editar, pausar e excluir; sugestões a partir de lançamentos iguais em dois meses seguidos; total de despesas fixas no Resumo. Testes automáticos em `tests/recurring.test.js`.

A avaliar: gerar por rotina agendada no Supabase (`pg_cron`) em vez de no app.

Pronto quando: lançamentos fixos aparecem sozinhos todo mês, sem duplicar.

## 3. Orçamento por categoria, alertas e lembretes de contas

Status: implementado em 11/10/2026, falta testar no celular.

Feito: tabelas `budgets` (um limite por categoria) e `bills` (conta com vencimento e data de pagamento), ambas com RLS; telas em Ajustes; barra por categoria no Resumo (amarela a partir de 80%, vermelha acima de 100%, com o valor que resta ou que passou); lista "Contas a vencer" no Resumo com atrasadas e as dos próximos 7 dias; "Paguei" cria a despesa de hoje sem duplicar (`bill:<id>`). Avisos só dentro do app; push fica para depois. Testes em `tests/budget.test.js`.

Plano original:

1. Criar a tabela `budgets` (usuário, categoria, limite mensal) com RLS, via migration.
2. Tela para definir o limite de cada categoria.
3. Barra de progresso no Resumo, com aviso a partir de 80% e ao passar de 100%.
4. Contas a pagar: campo de vencimento e situação (pendente ou paga), e lista de contas a vencer nos próximos 7 dias.
5. Avisos dentro do app primeiro. Notificação push fica para depois, porque exige Web Push e tem limites no iOS.

Pronto quando: dá para ver quanto resta de cada categoria no mês.

## 7. Itens menores: CSV, metas, offline e casais

Status: em andamento. Exportar CSV e metas implementados em 11/10/2026, faltam testar no celular. Gráfico de evolução dos últimos 6 meses implementado em 11/10/2026. Offline pendente; casais em segundo plano.

Feito: exportação em CSV (`;`, vírgula decimal, UTF-8 com BOM, despesas negativas, proteção contra fórmulas em planilhas) do mês ou de tudo; tabela `goals` com RLS, tela em Ajustes com barra de progresso, "guardar mais" e valor sugerido por mês até o prazo. Testes em `tests/exporter.test.js`.

- **Exportar CSV:** baixar os lançamentos (do mês ou todos). A importação está no tópico 1A.
- **Metas:** tabela `goals` (nome, valor alvo, prazo, valor guardado) com barra de progresso.
- **Offline:** guardar lançamentos feitos sem internet numa fila local (IndexedDB) e enviar quando a conexão voltar. Hoje o app abre offline, mas os dados precisam de internet.
- **Casais:** grupo familiar com membros e RLS compartilhado. É o mais complexo e exige desenho próprio, por isso fica por último.

Pronto quando: um item por vez, cada um testado no celular.

## 2. Menos digitação manual

Status: implementado em 11/10/2026, falta testar no celular.

Feito: a tela de novo lançamento já abria com o valor em foco e data de hoje; agora há categoria sugerida ao digitar a descrição (usa a categoria mais recente de descrição parecida, e some se você escolher outra), lista das descrições recentes, botão "Repetir o último" (mostra o que será repetido) e atalhos "Nova despesa" e "Nova receita" no manifesto, que abrem o formulário direto. Os atalhos aparecem ao segurar o ícone no Android; o iOS não mostra atalhos de PWA. Sem notificações. Testes em `tests/quick.test.js`.

1. Tela de novo lançamento com o valor primeiro e campos mínimos.
2. Botão para repetir o último lançamento.
3. Sugestão de categoria pela descrição, aprendendo dos lançamentos anteriores do próprio usuário.
4. Atalhos do PWA no manifesto (por exemplo, "Nova despesa") direto da tela inicial do celular.
5. Sem notificações insistentes.

Pronto quando: registrar uma despesa comum em até 3 toques.

## 5. Segurança e controle dos dados

Status: implementado em 11/10/2026. Pendências do usuário: rodar o SQL das duas etapas no Supabase (último bloco de `supabase/schema.sql`), ligar a proteção contra senhas vazadas (item 1, painel do Supabase, pode exigir plano pago) e testar no celular.

Feito: autenticação em dois fatores (TOTP) opcional em Ajustes → Segurança, com tela de código ao entrar; regra restritiva no banco (`private.aal_ok()`) que exige sessão aal2 de quem ativou, para não dar para contornar chamando a API com a senha; excluir conta também exige; botão "Baixar todos os dados" (JSON); texto de privacidade em Ajustes; política de conteúdo (CSP) por meta tag, já que o GitHub Pages não deixa configurar cabeçalhos; segurança do Supabase conferida a cada migration. Teste de fumaça no navegador em `tests/smoke/`.

Limite conhecido: sem acesso a cabeçalhos HTTP, `frame-ancestors` e HSTS dependem do GitHub Pages.

1. Ligar a proteção contra senhas vazadas no Supabase Auth (verificar se o plano permite) e definir a política de senha também no servidor (Authentication → Sign In / Providers → Email: mínimo de 8 caracteres e exigir minúsculas, maiúsculas, números e símbolos). A validação do app é só conveniência: quem chama a API direto a contorna. Já feito no app: validação do cadastro.
2. Autenticação em dois fatores (TOTP) opcional.
3. Exportar todos os dados do usuário em CSV ou JSON.
4. Texto curto de privacidade dentro do app, explicando o que é guardado.
5. Rodar de novo os alertas de segurança do Supabase depois de cada migration.
6. Revisar cabeçalhos e política de conteúdo da página.

Já feito: exclusão de conta e RLS por usuário.

Pronto quando: os alertas de segurança não têm pendências evitáveis.

## 6. Preço baixo e simplicidade

Status: parcial. Feito em 11/10/2026: primeiros passos no Resumo para contas sem dados (conta criada, conferir categorias, primeiro lançamento), Ajustes reorganizado em seções recolhíveis e novo visual de extrato bancário (identidade, fontes próprias, ícones, tema escuro). Falta: conferir os limites do plano gratuito do Supabase e testar com 3 pessoas reais.

1. Manter o app gratuito e conferir os limites do plano gratuito do Supabase (armazenamento, usuários, pausa por inatividade).
2. Onboarding de 3 passos no primeiro acesso: criar conta, conferir as categorias, registrar o primeiro lançamento.
3. Tela inicial enxuta (saldo, divisão e categorias), com recursos avançados em Ajustes.
4. Testar com 3 pessoas reais e anotar onde travam.

Pronto quando: uma pessoa nova registra o primeiro lançamento sem ajuda.

## 1A. Importar extrato (CSV e OFX)

Status: concluído, testado no celular pelo usuário em 11/10/2026. Decidido em 11/10/2026 como primeira entrega, no lugar da sincronização automática, porque não tem custo e serve a todos os usuários.

1. **Entrada:** em Ajustes, botão "Importar extrato" que abre o seletor de arquivo. O arquivo é lido no próprio navegador e não é enviado a nenhum servidor; só os lançamentos que o usuário confirmar vão para o banco.
2. **Leitor de OFX:** aceitar OFX 1.x (formato SGML) e 2.x (XML). Ler data, valor, descrição e o identificador único de cada lançamento (`FITID`). O tipo (receita ou despesa) vem do sinal do valor.
3. **Leitor de CSV:** detectar o separador (`;` ou `,`), a codificação (UTF-8 ou Latin-1), a vírgula decimal e datas no formato dd/mm/aaaa. Tela para o usuário apontar quais colunas são data, descrição e valor, com o mapeamento lembrado para a próxima vez.
4. **Duplicados:** nova migration com a coluna `external_id` em `transactions` e um índice único por usuário. Para OFX, usar o `FITID`; para CSV, um código calculado a partir de data, valor e descrição. Reimportar o mesmo arquivo não pode duplicar nada.
5. **Prévia antes de salvar:** lista com os lançamentos encontrados, duplicados já marcados e desmarcados, escolha de categoria por linha e total de receitas e despesas do arquivo.
6. **Categoria sugerida:** repetir a categoria de lançamentos anteriores com descrição parecida do próprio usuário.
7. **Importação em lotes**, com aviso de progresso e de erros, e limite de tamanho de arquivo.
8. **Testes** com arquivos de exemplo fictícios: OFX 1.x, OFX 2.x, CSV com `;` e vírgula decimal, CSV em Latin-1 e arquivo malformado.

Para ajustar o leitor a dados reais, pedir um arquivo de exemplo do banco do usuário, com os valores trocados por fictícios.

Feito: leitores de OFX 1.x/2.x e CSV (testes automáticos em `tests/`, 11 casos), coluna `external_id` com índice único, prévia com duplicados, categoria sugerida, inverter sinais para faturas de cartão e importação em lotes de 100. Formato do C6 Bank testado com um extrato real, só no leitor.

Falta: nada pendente; outros bancos e faturas de cartão podem exigir ajuste no leitor.

Pronto quando: importar um extrato real sem duplicar lançamentos, mesmo importando o mesmo arquivo duas vezes.

## 1B. Sincronização automática (Open Finance)

Status: pendente, depois do 1A. Pesquisa de 11/10/2026:

- Conectar direto aos bancos exige ser instituição homologada pelo Banco Central, o que não é realista para o projeto. O caminho é um agregador já homologado.
- **Uso pessoal, gratuito:** o "Meu Pluggy" é descrito como gratuito para desenvolvedores testarem. Cada pessoa cria a própria conta na Pluggy, então serve para a conta do dono do projeto, mas não escala para outros usuários.
- **Para todos os usuários:** plano pago de agregador. Uma página comparativa de terceiros lista a Pluggy a partir de R$ 2.500 por mês e a Belvo a partir de US$ 1.000 por mês; os conectores de Open Finance da Pluggy dependem de contato com o comercial. Confirmar valores direto com os fornecedores.
- O consentimento é dado no ambiente do banco e pode ser revogado a qualquer momento. Dados bancários são sensíveis pela LGPD.

Plano, se seguir adiante:
1. Experimento só na conta do dono do projeto, com o Meu Pluggy.
2. Chamadas por uma Supabase Edge Function, com as chaves guardadas como segredo no Supabase e nunca no navegador.
3. Reaproveitar a coluna `external_id` e a detecção de duplicados do 1A.
4. Só avaliar abrir para outros usuários se houver orçamento para um agregador pago.

Pronto quando (experimento): lançamentos do próprio banco aparecem no app sem duplicar com os importados.

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

Para o Open Finance (tópico 1B):

- [Pluggy: conectores Open Finance](https://docs.pluggy.ai/docs/open-finance-regulated)
- [Actual Budget: integração com a Pluggy](https://actualbudget.org/docs/experimental/pluggyai)
- [TabNews: uso do Meu Pluggy](https://www.tabnews.com.br/marlindo71/d39804a3-211a-4d45-8491-e4a36e85a6e8)
- [Open Banking Tracker: Belvo vs Pluggy](https://openbankingtracker.com/api-aggregators/belvo/vs/pluggy)
- [Finsiders: fim do limite de 12 meses no consentimento](https://finsidersbrasil.com.br/regulamentacao/bc-acaba-com-limite-de-12-meses-para-compartilhamento-de-dados-no-open-finance)
- [Tecnospeed: glossário do Open Finance](https://blog.tecnospeed.com.br/glossario-open-finance-para-empresas-de-ti/)

Algumas fontes são conteúdo de empresas do setor, e há poucas pesquisas com usuários brasileiros.
