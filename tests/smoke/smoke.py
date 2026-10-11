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
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 800}, accept_downloads=True, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and problems.append('console: ' + m.text))
    page.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    page.goto('http://127.0.0.1:8124/index.html')
    page.wait_for_selector('#app:not([hidden])')
    page.wait_for_timeout(500)
    today = datetime.date.today()
    # transação
    page.click('#fab'); page.fill('#tx-amount', '80,00'); page.select_option('#tx-category', 'cat-mercado'); page.fill('#tx-desc', 'Mercado Central'); page.click('#tx-save')
    page.wait_for_timeout(500)
    check(len(page.evaluate('__db.transactions')) == 1, 'lançamento salvo')
    page.click('#fab')
    check(page.is_visible('#tx-repeat'), 'botão repetir visível: ' + page.inner_text('#tx-repeat'))
    page.fill('#tx-desc', 'Mercado Central 77')
    check(page.input_value('#tx-category') == 'cat-mercado', 'categoria sugerida pela descrição')
    check(page.is_visible('#tx-hint'), 'dica de categoria visível')
    page.click('#tx-repeat'); page.click('#tx-save'); page.wait_for_timeout(400)
    check(len(page.evaluate('__db.transactions')) == 2, 'repetir último salvou')
    # orçamento
    page.click('[data-tab=categories]')
    page.click('#budget-add'); page.fill('#bud-amount', '100'); page.click('#bud-save'); page.wait_for_timeout(400)
    page.click('[data-tab=summary]')
    check('Orçamento do mês' in page.inner_text('#budget-progress'), 'orçamento no resumo')
    print('   ', page.inner_text('#budget-list').replace('\n', ' | '))
    check(page.locator('#budget-list li.over').count() == 1, '160 de 100 = estourou')
    # conta
    page.click('[data-tab=categories]')
    page.click('#bill-add'); page.fill('#bill-amount', '150'); page.fill('#bill-desc', 'Luz'); page.click('#bill-save'); page.wait_for_timeout(400)
    page.click('[data-tab=summary]')
    check('vence hoje' in page.inner_text('#bills-due'), 'conta vence hoje no resumo')
    page.click('#bills-due-list button'); page.wait_for_timeout(500)
    check(page.locator('#bills-due').is_hidden(), 'conta paga saiu da lista')
    check(len(page.evaluate('__db.transactions')) == 3, 'pagamento virou despesa')
    # recorrência
    page.click('[data-tab=categories]')
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
    check(j['app'] == 'Caixa' and len(j['data']['transactions']) == 4, 'backup JSON com %d lançamentos' % len(j['data']['transactions']))
    # 2FA
    check(page.is_visible('#mfa-enable'), 'botão ativar 2FA visível')
    page.click('#mfa-enable'); page.wait_for_selector('#mfa-sheet[open]')
    page.fill('#mfa-enroll-code', '000000'); page.click('#mfa-enroll-submit'); page.wait_for_timeout(300)
    check(page.is_visible('#mfa-enroll-error'), 'código errado mostra erro: ' + page.inner_text('#mfa-enroll-error'))
    page.fill('#mfa-enroll-code', '123456'); page.click('#mfa-enroll-submit'); page.wait_for_timeout(500)
    check(page.is_visible('#mfa-disable'), '2FA ativado')
    page.screenshot(path='/tmp/caixa-ajustes.png', full_page=True)
    page.click('[data-tab=summary]'); page.screenshot(path='/tmp/caixa-resumo.png', full_page=True)
    # atalho
    page.goto('http://127.0.0.1:8124/index.html?novo=receita'); page.wait_for_selector('#sheet[open]', timeout=5000)
    check(page.is_checked('#type-income'), 'atalho abre receita')
    check(page.url.endswith('index.html'), 'URL limpa depois do atalho')
    b.close()
print('\nPROBLEMAS:' if problems else '\nTudo certo'); [print(' -', x) for x in problems]
