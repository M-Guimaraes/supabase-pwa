# Bibliotecas de terceiros

Copiadas do npm para o repositório, em vez de carregadas de um CDN: assim a versão não muda sozinha e nenhum servidor de fora consegue trocar o código que roda com a sessão do usuário. A CSP em `index.html` só permite scripts do próprio site.

| Arquivo | Pacote | Origem no pacote | SHA-256 |
|---|---|---|---|
| `supabase-js-2.117.2.js` | `@supabase/supabase-js@2.117.2` (MIT) | `dist/umd/supabase.js` | `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd` |
| `pdfjs-6.3.289/pdf.min.mjs` | `pdfjs-dist@6.3.289` (Apache-2.0) | `legacy/build/pdf.min.mjs` | `f401927e692efc7735e0cd528c490d0dd31b7f0972c122b7040df805be45cce4` |
| `pdfjs-6.3.289/pdf.worker.min.mjs` | `pdfjs-dist@6.3.289` (Apache-2.0) | `legacy/build/pdf.worker.min.mjs` | `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e` |

O pdf.js usa o build `legacy`, que funciona em navegadores de celular mais antigos, e só é carregado quando alguém importa uma fatura em PDF.

## Como atualizar

1. `npm pack @supabase/supabase-js@<versão>` (ou `pdfjs-dist@<versão>`) e confira que o `dist.integrity` de `npm view <pacote>@<versão>` bate com o arquivo baixado.
2. Copie o arquivo para cá com a versão no nome e apague o antigo.
3. Troque o caminho em `index.html` (supabase-js) ou em `PDFJS_DIR` no `app.js` (pdf.js), e em `sw.js`.
4. Atualize a tabela acima (`sha256sum vendor/...`) e aumente `CACHE` em `sw.js`.
