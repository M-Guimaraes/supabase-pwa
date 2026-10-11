# Caixa

App de controle financeiro (PWA) feito com HTML, CSS e JavaScript puros. Os arquivos são servidos pelo GitHub Pages e os dados ficam no Supabase.

## O que faz

- Login com e-mail e senha
- Receitas e despesas por mês, com saldo e divisão por categoria
- Categorias próprias (já vem com algumas padrão)
- Importação de extrato bancário em OFX ou CSV, com prévia e sem duplicar lançamentos (Ajustes → Importar extrato)
- Menos digitação: categoria sugerida pela descrição, descrições recentes ao digitar, botão "Repetir o último" e atalhos "Nova despesa" e "Nova receita" na tela inicial do celular (os atalhos dependem do sistema: funcionam no Android ao segurar o ícone)
- Visual de extrato bancário: valores em Plex Serif, texto em Instrument Sans (fontes OFL em `fonts/`, com as licenças), linhas finas no lugar de cartões, padrão de cédula no saldo e na entrada, Ajustes em seções, primeiros passos para contas novas, tema claro e escuro
- Cadastro com validação de senha (8 a 72 caracteres, minúscula, maiúscula, número, caractere especial e confirmação), requisitos ao vivo e "Mostrar senha"; o login continua aceitando senhas antigas
- Alterar senha em Ajustes → Segurança, informando a senha atual (combina com a opção do Supabase que exige a senha antiga) e as mesmas regras do cadastro; com a verificação em duas etapas ativa, também pede o código do autenticador
- Segurança: verificação em duas etapas opcional (app autenticador), cópia de todos os dados em JSON, texto de privacidade e política de conteúdo (CSP) na página
- Exportação de lançamentos em CSV, do mês ou de tudo (Ajustes → Dados)
- Modo offline: o app abre sem internet com a última cópia dos dados; lançamentos novos ficam na fila do aparelho e sobem sozinhos quando a conexão volta (editar e excluir precisam de internet; sair do app apaga a cópia local)
- Gráfico "Últimos 6 meses" no Resumo: receitas × despesas por mês, toque no mês para ver os valores e botão para ver em tabela
- Metas com valor, quanto já foi guardado, prazo e quanto guardar por mês (Ajustes → Metas)
- Orçamento mensal por categoria, com barra de progresso e aviso a partir de 80% (Ajustes → Orçamento mensal)
- Contas a pagar com vencimento: as que vencem em até 7 dias ou estão atrasadas aparecem no Resumo, e "Paguei" cria a despesa (Ajustes → Contas a pagar)
- Lançamentos fixos (aluguel, assinaturas, salário) que entram sozinhos todo mês, com sugestões de itens que se repetem e total de despesas fixas no Resumo (Ajustes → Lançamentos fixos)
- Exclusão da própria conta, com todos os dados, em Ajustes
- Instalável na tela inicial do celular e abre offline (os dados precisam de internet)

## Como publicar no GitHub Pages

1. No repositório, abra Settings → Pages.
2. Em Build and deployment, escolha Deploy from a branch.
3. Selecione a branch `main` e a pasta `/ (root)`, e salve.
4. Aguarde cerca de um minuto. O endereço será `https://<usuario>.github.io/supabase-pwa/`.

## Configurar o Supabase

1. Em Authentication → URL Configuration, defina a Site URL com o endereço do GitHub Pages (`https://<usuario>.github.io/supabase-pwa/`) e adicione o mesmo endereço em Redirect URLs. Sem isso, o link do e-mail de confirmação não volta para o app.
2. Se a confirmação de e-mail estiver ligada, quem criar conta precisa clicar no link recebido antes de entrar. Para testar sem isso, desligue "Confirm email" em Authentication → Providers → Email.

O esquema do banco está em `supabase/schema.sql`. A chave usada em `app.js` é a chave publicável, feita para ficar no navegador. A segurança vem das regras de RLS: cada pessoa só lê e altera as próprias linhas. Nunca coloque a chave `service_role` neste projeto.

## Arquivos

- `index.html`, `styles.css`, `app.js`: o app
- `importer.js`: leitor de extratos OFX e CSV (testes em `tests/`, rodar com `node --test`)
- `tests/smoke/`: teste de fumaça no navegador com Supabase de mentira (`python3 tests/smoke/smoke.py`)
- `password.js`: regras de senha e de e-mail do cadastro, testadas em `tests/`
- `quick.js`: sugestões e atalhos para digitar menos, testados em `tests/`
- `offline.js`: cópia local e fila de lançamentos offline, testados em `tests/`
- `trend.js`: série mensal e escala do gráfico, testados em `tests/`
- `exporter.js`: CSV de exportação e cálculo das metas, testados em `tests/`
- `budget.js`: regras de orçamento e contas a vencer, também testadas em `tests/`
- `recurring.js`: regras dos lançamentos fixos (geração mensal, sugestões e total), também testadas em `tests/`
- `manifest.webmanifest`, `sw.js`, `icons/`: instalação e uso offline
- `supabase/schema.sql`: tabelas, regras de segurança e categorias padrão
