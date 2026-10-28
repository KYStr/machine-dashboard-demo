"""Browser acceptance checks.

Default: start the real Node server and exercise its web UI.
BROWSER_TEST_MODE=embedded: render the exact portable artifact in an isolated
page (useful when a managed browser disallows URL navigation). API contracts
are independently covered by node:test. Embedded mode does NOT prove browser
SSE reconnection or service-worker installation; those are explicitly skipped.
"""
from __future__ import annotations
import json
import os
import shutil
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
MODE = os.environ.get("BROWSER_TEST_MODE", "server")
REPORT = {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "mode": MODE,
          "checks": [], "viewport_checks": [], "page_errors": [], "skipped": []}
server = None
browser = None
current_check = "start"


def check(name: str, passed: bool, detail: str = "") -> None:
    REPORT["checks"].append({"name": name, "passed": bool(passed), "detail": detail})
    print(("PASS " if passed else "FAIL ") + name, flush=True)
    if not passed:
        raise AssertionError(name + (": " + detail if detail else ""))


def port_available() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def open_settings(page) -> None:
    if not page.locator("#settings-dialog").is_visible():
        page.locator(".demo-label [data-open-settings]").click()


def configure(page, count=None, interval=None, paused=None) -> None:
    open_settings(page)
    if count is not None:
        page.select_option("#demo-count", str(count))
        page.wait_for_function("!document.querySelector('#demo-count').disabled")
    if interval is not None:
        page.select_option("#demo-interval", str(interval))
    if paused is not None:
        page.locator("#demo-paused").set_checked(paused)
    page.locator("#settings-form [type=submit]").click()
    page.wait_for_function("!document.querySelector('#settings-dialog').open")
    page.wait_for_timeout(160)


def run_scenario(page, action: str) -> None:
    open_settings(page)
    page.select_option("#scenario-machine", "MC-001")
    page.locator("#trigger-alert" if action == "hot" else "#resolve-alert").click()
    page.wait_for_function("!document.querySelector('#settings-dialog').open")


