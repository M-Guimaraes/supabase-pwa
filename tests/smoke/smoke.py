"""Teste de fumaça no navegador, com um Supabase de mentira (stub.js).
Rodar com: python3 tests/smoke/smoke.py   (precisa de playwright e chromium)"""
import sys, threading, http.server, socketserver, functools, datetime, json
from playwright.sync_api import sync_playwright
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
H.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8124), H); srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open(os.path.join(HERE, 'stub.js')).read()
problems = []
def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg)
    if not cond: problems.append(msg)
def fab(page):
    page.click('[data-tab=list]')
    page.click('#fab')

def go_settings(page):
    page.click('[data-tab=categories]')
    page.evaluate("document.querySelectorAll('details.group').forEach(d => d.open = true)")

def tiny_pdf(text):
    """PDF de uma página com uma linha de texto, montado à mão (sem dependências)."""
    stream = ('BT /F1 18 Tf 72 720 Td (%s) Tj ET' % text).encode()
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>',
            b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    out = b'%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    return out

with sync_playwright() as p:
    # CHROMIUM_PATH: usar um Chromium já instalado em vez do baixado pelo Playwright.
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
    ctx = b.new_context(viewport={'width': 390, 'height': 800}, accept_downloads=True, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and problems.append('console: ' + m.text))
    page.route('**/vendor/supabase-js-*.js', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    page.goto('http://127.0.0.1:8124/index.html')
    page.wait_for_selector('#app:not([hidden])')
    page.wait_for_timeout(500)
    today = datetime.date.today()
    check(page.is_hidden('#fab'), 'botão + escondido no Resumo')
    page.click('[data-tab=list]'); check(page.is_visible('#fab'), 'botão + aparece em Lançamentos')
    go_settings(page); check(page.is_hidden('#fab'), 'botão + escondido em Ajustes')
    page.click('[data-tab=summary]')
    check(page.is_visible('#onboarding'), 'primeiros passos aparecem para conta vazia')
    page.click('#onb-first'); page.wait_for_selector('#sheet[open]'); page.click('#tx-cancel')
    # transação
    fab(page); page.fill('#tx-amount', '80,00'); page.select_option('#tx-category', 'cat-mercado'); page.fill('#tx-desc', 'Mercado Central'); page.click('#tx-save')
    page.wait_for_timeout(500)
    check(len(page.evaluate('__db.transactions')) == 1, 'lançamento salvo')
    check(page.is_hidden('#onboarding'), 'primeiros passos somem depois do primeiro lançamento')
    fab(page)
    check(page.is_visible('#tx-repeat'), 'botão repetir visível: ' + page.inner_text('#tx-repeat'))
    page.fill('#tx-desc', 'Mercado Central 77')
    check(page.input_value('#tx-category') == 'cat-mercado', 'categoria sugerida pela descrição')
    check(page.is_visible('#tx-hint'), 'dica de categoria visível')
    page.click('#tx-repeat'); page.click('#tx-save'); page.wait_for_timeout(400)
    check(len(page.evaluate('__db.transactions')) == 2, 'repetir último salvou')
    # orçamento
    go_settings(page)
    page.click('#budget-add'); page.fill('#bud-amount', '100'); page.click('#bud-save'); page.wait_for_timeout(400)
    page.click('[data-tab=summary]')
    check('Orçamento do mês' in page.inner_text('#budget-progress'), 'orçamento no resumo')
    page.click('[data-tab=summary]'); page.wait_for_timeout(200)
    check(page.is_visible('#trend'), 'gráfico aparece com lançamentos')
    check(page.locator('#trend-chart .hit').count() == 6, 'gráfico mostra 6 meses')
    page.click('#trend-chart .hit >> nth=1')
    check(page.locator('#trend-readout .month').inner_text() != '', 'toque no mês preenche a leitura')
    page.click('#trend-toggle')
    check(page.locator('#trend-table tbody tr').count() == 6, 'tabela do gráfico tem 6 linhas')
    page.click('#trend-toggle')
    page.click('label[for=trange-year]'); page.wait_for_timeout(200)
    check(page.locator('#trend-chart .hit').count() == 12, 'visão do ano mostra 12 meses')
    check('Total de' in page.inner_text('#trend-readout'), 'visão do ano começa com o total do ano')
    page.click('#year-prev'); page.wait_for_timeout(200)
    check(str(datetime.date.today().year - 1) in page.inner_text('#year-label'), 'navega para o ano anterior')
    check(page.is_enabled('#year-next'), 'botão próximo ano habilitado no ano passado')
    page.click('#year-next'); page.wait_for_timeout(200)
    check(page.is_disabled('#year-next'), 'não passa do ano atual')
    page.click('#trend-toggle'); check(page.locator('#trend-table tfoot tr').count() == 1, 'tabela do ano tem linha de total'); page.click('#trend-toggle')
    page.click('label[for=trange-6m]'); page.wait_for_timeout(200)
    check(page.locator('#trend-chart .hit').count() == 6, 'volta para 6 meses')
    page.select_option('#trend-category', 'cat-mercado'); page.wait_for_timeout(200)
    check('Mercado' in page.inner_text('#trend-title'), 'filtro de categoria aparece no título')
    page.click('#trend-chart .hit >> nth=5'); page.wait_for_timeout(100)
    check('R$ 0,00' in page.inner_text('#trend-readout') or 'R$' in page.inner_text('#trend-readout'), 'leitura com filtro de categoria')
    page.select_option('#trend-category', '__none'); page.wait_for_timeout(200)
    check('Sem categoria' in page.inner_text('#trend-title'), 'filtro sem categoria')
    page.select_option('#trend-category', ''); page.wait_for_timeout(200)
    check('·' not in page.inner_text('#trend-title'), 'filtro limpo volta ao total')
    # offline: salva no aparelho, mostra pendente e envia ao voltar
    n0 = len(page.evaluate('__db.transactions'))
    ctx.set_offline(True); page.wait_for_timeout(200)
    check(page.is_visible('#offline-banner'), 'aviso de sem conexão aparece')
    fab(page); page.fill('#tx-amount', '12,34'); page.fill('#tx-desc', 'Padaria offline'); page.click('#tx-save'); page.wait_for_timeout(300)
    check(len(page.evaluate('__db.transactions')) == n0, 'offline não grava no servidor')
    check(page.locator('#tx-groups .tx.pending').count() == 1, 'lançamento aparece como pendente')
    check('1 lançamento aguardando' in page.inner_text('#offline-text'), 'banner conta 1 pendente')
    page.click('#tx-groups .tx.pending'); page.wait_for_timeout(100)
    check(not page.evaluate("document.getElementById('sheet').open"), 'pendente não abre edição')
    page.click('[data-tab=summary]'); page.wait_for_timeout(100)
    ctx.set_offline(False); page.wait_for_timeout(900)
    check(len(page.evaluate('__db.transactions')) == n0 + 1, 'ao voltar a internet o lançamento é enviado')
    check(page.is_hidden('#offline-banner'), 'aviso some depois de sincronizar')
    check(page.evaluate("JSON.parse(localStorage.getItem('caixa-offline-queue')||'{}')") == {}, 'fila esvaziada')
    print('   ', page.inner_text('#budget-list').replace('\n', ' | '))
    check(page.locator('#budget-list li.over').count() == 1, '160 de 100 = estourou')
    # conta
    go_settings(page)
    page.click('#bill-add'); page.fill('#bill-amount', '150'); page.fill('#bill-desc', 'Luz'); page.click('#bill-save'); page.wait_for_timeout(400)
    page.click('[data-tab=summary]')
    check('vence hoje' in page.inner_text('#bills-due'), 'conta vence hoje no resumo')
    page.click('#bills-due-list button'); page.wait_for_timeout(500)
    check(page.locator('#bills-due').is_hidden(), 'conta paga saiu da lista')
    check(len(page.evaluate('__db.transactions')) == 4, 'pagamento virou despesa')
    # recorrência
    go_settings(page)
    page.click('#recurring-add'); page.fill('#rec-amount', '1200'); page.fill('#rec-desc', 'Aluguel'); page.fill('#rec-day', '1'); page.click('#rec-save'); page.wait_for_timeout(700)
    txs = page.evaluate('__db.transactions')
    check(any(t.get('external_id','').startswith('rec:') for t in txs), 'recorrência gerou lançamento')
    check(len([t for t in txs if t.get('external_id','').startswith('rec:')]) == 1, 'sem duplicar')
    # meta
    page.click('#goal-add'); page.fill('#goal-name', 'Viagem'); page.fill('#goal-target', '1000'); page.fill('#goal-saved', '250'); page.click('#goal-save'); page.wait_for_timeout(400)
    check('25%' in page.inner_text('#goals-list'), 'meta com 25%')
    # exportar
    with page.expect_download() as d: page.click('#export-month')
    path = d.value.path(); csv = open(path, encoding='utf-8').read()
    check(csv.startswith('﻿Data;Tipo'), 'CSV do mês: ' + d.value.suggested_filename)
    with page.expect_download() as d: page.click('#backup-download')
    j = json.load(open(d.value.path()))
    check(j['app'] == 'Caixa' and len(j['data']['transactions']) == 5, 'backup JSON com %d lançamentos' % len(j['data']['transactions']))
    # filtro da lista por dia, mês e ano
    page.click('[data-tab=list]'); page.wait_for_timeout(200)
    check('Hoje' in page.inner_text('#period-label'), 'lista abre em hoje: ' + page.inner_text('#period-label'))
    check(page.is_hidden('#period-today'), 'sem filtro ativo, não mostra "voltar para hoje"')
    n_day = page.locator('#tx-groups .tx').count()
    check(n_day >= 1, 'lista de hoje tem lançamentos (%d)' % n_day)
    page.click('#period-prev'); page.wait_for_timeout(200)
    check('Ontem' in page.inner_text('#period-label'), 'seta volta um dia')
    check(page.is_visible('#period-today'), 'com filtro ativo aparece "voltar para hoje"')
    page.click('#period-today'); page.wait_for_timeout(200)
    check('Hoje' in page.inner_text('#period-label') and page.locator('#tx-groups .tx').count() == n_day, 'voltar para hoje')
    page.click('label[for=period-month]'); page.wait_for_timeout(200)
    n_month = page.locator('#tx-groups .tx').count()
    check(n_month >= n_day, 'mês mostra pelo menos o que o dia mostra (%d)' % n_month)
    page.click('label[for=period-year]'); page.wait_for_timeout(200)
    check(page.locator('#tx-groups .tx').count() >= n_month, 'ano mostra pelo menos o que o mês mostra')
    check(str(datetime.date.today().year) in page.inner_text('#period-label'), 'rótulo do ano')
    page.fill('#period-pick', '2020'); page.dispatch_event('#period-pick', 'change'); page.wait_for_timeout(200)
    check(page.locator('#tx-groups .tx').count() == 0 and page.is_visible('#tx-empty'), 'ano sem lançamentos mostra aviso vazio')
    page.click('#period-today'); page.wait_for_timeout(200)
    check(page.is_checked('#period-day'), 'voltar para hoje restaura o modo dia')
    # seleção múltipla e exclusão em massa
    page.click('#tx-select-toggle')
    check(page.is_visible('#tx-bulk-bar') and page.is_hidden('#tx-select-toggle'), 'seleção múltipla abre a barra de ações')
    page.locator('#tx-groups .tx').first.click()
    page.locator('#tx-groups .tx').nth(1).click()
    check('2 selecionados' in page.inner_text('#tx-bulk-count'), 'conta os selecionados')
    page.click('#tx-bulk-cancel')
    check(page.is_hidden('#tx-bulk-bar') and page.is_visible('#tx-select-toggle'), 'cancelar sai do modo seleção sem excluir')
    check(page.locator('#tx-groups .tx').count() == n_day, 'cancelar não mudou a lista')
    page.click('#tx-select-toggle')
    page.click('#tx-select-all')
    check('selecionados' in page.inner_text('#tx-bulk-count') and str(n_day) in page.inner_text('#tx-bulk-count'), 'selecionar tudo marca todo mundo')
    page.click('#tx-select-all')
    page.locator('#tx-groups .tx').first.click()
    page.locator('#tx-groups .tx').nth(1).click()
    page.once('dialog', lambda d: d.accept())
    page.click('#tx-bulk-delete'); page.wait_for_timeout(300)
    check(page.locator('#tx-groups .tx').count() == n_day - 2, 'seleção múltipla excluiu os 2 lançamentos')
    check(page.is_hidden('#tx-bulk-bar'), 'sai do modo seleção depois de excluir')
    page.click('[data-tab=summary]')
    # cartão de crédito (a leitura do PDF em si é testada com node --test e um PDF real,
    # fora daqui; isto cobre a tela: cartão, fatura em aberto e a compra dentro dela)
    page.evaluate("""
      __db.credit_cards.push({id:'card1', name:'FULANO DA SILVA', last4:'0320', user_id:'u1', created_at:'2026-01-01'});
      __db.card_invoices.push({id:'inv1', card_id:'card1', period_start:'2026-09-01', period_end:'2026-09-30', due_on:'2026-10-07', total:150, min_payment:50, paid_on:null, paid_amount:null, user_id:'u1', created_at:'2026-01-01'});
      __db.transactions.push({id:'cardtx1', type:'expense', amount:150, description:'LOJA EXEMPLO', category_id:null, occurred_on:'2026-09-15', card_invoice_id:'inv1', external_id:'card:0320:2026-10-07:0', user_id:'u1', created_at:'c'});
    """)
    fab(page); page.fill('#tx-amount', '1,00'); page.select_option('#tx-category', 'cat-mercado'); page.click('#tx-save'); page.wait_for_timeout(300)
    page.click('[data-tab=cards]'); page.wait_for_timeout(200)
    check('FULANO DA SILVA' in page.inner_text('#cards-list') and '0320' in page.inner_text('#cards-list'), 'cartão aparece na aba Cartão')
    page.click('#cards-list summary')
    check('Em aberto' in page.inner_text('#cards-list'), 'fatura sem pagamento mostra "Em aberto"')
    page.click('#cards-list .cat-list button')
    page.wait_for_selector('#invoice-sheet[open]')
    check('LOJA EXEMPLO' in page.inner_text('#invoice-groups'), 'fatura mostra a compra importada')
    page.click('#invoice-close')
    page.click('[data-tab=cards]')
    page.click('#card-import-open'); page.wait_for_selector('#card-import-sheet[open]')
    check(page.is_disabled('#card-import-submit'), 'importar fatura começa desabilitado, sem arquivo')
    page.click('#card-import-cancel'); page.wait_for_timeout(400)  # espera a animação de saída
    check(page.is_hidden('#card-import-sheet[open]'), 'cancelar fecha a folha de importar fatura')
    # excluir fatura e cartão (as compras saem junto)
    page.evaluate("""
      __db.credit_cards.push({id:'card2', name:'SEGUNDO CARTAO', last4:'9999', user_id:'u1', created_at:'2026-01-02'});
      __db.card_invoices.push(
        {id:'inv2', card_id:'card2', period_start:'2026-10-01', period_end:'2026-10-31', due_on:'2026-11-07', total:90, min_payment:null, paid_on:null, paid_amount:null, user_id:'u1', created_at:'2026-01-02'},
        {id:'inv3', card_id:'card2', period_start:'2026-11-01', period_end:'2026-11-30', due_on:'2026-12-07', total:40, min_payment:null, paid_on:null, paid_amount:null, user_id:'u1', created_at:'2026-01-03'});
      __db.transactions.push(
        {id:'c2a', type:'expense', amount:50, description:'COMPRA A', category_id:null, occurred_on:'2026-10-10', card_invoice_id:'inv2', user_id:'u1', created_at:'c'},
        {id:'c2b', type:'expense', amount:40, description:'COMPRA B', category_id:null, occurred_on:'2026-10-11', card_invoice_id:'inv2', user_id:'u1', created_at:'c'},
        {id:'c2c', type:'expense', amount:40, description:'COMPRA C', category_id:null, occurred_on:'2026-11-11', card_invoice_id:'inv3', user_id:'u1', created_at:'c'});
      window.dispatchEvent(new Event('online'));
    """)
    page.wait_for_timeout(700)
    page.click('[data-tab=cards]')
    check(page.locator('#cards-list details').count() == 2, 'dois cartões na lista')
    msgs = []
    on_dialog = lambda d: (msgs.append(d.message), d.accept())
    page.on('dialog', on_dialog)
    page.locator('#cards-list details').nth(1).locator('summary').click()
    page.locator('#cards-list details').nth(1).locator('.cat-list button').first.click()
    page.wait_for_selector('#invoice-sheet[open]')
    check(page.is_visible('#invoice-delete'), 'folha da fatura tem o botão Excluir fatura')
    page.click('#invoice-delete'); page.wait_for_timeout(600)
    check(msgs and '1 compra dela' in msgs[-1] and '07/12/2026' in msgs[-1], 'confirmação cita vencimento e compras (a fatura mais nova vem primeiro): %s' % (msgs[-1:] ,))
    ids = lambda t: [r['id'] for r in page.evaluate('__db.' + t)]
    check('inv3' not in ids('card_invoices') and 'inv2' in ids('card_invoices'), 'excluiu só a fatura escolhida')
    check('c2c' not in ids('transactions') and 'c2a' in ids('transactions') and 'c2b' in ids('transactions'), 'compras da fatura saíram junto, as outras ficam')
    check(not page.evaluate("document.getElementById('invoice-sheet').open"), 'folha fecha depois de excluir a fatura')
    page.locator('#cards-list details').nth(1).evaluate('d => d.open = true')
    page.locator('#cards-list details').nth(1).get_by_text('Excluir cartão').click(); page.wait_for_timeout(600)
    check('1 fatura' in msgs[-1] and '2 compras' in msgs[-1] and '9999' in msgs[-1], 'confirmação do cartão cita faturas e compras: %s' % msgs[-1])
    check('card2' not in ids('credit_cards') and 'card1' in ids('credit_cards'), 'cartão excluído, o outro fica')
    check('inv2' not in ids('card_invoices') and 'c2a' not in ids('transactions') and 'c2b' not in ids('transactions') and 'cardtx1' in ids('transactions'), 'faturas e compras do cartão saíram; o resto fica')
    check(page.locator('#cards-list details').count() == 1 and 'SEGUNDO' not in page.inner_text('#cards-list'), 'lista mostra só o cartão que sobrou')
    page.remove_listener('dialog', on_dialog)
    page.click('[data-tab=summary]')
    # regras de categoria
    go_settings(page)
    page.fill('#rule-pattern', 'a'); page.click('#rule-add')
    check('pelo menos' in page.inner_text('#rules-error'), 'regra curta demais é recusada')
    page.fill('#rule-pattern', 'Padaria São João'); page.select_option('#rule-category', 'cat-mercado'); page.click('#rule-add'); page.wait_for_timeout(400)
    check(page.locator('#rules-list li').count() == 1 and 'padaria sao joao' in page.inner_text('#rules-list'), 'regra criada e normalizada')
    page.fill('#rule-pattern', 'padaria  sao joao'); page.click('#rule-add'); page.wait_for_timeout(300)
    check(page.locator('#rules-list li').count() == 1, 'não duplica a mesma regra: ' + page.inner_text('#rules-error'))
    fab(page); page.fill('#tx-desc', 'PADARIA SAO JOAO LTDA'); page.wait_for_timeout(150)
    check(page.input_value('#tx-category') == 'cat-mercado', 'regra sugere categoria ao digitar')
    page.click('#tx-cancel')
    # importação classificada por regra
    ofx = ('<OFX><BANKTRANLIST>'
           '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-18.50<FITID>R1<MEMO>PADARIA SAO JOAO 0042</STMTTRN>'
           '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-30.00<FITID>R2<MEMO>LOJA SEM REGRA</STMTTRN>'
           '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008<TRNAMT>-77.70<FITID>R3<MEMO>OUTRO NOME NO OFX</STMTTRN>'
           '</BANKTRANLIST></OFX>')
    page.evaluate("__db.transactions.push({id:'csv1',type:'expense',amount:77.7,description:'Nome no CSV',category_id:null,occurred_on:'2026-10-08',created_at:'a',external_id:'csv:zzz:1',user_id:'u1'})")
    go_settings(page); page.click('#import-open'); page.wait_for_selector('#import-sheet[open]')
    page.set_input_files('#import-file', files=[{'name': 'e.ofx', 'mimeType': 'application/x-ofx', 'buffer': ofx.encode()}])
    page.wait_for_selector('#import-list li'); page.wait_for_timeout(300)
    check(page.locator('#import-list select').first.input_value() == 'cat-mercado', 'importação aplica a regra')
    check('por regra' in page.locator('#import-list li').first.inner_text(), 'linha indica categoria por regra')
    check(page.locator('#import-list select').nth(1).input_value() == '', 'sem regra fica sem categoria')
    check(page.locator('#import-list li.dup').count() == 1 and 'outro arquivo' in page.locator('#import-list li.dup').inner_text(), 'mesmo lançamento do CSV é reconhecido no OFX')
    check('1 já importados' in page.inner_text('#import-summary'), 'resumo conta o repetido: ' + page.inner_text('#import-summary'))
    check(page.locator('#import-list li.dup input').is_disabled(), 'repetido não pode ser marcado')
    page.click('#import-cancel')
    # pagamento de fatura no extrato: reconhecido automaticamente, não dobra a despesa
    page.evaluate("""
      __db.card_invoices.push({id:'inv2', card_id:'card1', period_start:'2026-08-01', period_end:'2026-08-31', due_on:'2026-09-07', total:500, min_payment:100, paid_on:null, paid_amount:null, user_id:'u1', created_at:'2026-01-01'});
    """)
    fab(page); page.fill('#tx-amount', '1,00'); page.select_option('#tx-category', 'cat-mercado'); page.click('#tx-save'); page.wait_for_timeout(300)
    ofx2 = ('<OFX><BANKTRANLIST>'
            '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261009<TRNAMT>-500.00<FITID>P1<MEMO>PAGAMENTO CARTAO CREDITO</STMTTRN>'
            '</BANKTRANLIST></OFX>')
    go_settings(page); page.click('#import-open'); page.wait_for_selector('#import-sheet[open]')
    page.set_input_files('#import-file', files=[{'name': 'p.ofx', 'mimeType': 'application/x-ofx', 'buffer': ofx2.encode()}])
    page.wait_for_selector('#import-list li'); page.wait_for_timeout(300)
    check('Pagamento da fatura' in page.inner_text('#import-list'), 'pagamento de fatura é identificado no extrato')
    check(not page.locator('#import-list li input[type=checkbox]').first.is_checked(), 'pagamento de fatura some desmarcado por padrão')
    check(not page.is_disabled('#import-submit'), 'botão de importar fica habilitado mesmo só com a fatura a marcar')
    page.click('#import-submit'); page.wait_for_timeout(400)
    check(page.evaluate("__db.card_invoices.find(i => i.id === 'inv2').paid_on") == '2026-10-09', 'fatura marcada como paga pelo pagamento do extrato')
    check(page.evaluate("__db.transactions.filter(t => t.external_id === 'ofx:P1').length") == 0, 'pagamento da fatura não virou despesa duplicada')
    # limpeza de duplicados já salvos
    page.evaluate("__db.transactions.push({id:'ofx1',type:'expense',amount:77.7,description:'Nome no OFX',category_id:null,occurred_on:'2026-10-08',created_at:'b',external_id:'ofx:QQ',user_id:'u1'})")
    page.once('dialog', lambda d: d.accept())
    go_settings(page); page.click('#dedupe-run'); page.wait_for_timeout(500)
    left = page.evaluate("__db.transactions.filter(t => t.occurred_on === '2026-10-08' && t.amount === 77.7).length")
    check(left == 1, 'limpeza deixou um de cada (sobraram %d)' % left)
    # aplicar regras aos já lançados
    page.evaluate("__db.transactions.push({id:'x1',type:'expense',amount:9,description:'Padaria Sao Joao',category_id:null,occurred_on:'2026-10-02',created_at:'z',external_id:null,user_id:'u1'})")
    go_settings(page); page.click('#rule-apply'); page.wait_for_timeout(500)
    check(page.evaluate("__db.transactions.find(t => t.id === 'x1').category_id") == 'cat-mercado', 'aplicar regras classifica lançamento sem categoria')
    page.click('#rules-list .remove'); page.wait_for_timeout(300)
    check(page.locator('#rules-list li').count() == 0, 'regra excluída')
    # alterar senha
    go_settings(page)
    page.click('#pw-open'); page.wait_for_selector('#pw-sheet[open]')
    check(page.locator('#pw-rules li').count() == 6, 'alterar senha mostra 6 requisitos')
    check(page.is_hidden('#pw-otp-row'), 'sem 2FA, o campo de código não aparece')
    page.fill('#pw-current', 'errada'); page.fill('#pw-new', 'Nova#Senha7'); page.fill('#pw-confirm', 'Nova#Senha7'); page.click('#pw-submit'); page.wait_for_timeout(200)
    check('atual incorreta' in page.inner_text('#pw-error'), 'senha atual errada: ' + page.inner_text('#pw-error'))
    page.fill('#pw-current', 'Senha#Atual1'); page.fill('#pw-new', 'fraca'); page.fill('#pw-confirm', 'fraca'); page.click('#pw-submit')
    check('requisitos' in page.inner_text('#pw-error'), 'nova senha fraca recusada')
    page.fill('#pw-new', 'Nova#Senha7'); page.fill('#pw-confirm', 'Nova#Senha8'); page.click('#pw-submit')
    check('não são iguais' in page.inner_text('#pw-error'), 'confirmação diferente recusada')
    page.fill('#pw-new', 'Senha#Atual1'); page.fill('#pw-confirm', 'Senha#Atual1'); page.click('#pw-submit')
    check('diferente da atual' in page.inner_text('#pw-error'), 'nova igual à atual recusada')
    page.fill('#pw-new', 'Nova#Senha7'); page.fill('#pw-confirm', 'Nova#Senha7'); page.click('#pw-submit'); page.wait_for_timeout(300)
    check(not page.evaluate("document.getElementById('pw-sheet').open"), 'senha alterada fecha a folha')
    check(page.evaluate('__lastUpdate') == {'password': 'Nova#Senha7', 'current_password': 'Senha#Atual1'}, 'envia senha nova e atual ao Supabase')
    # 2FA
    check(page.is_visible('#mfa-enable'), 'botão ativar 2FA visível')
    page.click('#mfa-enable'); page.wait_for_selector('#mfa-sheet[open]')
    page.fill('#mfa-enroll-code', '000000'); page.click('#mfa-enroll-submit'); page.wait_for_timeout(300)
    check(page.is_visible('#mfa-enroll-error'), 'código errado mostra erro: ' + page.inner_text('#mfa-enroll-error'))
    page.fill('#mfa-enroll-code', '123456'); page.click('#mfa-enroll-submit'); page.wait_for_timeout(500)
    check(page.is_visible('#mfa-disable'), '2FA ativado')
    # alterar senha com 2FA ativo: pede o código
    page.click('#pw-open'); page.wait_for_selector('#pw-sheet[open]')
    check(page.is_visible('#pw-otp-row'), 'com 2FA ativo, alterar senha pede o código')
    page.fill('#pw-current', 'Senha#Atual1'); page.fill('#pw-new', 'Outra#Senha5'); page.fill('#pw-confirm', 'Outra#Senha5'); page.click('#pw-submit')
    check('6 dígitos' in page.inner_text('#pw-error'), 'sem código é recusado: ' + page.inner_text('#pw-error'))
    page.fill('#pw-otp', '000000'); page.click('#pw-submit'); page.wait_for_timeout(300)
    check('Código incorreto' in page.inner_text('#pw-error'), 'código errado é recusado: ' + page.inner_text('#pw-error'))
    page.evaluate('window.__lastUpdate = null')
    page.fill('#pw-otp', '123456'); page.click('#pw-submit'); page.wait_for_timeout(300)
    check(page.evaluate('__lastUpdate') == {'password': 'Outra#Senha5', 'current_password': 'Senha#Atual1'}, 'com código certo a senha é alterada')
    check(not page.evaluate("document.getElementById('pw-sheet').open"), 'folha fecha depois da troca com 2FA')
    page.screenshot(path='/tmp/caixa-ajustes.png', full_page=True)
    page.click('[data-tab=summary]'); page.screenshot(path='/tmp/caixa-resumo.png', full_page=True)
    # atalho
    page.goto('http://127.0.0.1:8124/index.html?novo=receita'); page.wait_for_selector('#sheet[open]', timeout=5000)
    check(page.is_checked('#type-income'), 'atalho abre receita')
    check(page.url.endswith('index.html'), 'URL limpa depois do atalho')
    # cadastro: validação de senha
    ctx2 = b.new_context(viewport={'width': 390, 'height': 800}, service_workers='block')
    p2 = ctx2.new_page()
    p2.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    p2.on('console', lambda m: m.type == 'error' and problems.append('console: ' + m.text))
    p2.add_init_script('window.__noSession = true')
    p2.route('**/vendor/supabase-js-*.js', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    p2.goto('http://127.0.0.1:8124/index.html'); p2.wait_for_selector('#auth:not([hidden])')
    check(p2.is_hidden('#auth-confirm-row') and p2.is_hidden('#password-rules'), 'login não mostra confirmação nem requisitos')
    p2.click('#auth-toggle')
    check(p2.is_visible('#auth-confirm-row') and p2.locator('#password-rules li').count() == 6, 'cadastro mostra confirmação e 6 requisitos')
    p2.fill('#auth-email', 'novo@exemplo.com'); p2.fill('#auth-password', 'abc')
    check(p2.locator('#password-rules li.ok').count() == 1, 'senha fraca: só minúscula atendida')
    p2.fill('#auth-confirm', 'abc'); p2.click('#auth-submit')
    check('requisitos' in p2.inner_text('#auth-error'), 'senha fraca é recusada: ' + p2.inner_text('#auth-error'))
    p2.fill('#auth-password', 'Senha#Forte9'); p2.fill('#auth-confirm', 'Senha#Forte8'); p2.click('#auth-submit')
    check('não são iguais' in p2.inner_text('#auth-error'), 'senhas diferentes: ' + p2.inner_text('#auth-error'))
    p2.fill('#auth-confirm', 'Senha#Forte9')
    check(p2.locator('#password-rules li.ok').count() == 6, 'todos os requisitos atendidos')
    p2.check('#auth-show'); check(p2.get_attribute('#auth-password', 'type') == 'text', 'mostrar senha')
    p2.click('#auth-submit'); p2.wait_for_timeout(300)
    check(p2.is_hidden('#auth-error') and p2.is_hidden('#auth-confirm-row'), 'cadastro aceito volta ao login')
    p2.fill('#auth-email', 'errado'); p2.fill('#auth-password', 'x'); p2.click('#auth-submit')
    check('e-mail válido' in p2.inner_text('#auth-error'), 'e-mail inválido é recusado')
    # casal: dois usuários, lançamentos compartilhados e acerto de contas
    mon = today.strftime('%Y-%m')
    seed = {
        'household_members': [
            {'household_id': 'h1', 'user_id': 'u1', 'display_name': 'Ana'},
            {'household_id': 'h1', 'user_id': 'u2', 'display_name': 'Beto'}],
        'household_invites': [], 'household_settlements': [],
        'categories': [
            {'id': 'cat-mercado', 'user_id': 'u1', 'name': 'Mercado', 'type': 'expense'},
            {'id': 'cat-casa', 'user_id': 'u2', 'name': 'Contas da casa', 'type': 'expense'}],
        'transactions': [
            {'id': 't-mine', 'user_id': 'u1', 'type': 'expense', 'amount': 100, 'description': 'Água', 'occurred_on': mon + '-01', 'category_id': 'cat-mercado', 'household_id': 'h1', 'payer_share': 50, 'created_at': '2026-01-01'},
            {'id': 't-priv', 'user_id': 'u1', 'type': 'expense', 'amount': 30, 'description': 'Privado', 'occurred_on': mon + '-02', 'category_id': None, 'household_id': None, 'payer_share': None, 'created_at': '2026-01-01'},
            {'id': 't-partner', 'user_id': 'u2', 'type': 'expense', 'amount': 150, 'description': 'Luz', 'occurred_on': mon + '-03', 'category_id': 'cat-casa', 'household_id': 'h1', 'payer_share': 50, 'created_at': '2026-01-01'}],
    }
    ctx3 = b.new_context(viewport={'width': 390, 'height': 800}, service_workers='block')
    p3 = ctx3.new_page()
    p3.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    p3.on('console', lambda m: m.type == 'error' and problems.append('console: ' + m.text))
    p3.add_init_script('window.__seed = ' + json.dumps(seed))
    p3.route('**/vendor/supabase-js-*.js', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    p3.goto('http://127.0.0.1:8124/index.html'); p3.wait_for_selector('#app:not([hidden])'); p3.wait_for_timeout(500)
    check(p3.is_visible('#household-panel'), 'painel do casal aparece no Resumo')
    check('Você deve R$ 25,00 a Beto' in p3.inner_text('#household-balance').replace('\xa0', ' '), 'saldo: ' + p3.inner_text('#household-balance').replace('\xa0', ' '))
    check(p3.is_visible('#household-settle'), 'botão acertar contas aparece para quem deve')
    check('Luz' in p3.inner_text('#household-list').replace('\xa0', ' ') and 'Água' in p3.inner_text('#household-list').replace('\xa0', ' ') and 'Privado' not in p3.inner_text('#household-list').replace('\xa0', ' '), 'lista do casal tem só os compartilhados')
    check('Beto pagou R$ 150,00' in p3.inner_text('#household-list').replace('\xa0', ' '), 'mostra quem pagou')
    check('130,00' in p3.inner_text('#total-expense'), 'resumo pessoal não mistura o gasto do parceiro: ' + p3.inner_text('#total-expense'))
    p3.click('[data-tab=list]'); p3.wait_for_timeout(200)
    p3.click('[data-tab=summary]')
    # acertar contas
    p3.click('#household-settle'); p3.wait_for_selector('#settle-sheet[open]')
    check(p3.input_value('#settle-amount') == '25,00', 'acerto vem preenchido com a dívida')
    p3.click('#settle-save'); p3.wait_for_timeout(500)
    check(len(p3.evaluate('__db.household_settlements')) == 1, 'acerto registrado')
    check('Tudo acertado' in p3.inner_text('#household-balance').replace('\xa0', ' '), 'saldo zera depois do acerto: ' + p3.inner_text('#household-balance').replace('\xa0', ' '))
    check(p3.is_hidden('#household-settle'), 'botão some sem dívida')
    # novo lançamento compartilhado 60/40
    fab(p3); p3.fill('#tx-amount', '200,00'); p3.fill('#tx-desc', 'Internet')
    check(p3.is_visible('#tx-share-box'), 'opção compartilhar aparece em despesa')
    check('Beto' in p3.inner_text('#tx-share-label'), 'compartilhar com o nome do parceiro')
    p3.check('#tx-share'); p3.select_option('#tx-split', '60')
    check('Beto deve R$ 80,00 a você' in p3.inner_text('#tx-split-hint').replace('\xa0', ' '), 'dica mostra quanto o parceiro deve: ' + p3.inner_text('#tx-split-hint').replace('\xa0', ' '))
    p3.click('label[for=type-income]'); check(p3.is_hidden('#tx-share-box'), 'receita não pode ser compartilhada')
    p3.click('label[for=type-expense]'); check(p3.is_visible('#tx-share-box'), 'voltar pra despesa mostra de novo')
    p3.click('#tx-save'); p3.wait_for_timeout(500)
    check('Beto deve R$ 80,00 a você' in p3.inner_text('#toast').replace('\xa0', ' '), 'aviso depois de salvar cobra o parceiro: ' + p3.inner_text('#toast').replace('\xa0', ' '))
    net = [t for t in p3.evaluate('__db.transactions') if t.get('description') == 'Internet']
    check(len(net) == 1 and net[0]['household_id'] == 'h1' and net[0]['payer_share'] == 60, 'lançamento salvo como compartilhado 60/40: %s' % net)
    p3.click('[data-tab=summary]')
    check('Beto deve R$ 80,00 a você' in p3.inner_text('#household-balance').replace('\xa0', ' '), 'saldo depois do novo lançamento: ' + p3.inner_text('#household-balance').replace('\xa0', ' '))
    # filtro do Resumo: Tudo | Do casal | Só meus
    nb = lambda sel: p3.inner_text(sel).replace('\xa0', ' ')
    check(p3.is_visible('#scope-filter'), 'seletor do Resumo aparece com casal completo')
    check(nb('#total-expense') == 'R$ 330,00', 'Tudo: despesas do mês = 330 (privado + compartilhado que paguei): ' + nb('#total-expense'))
    p3.click('label[for=scope-casal]'); p3.wait_for_timeout(200)
    check('Gastos do casal' in nb('#balance-caption') and nb('#balance-value') == 'R$ 450,00', 'Do casal: total da casa 450: ' + nb('#balance-value'))
    check(nb('#total-income-label') == 'Você pagou' and nb('#total-income') == 'R$ 300,00' and 'Beto pagou' in nb('#total-expense-label') and nb('#total-expense') == 'R$ 150,00', 'Do casal: quem pagou quanto')
    check('Contas da casa' in nb('#breakdown') and 'Mercado' in nb('#breakdown'), 'Do casal: categorias dos dois no "Para onde foi o dinheiro"')
    check(p3.is_visible('#household-panel') and p3.is_hidden('#budget-progress'), 'Do casal: painel do casal visível e orçamento escondido')
    p3.click('label[for=scope-mine]'); p3.wait_for_timeout(200)
    check(nb('#total-expense') == 'R$ 30,00' and p3.is_hidden('#household-panel'), 'Só meus: só o privado (30) e sem painel do casal: ' + nb('#total-expense'))
    p3.click('label[for=scope-all]'); p3.wait_for_timeout(200)
    check(nb('#total-expense') == 'R$ 330,00' and 'Saldo do mês' == nb('#balance-caption') and p3.is_visible('#household-panel'), 'Tudo volta ao normal')
    p3.click('[data-tab=list]'); check('Casal 60/40' in p3.inner_text('#tx-groups'), 'lista mostra selo Casal 60/40')
    # lançamento privado continua privado
    fab(p3); p3.fill('#tx-amount', '10,00'); p3.click('#tx-save'); p3.wait_for_timeout(400)
    priv = [t for t in p3.evaluate('__db.transactions') if t.get('amount') == 10]
    check(len(priv) == 1 and priv[0].get('household_id') is None, 'sem marcar, o lançamento fica privado')
    # Ajustes → Casal
    go_settings(p3)
    check('Com Beto' in p3.inner_text('#household-hint'), 'Ajustes mostra o parceiro: ' + p3.inner_text('#household-hint'))
    check(p3.locator('#household-members li').count() == 2, 'lista os dois membros')
    check(p3.is_hidden('#household-invite'), 'sem convite quando o casal está completo')
    p3.once('dialog', lambda d: d.accept())
    p3.click('#household-leave'); p3.wait_for_timeout(500)
    check(p3.is_visible('#household-none') and p3.is_hidden('#household-have'), 'depois de sair, volta a opção de criar/entrar')
    check(all(t.get('household_id') is None for t in p3.evaluate('__db.transactions')), 'sair torna tudo privado')
    p3.click('[data-tab=summary]'); check(p3.is_hidden('#household-panel'), 'painel do casal some depois de sair')
    # criar casal e convite
    go_settings(p3)
    p3.click('#household-create'); p3.wait_for_selector('#household-sheet[open]')
    check(p3.is_hidden('#household-code-row'), 'criar não pede código')
    p3.fill('#household-name', 'Ana'); p3.click('#household-save'); p3.wait_for_timeout(500)
    check(p3.is_visible('#household-invite') and 'ABCD-2345' in p3.inner_text('#household-code'), 'mostra o código do convite: ' + p3.inner_text('#household-code'))
    check('Aguardando' in p3.inner_text('#household-hint'), 'aguardando o parceiro')
    p3.click('#household-newcode'); p3.wait_for_timeout(400)
    check('WXYZ-6789' in p3.inner_text('#household-code'), 'gera outro código')
    p3.once('dialog', lambda d: d.accept()); p3.click('#household-leave'); p3.wait_for_timeout(400)
    # entrar com código
    p3.click('#household-join'); p3.wait_for_selector('#household-sheet[open]')
    check(p3.is_visible('#household-code-row'), 'entrar pede o código')
    p3.fill('#household-name', 'Ana'); p3.fill('#household-code-input', 'abc'); p3.click('#household-save')
    check('Código inválido' in p3.inner_text('#household-error'), 'código curto é recusado: ' + p3.inner_text('#household-error'))
    p3.fill('#household-code-input', 'zzzzzzzz'); p3.click('#household-save'); p3.wait_for_timeout(300)
    check('Código inválido' in p3.inner_text('#household-error'), 'código errado é recusado pelo banco')
    p3.fill('#household-code-input', 'abcd-2345'); p3.click('#household-save'); p3.wait_for_timeout(500)
    check('Com Beto' in p3.inner_text('#household-hint'), 'entrou no casal com o código: ' + p3.inner_text('#household-hint'))
    p3.screenshot(path='/tmp/caixa-casal.png', full_page=True)
    # movimentações que não são gasto: pagamento de fatura, investimentos, transferências
    mon4 = today.strftime('%Y-%m')
    seed4 = {
        'categories': [{'id': 'cat-mercado', 'user_id': 'u1', 'name': 'Mercado', 'type': 'expense'}],
        'transactions': [
            {'id': 'm1', 'user_id': 'u1', 'type': 'expense', 'amount': 100, 'description': 'PADARIA', 'occurred_on': mon4 + '-01', 'category_id': None, 'created_at': 'a'},
            {'id': 'm2', 'user_id': 'u1', 'type': 'income', 'amount': 2000, 'description': 'SALARIO', 'occurred_on': mon4 + '-01', 'category_id': None, 'created_at': 'a'},
            {'id': 'm3', 'user_id': 'u1', 'type': 'expense', 'amount': 1500, 'description': 'PAGAMENTO CARTAO CREDITO BCE', 'occurred_on': mon4 + '-02', 'category_id': None, 'created_at': 'a', 'kind': 'card_payment'},
            {'id': 'm4', 'user_id': 'u1', 'type': 'income', 'amount': 700, 'description': 'RESGATE CDB/RDB', 'occurred_on': mon4 + '-02', 'category_id': None, 'created_at': 'a', 'kind': 'transfer'},
            {'id': 'm5', 'user_id': 'u1', 'type': 'expense', 'amount': 900, 'description': 'APLICACAO CDB/RDB', 'occurred_on': mon4 + '-03', 'category_id': None, 'created_at': 'a', 'kind': 'transfer'},
            # ainda sem marcar: a revisão deve sugerir
            {'id': 'm6', 'user_id': 'u1', 'type': 'expense', 'amount': 4000, 'description': 'APLICACAO CDB/RDB', 'occurred_on': mon4 + '-04', 'category_id': None, 'created_at': 'a'},
            {'id': 'm7', 'user_id': 'u1', 'type': 'income', 'amount': 3000, 'description': 'RESGATE CDB/RDB', 'occurred_on': mon4 + '-05', 'category_id': None, 'created_at': 'a'},
            {'id': 'm8', 'user_id': 'u1', 'type': 'expense', 'amount': 300, 'description': 'PIX ENVIADO Cintia de Souza 1', 'occurred_on': mon4 + '-06', 'category_id': None, 'created_at': 'a'},
            {'id': 'm9', 'user_id': 'u1', 'type': 'expense', 'amount': 200, 'description': 'PIX ENVIADO Cintia de Souza 2', 'occurred_on': mon4 + '-07', 'category_id': None, 'created_at': 'a'}],
    }
    ctx4 = b.new_context(viewport={'width': 390, 'height': 800}, service_workers='block')
    p4 = ctx4.new_page()
    p4.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    p4.on('console', lambda m: m.type == 'error' and problems.append('console: ' + m.text))
    p4.add_init_script('window.__seed = ' + json.dumps(seed4))
    p4.route('**/vendor/supabase-js-*.js', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    p4.goto('http://127.0.0.1:8124/index.html'); p4.wait_for_selector('#app:not([hidden])'); p4.wait_for_timeout(500)
    nb4 = lambda sel: p4.inner_text(sel).replace('\xa0', ' ')
    # antes da revisão: só m3, m4, m5 estão marcados; m6..m9 ainda contam
    check(nb4('#total-expense') == 'R$ 4.600,00' and nb4('#total-income') == 'R$ 5.000,00', 'Resumo ignora o que está marcado e conta o resto: ' + nb4('#total-expense') + ' / ' + nb4('#total-income'))
    check('Fora do resumo' in nb4('#moves-note') and 'fatura paga R$ 1.500,00' in nb4('#moves-note') and 'aplicado R$ 900,00' in nb4('#moves-note') and 'resgatado R$ 700,00' in nb4('#moves-note'), 'linha Fora do resumo: ' + nb4('#moves-note'))
    p4.click('[data-tab=list]'); p4.wait_for_timeout(200)
    p4.evaluate("document.getElementById('period-month').click()") if False else None
    # revisar movimentações
    go_settings(p4); p4.click('#moves-open'); p4.wait_for_selector('#moves-sheet[open]'); p4.wait_for_timeout(400)
    check(p4.locator('#moves-list li').count() == 2, 'revisão sugere 2 grupos (aplicação e resgate): %d' % p4.locator('#moves-list li').count())
    check('Transferência' in nb4('#moves-list') and 'R$ 4.000,00' in nb4('#moves-list'), 'grupos mostram tipo e total')
    check(p4.is_visible('#moves-impact') and 'R$ 4.600,00' in nb4('#moves-impact-list') and 'R$ 600,00' in nb4('#moves-impact-list'), 'prévia mostra antes e depois: ' + nb4('#moves-impact-list'))
    check(not p4.is_disabled('#moves-apply') and '2 lançamentos' in nb4('#moves-apply'), 'botão cita quantos serão marcados: ' + nb4('#moves-apply'))
    p4.locator('#moves-list li').nth(0).locator('input').uncheck(); p4.wait_for_timeout(100)
    check('1 lançamento' in nb4('#moves-apply'), 'desmarcar um grupo reduz a contagem: ' + nb4('#moves-apply'))
    p4.locator('#moves-list li').nth(0).locator('input').check()
    p4.click('#moves-apply'); p4.wait_for_timeout(600)
    kinds = {t['id']: t.get('kind') for t in p4.evaluate('__db.transactions')}
    check(kinds['m6'] == 'transfer' and kinds['m7'] == 'transfer' and kinds['m8'] is None, 'revisão grava kind só nos sugeridos: %s' % kinds)
    p4.click('[data-tab=summary]'); p4.wait_for_timeout(200)
    check(nb4('#total-expense') == 'R$ 600,00' and nb4('#total-income') == 'R$ 2.000,00', 'Resumo depois da revisão: ' + nb4('#total-expense') + ' / ' + nb4('#total-income'))
    check('aplicado R$ 4.900,00' in nb4('#moves-note') and 'resgatado R$ 3.700,00' in nb4('#moves-note'), 'linha atualizada: ' + nb4('#moves-note'))
    # lista: selo e totais do período sem as movimentações
    p4.click('[data-tab=list]'); p4.click('label[for=period-month]'); p4.wait_for_timeout(300)
    check('Pagamento de fatura' in nb4('#tx-groups') and p4.locator('#tx-groups .tx.neutral').count() >= 3, 'lista marca movimentações como neutras')
    check('R$ 600,00' in nb4('#period-totals') and 'R$ 2.000,00' in nb4('#period-totals'), 'totais da lista ignoram movimentações: ' + nb4('#period-totals'))
    # formulário: detecção ao digitar, hint e marcar os parecidos
    fab(p4); p4.fill('#tx-amount', '50,00'); p4.fill('#tx-desc', 'PAGAMENTO CARTAO CREDITO ABC')
    check(p4.input_value('#tx-kind') == 'card_payment' and 'fora' not in '' and 'não conta' in nb4('#tx-kind-hint'), 'descrição de fatura já sugere o tipo: ' + p4.input_value('#tx-kind'))
    p4.select_option('#tx-kind', ''); p4.fill('#tx-desc', 'PIX ENVIADO Cintia de Souza 3')
    check(p4.input_value('#tx-kind') == '', 'mudar o tipo à mão não é sobrescrito pela detecção')
    p4.select_option('#tx-kind', 'transfer')
    msgs4 = []
    p4.once('dialog', lambda d: (msgs4.append(d.message), d.accept()))
    p4.click('#tx-save'); p4.wait_for_timeout(700)
    kinds = {t['id']: t.get('kind') for t in p4.evaluate('__db.transactions')}
    check(msgs4 and '2 lançamentos parecidos' in msgs4[-1], 'oferece marcar os parecidos: %s' % msgs4[-1:])
    check(kinds['m8'] == 'transfer' and kinds['m9'] == 'transfer', 'parecidos marcados como transferência: %s' % kinds)
    # importação: pagamento sem fatura correspondente e investimento entram como movimentação
    ofx4 = ('<OFX><BANKTRANLIST>'
            '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>' + today.strftime('%Y%m') + '10<TRNAMT>-300.00<FITID>K1<MEMO>PAGAMENTO CARTAO CREDITO BCE</STMTTRN>'
            '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>' + today.strftime('%Y%m') + '11<TRNAMT>-45.00<FITID>K2<MEMO>MERCADINHO BOM</STMTTRN>'
            '</BANKTRANLIST></OFX>')
    go_settings(p4); p4.click('#import-open'); p4.wait_for_selector('#import-sheet[open]')
    p4.set_input_files('#import-file', files=[{'name': 'k.ofx', 'mimeType': 'application/x-ofx', 'buffer': ofx4.encode()}])
    p4.wait_for_selector('#import-list li'); p4.wait_for_timeout(300)
    check('fica fora do resumo' in nb4('#import-list li:first-child') or 'fica fora do resumo' in nb4('#import-list'), 'prévia avisa que o pagamento fica fora do resumo')
    check('despesas R$ 45,00' in nb4('#import-totals'), 'totais da prévia ignoram o pagamento: ' + nb4('#import-totals'))
    p4.click('#import-submit'); p4.wait_for_timeout(700)
    imp = {t.get('external_id'): t for t in p4.evaluate('__db.transactions') if t.get('external_id')}
    pay = [t for t in imp.values() if 'PAGAMENTO CARTAO' in (t.get('description') or '')]
    buy = [t for t in imp.values() if 'MERCADINHO' in (t.get('description') or '')]
    check(len(pay) == 1 and pay[0].get('kind') == 'card_payment' and len(buy) == 1 and buy[0].get('kind') is None, 'importação grava kind só no pagamento: %s / %s' % (pay, buy))
    # exportação CSV leva a coluna Movimento
    with p4.expect_download() as dl:
        p4.click('#export-all')
    csv4 = open(dl.value.path(), encoding='utf-8').read()
    check('Movimento' in csv4.splitlines()[0] and 'Pagamento de fatura' in csv4, 'CSV exportado tem a coluna Movimento')
    # PDF: o pdf.js (vendor/) carrega sob a CSP, lê o texto e o app responde que não conhece o layout
    go_settings(p4); p4.click('#import-open'); p4.wait_for_selector('#import-sheet[open]')
    p4.set_input_files('#import-file', files=[{'name': 'x.pdf', 'mimeType': 'application/pdf', 'buffer': tiny_pdf('EXTRATO DE TESTE 123')}])
    p4.wait_for_selector('#import-error:not([hidden])', timeout=15000)
    check('Não reconheci o layout' in nb4('#import-error'), 'PDF lido pelo pdf.js: ' + nb4('#import-error'))
    b.close()
print('\nPROBLEMAS:' if problems else '\nTudo certo'); [print(' -', x) for x in problems]
sys.exit(1 if problems else 0)
