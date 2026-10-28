"""Machine-count UX regression checks against the built portable HTML.

Uses an isolated browser document, not URL navigation. This tests the real
local simulator/UI, not server EventSource, installation, or Service Workers.
Run after npm run build. HTTP/SSE configuration is tested independently in Node.
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
REPORT = {'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'mode': 'embedded',
          'checks': [], 'page_errors': [], 'viewport_checks': [], 'success': False}


def check(name, passed):
    REPORT['checks'].append({'name': name, 'passed': bool(passed)})
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    assert passed, name


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),
                                    headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 844}, locale='zh-TW', timezone_id='Asia/Taipei')
        page.on('pageerror', lambda e: REPORT['page_errors'].append(str(e)))
        page.set_content((OUT / 'preview.html').read_text(), wait_until='domcontentloaded')
        page.wait_for_selector('.machine-card')

        def settled(count):
            page.wait_for_function("n => document.querySelector('#machine-count').textContent === `共 ${n} 台` && !document.querySelector('#demo-count').disabled", arg=count)

        def choose(count):
            page.locator(f'[data-demo-count="{count}"]').click()
            settled(count)

        check('Machine-count controls are visible without opening settings',
              page.locator('.machine-count-options').is_visible() and
              page.locator('[data-demo-count]').count() == 4)
        for count in [12, 30, 60, 3]:
            choose(count)
            check(f'One click applies {count} machines and marks the selected button',
                  page.locator(f'[data-demo-count="{count}"]').get_attribute('aria-pressed') == 'true' and
                  page.locator('.machine-card').count() == min(count, 12))
        choose(30)
        check('Total, visible, and remaining counts are unambiguous',
              page.locator('#machine-visibility').inner_text() == '共 30 台 · 已顯示 12 台 · 尚有 18 台')
        page.locator('#show-all-machines').click()
        check('Show-all renders all 30 actual machine cards including MC-030',
              page.locator('.machine-card').count() == 30 and page.locator('[data-machine-id="MC-030"]').count() == 1)
        check('Full display reports 30 shown and hides the show-all action',
              page.locator('#machine-visibility').inner_text() == '共 30 台 · 已顯示 30 台' and
              not page.locator('#show-all-machines').is_visible())
        page.locator('#collapse-machines').click()
        check('Collapse returns to 12 cards and keeps the top controls in view',
              page.locator('.machine-card').count() == 12 and
              0 <= page.locator('#machine-demo-bar').bounding_box()['y'] < 120)
        choose(3)
        page.select_option('#status-filter', 'idle')
        page.fill('#machine-search', 'MC-003')
        check('Filters have a visible clear action', page.locator('#clear-machine-filters').is_visible())
        choose(12)
        check('Changing the count clears both search and status filters',
              page.locator('#machine-search').input_value() == '' and
              page.locator('#status-filter').input_value() == 'all' and
              page.locator('.machine-card').count() == 12)
        page.locator('.bottom-nav [data-view="history"]').click()
        page.locator('.bottom-nav [data-open-settings]').click()
        page.select_option('#demo-count', '30')
        settled(30)
        check('Selecting a count in settings applies immediately without Submit',
              page.locator('#settings-dialog').is_visible() and
              '已套用 30 台' in page.locator('#settings-count-status').inner_text())
        check('Scenario selector also contains newly created machines',
              page.locator('#scenario-machine option[value="MC-030"]').count() == 1)
        page.locator('#view-configured-machines').click()
        page.wait_for_function("!document.querySelector('#settings-dialog').open && document.body.dataset.view === 'machines'")
        check('View-updated-machines closes settings and leaves history for the machine list',
              page.locator('#machine-section').is_visible() and page.locator('#page-title').inner_text() == '所有機台')
        page.evaluate("document.querySelector('#toasts').replaceChildren(); scrollTo(0,0)")
        page.screenshot(path=str(OUT / 'count-controls-mobile.png'))
        page.locator('.bottom-nav [data-open-settings]').click()
        page.eval_on_selector('#demo-count', "el => { el.add(new Option('invalid test value', '99')); el.value='99'; el.dispatchEvent(new Event('change', {bubbles:true})); }")
        page.wait_for_function("document.querySelector('#settings-count-status').classList.contains('failed')")
        check('Rejected settings restore the selected value and preserve the previous count',
              page.locator('#demo-count').input_value() == '30' and
              page.locator('#machine-count').inner_text() == '共 30 台' and
              not page.locator('#demo-count').is_disabled())
        page.select_option('#demo-count', '12')
        settled(12)
        check('A failed configuration can be retried successfully',
              '已套用 12 台' in page.locator('#settings-count-status').inner_text() and
              'failed' not in page.locator('#settings-count-status').get_attribute('class'))
        page.select_option('#demo-interval', '1000')
        page.locator('#settings-form [type=submit]').click()
        page.wait_for_function("!document.querySelector('#settings-dialog').open")
        choose(60)
        page.locator('#show-all-machines').click()
        before = page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text()
        page.wait_for_timeout(1400)
        check('All 60 cards stay visible across a live update',
              page.locator('.machine-card').count() == 60 and
              page.locator('[data-machine-id="MC-060"]').count() == 1 and
              before != page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text())
        for width in [320, 360, 375, 390, 430, 768, 1024, 1440]:
            page.set_viewport_size({'width': width, 'height': 900})
            page.wait_for_timeout(120)
            actual = page.evaluate('document.documentElement.scrollWidth')
            REPORT['viewport_checks'].append({'width': width, 'scrollWidth': actual})
            check(f'All-60-machine layout has no horizontal overflow at {width}px', actual <= width)
        choose(30)
        page.evaluate("document.querySelector('#toasts').replaceChildren(); scrollTo(0,0)")
        page.screenshot(path=str(OUT / 'count-controls-desktop.png'))
        page.locator('#show-all-machines').click()
        page.screenshot(path=str(OUT / 'count-all-30-desktop.png'), full_page=True)
        choose(3)
        check('Returning to 3 removes obsolete cards and updates the scenario selector',
              page.locator('.machine-card').count() == 3 and
              page.locator('#scenario-machine option').count() == 3)
        check('No uncaught JavaScript errors during count-switch regression checks', not REPORT['page_errors'])
        REPORT['success'] = True
        browser.close()
except Exception as e:
    REPORT['error'] = str(e)
    raise
finally:
    (OUT / 'count-switch-tests.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