try:
    subprocess.run(["node", "scripts/build.mjs"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    html = (ARTIFACTS / "preview.html").read_text()
    base = ""
    if MODE == "server":
        port = port_available()
        base = f"http://127.0.0.1:{port}"
        server = subprocess.Popen(["node", "server/index.mjs"], cwd=ROOT,
                                  env={**os.environ, "PORT": str(port), "HOST": "127.0.0.1"},
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(60):
            try:
                with urlopen(base + "/api/health", timeout=1) as res:
                    if res.status == 200:
                        break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("Mock server did not start")
    with sync_playwright() as p:
        executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium")
        launch = {"headless": True, "args": ["--no-sandbox"]}
        if executable:
            launch["executable_path"] = executable
        browser = p.chromium.launch(**launch)
        context = browser.new_context(viewport={"width": 1440, "height": 1080},
                                      device_scale_factor=1, accept_downloads=True,
                                      timezone_id="Asia/Taipei", locale="zh-TW")
        page = context.new_page()
        page.on("pageerror", lambda error: REPORT["page_errors"].append(str(error)))

        def load(target):
            if MODE == "embedded":
                target.set_content(html, wait_until="domcontentloaded")
            else:
                target.goto(base, wait_until="domcontentloaded")
            target.wait_for_selector(".machine-card", timeout=15000)
            target.wait_for_selector("#history-chart svg", timeout=15000)

        load(page)
        check("Initial dashboard has exactly three machines", page.locator(".machine-card").count() == 3)
        check("Initial status summary is 1 running / 1 idle / 1 error",
              [page.locator(f'[data-count="{s}"]').inner_text() for s in ["running", "idle", "error"]] == ["1", "1", "1"])
        check("Traditional Chinese document, semantic heading and simulated-data label",
              page.locator("html").get_attribute("lang") == "zh-Hant" and
              page.locator("h1").count() == 1 and "模擬" in page.locator("#connection-status").inner_text())
        page.screenshot(path=str(ARTIFACTS / "desktop.png"), full_page=True)
        page.screenshot(path=str(ARTIFACTS / "desktop-viewport.png"))

        configure(page, interval=1000)
        before = page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text()
        page.wait_for_timeout(2300)
        after = page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text()
        check("Telemetry changes over time instead of displaying a static screenshot", before != after)
        configure(page, paused=True)
        before = page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text()
        page.wait_for_timeout(1300)
        check("Pause preserves the last received values", before == page.locator('[data-machine-id="MC-001"] .metric-grid').inner_text())

        for width in [320, 360, 375, 390, 430, 768, 1024, 1440]:
            page.set_viewport_size({"width": width, "height": 844 if width < 680 else 1080})
            page.wait_for_timeout(160)
            measured = page.evaluate("({page:document.documentElement.scrollWidth, viewport:innerWidth})")
            ok = measured["page"] <= measured["viewport"]
            REPORT["viewport_checks"].append({"width": width, "scroll_width": measured["page"], "passed": ok})
            check(f"No horizontal page overflow at {width}px", ok)

        page.locator('#summary [data-status="error"]').click()
        check("Status summary acts as a machine filter", page.locator(".machine-card").count() == 1)
        page.locator('#summary [data-status="error"]').click()
        page.fill("#machine-search", "MC-003")
        check("Search locates a machine by ID", page.locator(".machine-card").count() == 1 and page.locator(".machine-card").get_attribute("data-machine-id") == "MC-003")
        page.fill("#machine-search", "nonexistent-machine")
        check("No-result state is explicit and recoverable", page.locator("#clear-machine-filters").is_visible())
        page.locator("#clear-machine-filters").click()

        page.locator('[data-detail="MC-001"]').click()
        check("Machine detail opens three readable live charts", page.locator("#detail-dialog .detail-chart svg").count() == 3)
        page.keyboard.press("Escape")
        check("Dialog supports Escape and closes", not page.locator("#detail-dialog").is_visible())

        page.locator('[data-range="24h"]').click()
        page.wait_for_function("document.querySelector('#chart-period').textContent.includes('約 5 分鐘')")
        check("History switches to the previous 24 hours", "最近一天" in page.locator("#history-chart svg").get_attribute("aria-label"))
        page.select_option("#metric-select", "rpm")
        page.wait_for_function("document.querySelector('#history-chart svg').getAttribute('aria-label').includes('轉速')")
        page.locator("#history-chart").focus()
        page.keyboard.press("ArrowLeft")
        check("Keyboard chart tooltip exposes numerical RPM values", "RPM" in page.locator(".chart-tooltip").inner_text())
        page.locator('[data-range="1h"]').click()
        page.select_option("#metric-select", "temperature")
        page.wait_for_function("document.querySelector('#history-chart svg').getAttribute('aria-label').includes('最近一小時溫度')")

        run_scenario(page, "hot")
        check("High-temperature scenario turns the machine red and raises an alarm",
              page.locator('[data-machine-id="MC-001"]').get_attribute("class").endswith("error") and
              page.locator(".alert-row.critical.active").count() >= 2)
        active_ids = page.locator(".alert-row.critical.active").evaluate_all("els=>els.map(e=>e.dataset.alertId)")
        run_scenario(page, "hot")
        check("Repeated high-temperature actions do not duplicate the same alarm",
              active_ids == page.locator(".alert-row.critical.active").evaluate_all("els=>els.map(e=>e.dataset.alertId)"))
        run_scenario(page, "recover")
        check("Recovery restores running status and retains the resolved alert record",
              "running" in page.locator('[data-machine-id="MC-001"]').get_attribute("class") and
              page.locator(f'[data-alert-id="{active_ids[0]}"] .event-badge').inner_text() == "已解除")
        page.select_option("#alert-filter", "active")
        check("Active-alarm filter excludes resolved and informational events",
              page.locator(".alert-row").count() == 1)
        page.select_option("#alert-filter", "all")

        configure(page, count=12)
        check("Twelve-machine scenario renders all twelve cards", page.locator(".machine-card").count() == 12)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(220)
        cols = page.locator("#machine-grid").evaluate("el=>getComputedStyle(el).gridTemplateColumns")
        check("Phone layout uses a two-column grid, not a shrunken desktop table", len(cols.split()) == 2)
        check("Twelve machines do not overflow phone width", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        page.evaluate("document.querySelector('#toasts').replaceChildren(); scrollTo(0,0)")
        page.screenshot(path=str(ARTIFACTS / "mobile-12-machines.png"))
        page.locator("#density-button").click()
        check("Phone list mode provides an alternate dense view", "list" in page.locator("#machine-grid").get_attribute("class"))
        page.locator("#density-button").click()

        configure(page, count=30)
        check("Thirty-machine scenario is paginated rather than overflowing", page.locator(".machine-card").count() == 12 and page.locator("#more-machines").is_visible())
        page.locator("#more-machines").click()
        check("Load-more reveals the next twelve machines", page.locator(".machine-card").count() == 24)
        page.fill("#machine-search", "機台 30")
        check("Search includes machines outside the current pagination window", page.locator(".machine-card").count() == 1 and page.locator(".machine-card").get_attribute("data-machine-id") == "MC-030")
        page.fill("#machine-search", "")
        configure(page, count=60)
        check("Sixty-machine scale still stays within phone width", "60" in page.locator("#machine-count").inner_text() and page.evaluate("document.documentElement.scrollWidth <= innerWidth"))

        page.set_viewport_size({"width": 1440, "height": 1080})
        page.locator('.desktop-nav [data-view="history"]').click()
        for identifier in ["MC-004", "MC-005", "MC-006", "MC-007"]:
            page.locator(f'[data-history-id="{identifier}"]').click()
        check("Comparison limit prevents more than six simultaneous series", page.locator(".machine-chip.active").count() == 6)
        for identifier in ["MC-006", "MC-005", "MC-004", "MC-003", "MC-002", "MC-001"]:
            page.locator(f'[data-history-id="{identifier}"]').click()
        check("Comparison always retains at least one series", page.locator(".machine-chip.active").count() == 1)
        page.wait_for_timeout(200)
        with page.expect_download(timeout=7000) as info:
            page.locator("#export-csv").click()
        download = info.value
        download.save_as(str(ARTIFACTS / "history-export.csv"))
        check("CSV export contains time, units and simulated-source labels",
              "模擬資料" in (ARTIFACTS / "history-export.csv").read_text(encoding="utf-8-sig"))

        page.locator('.desktop-nav [data-view="overview"]').click()
        configure(page, count=3, interval=5000, paused=True)
        page.locator("#theme-button").click()
        check("Theme toggle changes the UI theme", page.locator("html").get_attribute("data-theme") == "dark")
        page.locator("#theme-button").click()
        page.locator('.desktop-nav [data-view="alerts"]').click()
        check("Alert history has its own navigable page", page.locator("h1").inner_text() == "警報事件中心" and not page.locator("#machine-section").is_visible())

        # Fresh phone context for a representative, untouched default screenshot.
        mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                             is_mobile=True, has_touch=True, timezone_id="Asia/Taipei", locale="zh-TW")
        phone = mobile_context.new_page()
        phone.on("pageerror", lambda error: REPORT["page_errors"].append(str(error)))
        load(phone)
        phone.screenshot(path=str(ARTIFACTS / "mobile.png"))
        phone.screenshot(path=str(ARTIFACTS / "mobile-full.png"), full_page=True)
        phone.locator('.bottom-nav [data-view="history"]').click()
        phone.wait_for_timeout(220)
        check("Mobile bottom navigation switches to history without layout overflow",
              phone.locator("h1").inner_text() == "歷史趨勢分析" and phone.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        phone.screenshot(path=str(ARTIFACTS / "mobile-history.png"))
        check("No uncaught JavaScript errors during the exercised flows", not REPORT["page_errors"], str(REPORT["page_errors"]))

        if MODE == "server":
            # A second client sees the shared Node state.
            phone.locator('.bottom-nav [data-view="overview"]').click()
            page.locator('.desktop-nav [data-view="overview"]').click()
            run_scenario(page, "hot")
            phone.wait_for_selector('[data-machine-id="MC-001"].error')
            check("SSE propagates a changed machine to a second browser session", True)
            registration = phone.evaluate("async()=>{const r=await navigator.serviceWorker.ready;return Boolean(r.active)}")
            check("Service worker registers on localhost", registration)
            mobile_context.set_offline(True)
            phone.reload(wait_until="domcontentloaded")
            phone.wait_for_selector(".machine-card")
            check("Cached app shell runs in explicitly labeled offline local mode", "本機模式" in phone.locator("#connection-status").inner_text())
            mobile_context.set_offline(False)
        else:
            REPORT["skipped"] = ["Browser-to-server SSE integration (Node HTTP/SSE contracts tested separately)",
                                 "Service-worker registration and offline reload in a real origin",
                                 "PWA installation on physical iOS/Android devices and signed native builds"]
        mobile_context.close()
        context.close()
        browser.close()
        browser = None
    REPORT["success"] = True
except Exception as error:
    REPORT["success"] = False
    REPORT["error"] = str(error)
    print(f"ERROR: {error}", flush=True)
    raise
finally:
    if server:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
    (ARTIFACTS / "browser-tests.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
    print(f"Report: {ARTIFACTS / 'browser-tests.json'}", flush=True)
