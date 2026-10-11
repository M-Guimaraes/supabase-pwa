# Caixa

App de controle financeiro (PWA) feito com HTML, CSS e JavaScript puros. Os arquivos são servidos pelo GitHub Pages e os dados ficam no Supabase.

## O que faz

- Login com e-mail e senha
- Receitas e despesas por mês, com saldo e divisão por categoria
- Categorias próprias (já vem com algumas padrão)
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
- `manifest.webmanifest`, `sw.js`, `icons/`: instalação e uso offline
- `supabase/schema.sql`: tabelas, regras de segurança e categorias padrão
