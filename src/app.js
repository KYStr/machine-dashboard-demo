import { icon, fillIcons } from './icons.js';
import { DemoDataClient } from './data-client.js';
import { METRICS } from '../shared/simulator.mjs';
import { escapeHtml, seriesColor, chartTime, chartDate, numberText, sparkline, lineChart } from './charts.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const STATUS_LABELS = { running: '運轉中', idle: '待機', error: '異常' };
const STATUS_ICONS = { running: 'play', idle: 'pause', error: 'warning' };
const titles = {
  overview: ['產線即時總覽', '即時掌握設備狀態，異常發生時不錯過任何訊號。'],
  machines: ['所有機台', '搜尋、篩選與檢視每一台設備，從三台到更多機台。'],
  history: ['歷史趨勢分析', '比較不同機台，回看最近一小時或一天的變化。'],
  alerts: ['警報事件中心', '每一次異常、解除與狀態變化，都有紀錄可循。'],
};
const state = {
  snapshot: null, view: 'overview', query: '', status: 'all', density: 'cards', visible: 12,
  range: '1h', metric: 'temperature', ids: ['MC-001', 'MC-002', 'MC-003'],
  history: null, alertFilter: 'all', alertVisible: 50, detailId: null,
  connection: { mode: 'connecting', connected: false }, seenAlerts: null,
  historyRequest: 0, tooltipIndex: null, theme: 'light',
};
const client = new DemoDataClient({ onSnapshot: receiveSnapshot, onConnection: receiveConnection, preferLocal: Boolean(window.__PORTABLE_DEMO__) });
let installPrompt = null;
let resizeTimer;
let pendingHistoryTimer;

function readPreference(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function writePreference(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ } }
function badge(machine) { return `<span class="status-badge ${machine.status}">${machine.status === 'error' ? icon('warning') : '<i></i>'}${STATUS_LABELS[machine.status]}</span>`; }
function valueOf(machine, key) { return key === 'total' ? machine.total.toLocaleString('en-US') : numberText(machine[key], key); }
function toast(message, { level = 'info', detail = '', timeout = 5500 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.innerHTML = `${icon(level === 'critical' ? 'warning' : 'info')}<div>${escapeHtml(message)}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div><button aria-label="關閉通知">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  $('#toasts').append(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  setTimeout(() => el.remove(), timeout);
}
function receiveConnection(connection) {
  state.connection = connection;
  renderConnection();
}
function renderConnection() {
  const { mode, connected } = state.connection;
  const paused = state.snapshot?.paused;
  const label = !connected ? mode === 'connecting' ? '準備資料中' : '連線中斷' : paused ? '已暫停（模擬）' : mode === 'server' ? '模擬資料 · 即時連線' : '模擬資料 · 本機模式';
  $('#connection-status').innerHTML = `<i></i>${label}`;
  $('#connection-status').style.color = !connected || paused ? 'var(--amber)' : 'var(--green)';
  const offline = !navigator.onLine;
  const disconnected = mode === 'server' && !connected;
  const banner = $('#offline-banner');
  banner.hidden = !(offline || disconnected);
  banner.textContent = disconnected ? '後端連線中斷：保留最後收到的資料，正在自動重新連線。此時數值不是即時更新。' : '目前離線：本機示範仍可操作，所有數值都是模擬資料，不是真實工廠訊號。';
  $('#transport-description').textContent = mode === 'server' ? '資料來源：Node.js 模擬後端（REST + SSE）。同一服務的瀏覽器共用模擬狀態；重啟服務會重建示範資料。' : '資料來源：瀏覽器內的獨立模擬器。各裝置各自運行；重整頁面會重建示範資料。';
}
function receiveSnapshot(snapshot) {
  if (snapshot.revision === state.snapshot?.revision) return;
  const first = !state.snapshot;
  const oldCount = state.snapshot?.machines.length;
  state.snapshot = snapshot;
  const validIds = new Set(snapshot.machines.map(m => m.id));
  state.ids = state.ids.filter(id => validIds.has(id));
  if (!state.ids.length) state.ids = snapshot.machines.slice(0, 3).map(m => m.id);
  if (state.seenAlerts) {
    const newAlerts = snapshot.alerts.filter(a => !state.seenAlerts.has(a.id)).slice(0, 3).reverse();
    newAlerts.forEach(event => {
      if (event.level !== 'info' && event.active) toast(`${event.machineName} · ${event.message}`, { level: event.level, detail: `${event.value} °C ／ 門檻 ${event.threshold} °C` });
    });
  }
  state.seenAlerts = new Set(snapshot.alerts.map(a => a.id));
  $('#last-updated').textContent = `更新於 ${chartTime(snapshot.generatedAt, true)}`;
  $('#date-display').textContent = chartDate(snapshot.generatedAt);
  $('#update-interval').textContent = snapshot.paused ? '模擬已暫停' : `每 ${snapshot.intervalMs / 1000} 秒更新`;
  renderConnection(); renderSummary(); renderMachines(); renderAlerts();
  if (oldCount !== snapshot.machines.length) renderHistoryPicker();
  if (state.detailId && $('#detail-dialog').open) renderDetail();
  clearTimeout(pendingHistoryTimer);
  pendingHistoryTimer = setTimeout(() => loadHistory(), first ? 0 : 120);
  document.documentElement.dataset.ready = 'true';
}
function renderSummary() {
  const s = state.snapshot;
  if (!s) return;
  const activeFilter = document.activeElement?.dataset.status;
  $('#summary').innerHTML = ['running', 'idle', 'error'].map(status => `<button class="summary-card ${status} ${state.status === status ? 'selected' : ''}" data-status="${status}" aria-pressed="${state.status === status}"><span class="summary-icon">${icon(STATUS_ICONS[status])}</span><div><div class="summary-label">${STATUS_LABELS[status]}</div><span class="summary-number" data-count="${status}">${s.counts[status]}</span><span class="summary-denominator">/ ${s.counts.all} 台</span></div><span class="summary-caption">${status === 'running' ? '設備穩定運行' : status === 'idle' ? '等待生產任務' : '需要關注的設備'}</span>${icon('chevron')}</button>`).join('');
  if (activeFilter) $(`#summary [data-status="${activeFilter}"]`)?.focus({ preventScroll: true });
}
function metricCards(m) {
  return `<div class="metric-grid"><div class="metric-card ${m.alarmState === 'critical' ? 'hot' : ''}"><div class="metric-label">${icon('temperature')}溫度</div><div class="metric-value">${valueOf(m, 'temperature')}<small>°C</small></div><div class="metric-note">${m.alarmState === 'critical' ? '超過門檻' : '門檻'} ${m.threshold}°C</div></div><div class="metric-card"><div class="metric-label">${icon('gauge')}轉速 <span class="rpm-unit">RPM</span></div><div class="metric-value">${valueOf(m, 'rpm')}</div><div class="metric-note">${m.operating ? '主軸即時轉速' : '待機中'}</div></div><div class="metric-card"><div class="metric-label">${icon('cube')}今日累計</div><div class="metric-value">${valueOf(m, 'total')}<small>件</small></div><div class="metric-note">${m.operating ? `${numberText(m.output, 'output')} 件／分` : '目前無產出'}</div></div></div>`;
}
function machineCard(m) {
  const tempColor = m.alarmState === 'critical' ? '#e94061' : '#0eaa9e';
  const minis = ['temperature', 'rpm', 'output'].map(metric => {
    const color = metric === 'temperature' ? tempColor : metric === 'rpm' ? '#246bfd' : '#0eaa9e';
    const points = m.recent.map(p => ({ t: p.t, value: p[metric] }));
    return `<div class="mini-chart"><div class="mini-chart-header"><span>${metric === 'temperature' ? '溫度 (°C)' : metric === 'rpm' ? '轉速 (RPM)' : '產出 (件／分)'}</span><span style="color:${color}">${numberText(m[metric], metric)}</span></div>${lineChart([{ id: m.id, name: m.name, points }], { metric, width: 180, height: 105, mini: true, colorOverride: color, thresholds: metric === 'temperature' ? [m.threshold] : [], title: `${m.name}${METRICS[metric].label}即時趨勢` })}</div>`;
  }).join('');
  return `<article class="machine-card ${m.status}" data-machine-id="${m.id}"><div class="machine-card-header"><span class="machine-avatar">${icon('settings')}</span><div class="machine-heading"><button class="machine-name" data-detail="${m.id}" aria-label="查看${escapeHtml(m.name)}詳細數據">${escapeHtml(m.name)}</button><p class="machine-subtitle">${escapeHtml(m.kind)} · ${escapeHtml(m.line)}</p></div>${badge(m)}</div>${metricCards(m)}<div class="mini-charts">${minis}</div><div class="mobile-spark"><div class="spark-caption"><span>溫度走勢</span><span>近 10 分鐘</span></div>${sparkline(m.recent.map(p => ({ t: p.t, value: p.temperature })), { color: tempColor })}</div><div class="machine-foot"><span>${escapeHtml(m.id)} · 模擬資料</span><span>詳細數據${icon('chevron')}</span></div></article>`;
}
function renderMachines() {
  if (!state.snapshot) return;
  const list = state.snapshot.machines.filter(m => (state.status === 'all' || m.status === state.status) && `${m.name} ${m.id} ${m.kind} ${m.line}`.toLowerCase().includes(state.query.toLowerCase().trim()));
  const focusedMachine = document.activeElement?.dataset.detail;
  $('#machine-count').textContent = `${list.length} / ${state.snapshot.machines.length} 台`;
  const grid = $('#machine-grid');
  grid.className = `machine-grid ${state.snapshot.machines.length > 6 ? 'many' : ''} ${state.density === 'list' ? 'list' : ''}`;
  grid.innerHTML = list.length ? list.slice(0, state.visible).map(machineCard).join('') : `<div class="empty-state">${icon('search')}<strong>沒有符合條件的機台</strong><p>試試其他關鍵字，或清除目前的狀態篩選。</p><button class="button secondary" data-clear-filters>清除篩選</button></div>`;
  $('#machine-pagination').innerHTML = list.length > 12 ? `<span>顯示 ${Math.min(state.visible, list.length)} / ${list.length} 台</span>${list.length > state.visible ? '<button class="button secondary" id="more-machines">顯示更多機台</button>' : '<button class="text-button" id="collapse-machines">收合機台</button>'}` : '';
  if (focusedMachine) $(`[data-detail="${focusedMachine}"]`)?.focus({ preventScroll: true });
}
function renderAlerts() {
  if (!state.snapshot) return;
  const events = state.snapshot.alerts;
  const active = events.filter(event => event.active).length;
  $('#alert-count').textContent = `${active} 未解除`;
  $('#active-alert-summary').textContent = active ? `${active} 筆待關注事件 · 共 ${events.length} 筆紀錄` : `目前沒有未解除警示 · 共 ${events.length} 筆紀錄`;
  const filtered = events.filter(event => state.alertFilter === 'all' || (state.alertFilter === 'active' ? event.active : event.level === state.alertFilter));
  const limit = state.view === 'alerts' ? state.alertVisible : 6;
  const label = event => event.level === 'info' ? '資訊' : event.active ? event.level === 'critical' ? '異常' : '警告' : '已解除';
  const rows = filtered.slice(0, limit).map(event => `<div class="alert-row ${event.level} ${event.active ? 'active' : ''}" data-alert-id="${event.id}"><time class="alert-time" datetime="${new Date(event.timestamp).toISOString()}">${chartTime(event.timestamp, true)}<small>${chartDate(event.timestamp)}</small></time><div class="alert-machine">${escapeHtml(event.machineName)}</div><div class="alert-content">${escapeHtml(event.message)}<small>${event.level !== 'info' ? `門檻 ${event.threshold} °C${event.resolvedAt ? ` · 解除 ${chartTime(event.resolvedAt)}` : ''}` : '系統事件（模擬）'}</small></div><div class="alert-value">${event.value === null ? '—' : escapeHtml(`${numberText(event.value, event.unit === '°C' ? 'temperature' : 'rpm')} ${event.unit}`)}</div><span class="event-badge ${event.level !== 'info' && !event.active ? 'resolved' : event.level}">${event.active && event.level !== 'info' ? icon('warning') : event.level === 'info' ? icon('info') : icon('check')}${label(event)}</span></div>`).join('');
  $('#alert-list').innerHTML = filtered.length ? `<div class="alert-table-head"><span>發生時間</span><span>機台</span><span>事件說明</span><span>數值</span><span>狀態</span></div>${rows}${filtered.length > limit && state.view === 'alerts' ? '<button class="text-button full-width" id="more-alerts">顯示更多事件</button>' : ''}` : `<div class="empty-state">${icon('check')}<strong>目前沒有符合條件的事件</strong><p>警示發生後會自動記錄在這裡。</p></div>`;
}
function renderHistoryPicker() {
  if (!state.snapshot) return;
  const picker = $('#history-picker');
  picker.className = `history-machine-picker ${state.snapshot.machines.length > 3 ? 'visible' : ''}`;
  picker.innerHTML = state.snapshot.machines.map(m => `<button class="machine-chip ${state.ids.includes(m.id) ? 'active' : ''}" data-history-id="${m.id}" aria-pressed="${state.ids.includes(m.id)}"><i style="color:${seriesColor(m.id)}"></i>${escapeHtml(m.name)}</button>`).join('');
}
async function loadHistory() {
  if (!state.snapshot) return;
  const request = ++state.historyRequest;
  try {
    const data = await client.history({ ids: state.ids, metric: state.metric, range: state.range });
    if (request !== state.historyRequest) return;
    state.history = data; state.tooltipIndex = null;
    renderHistory();
  } catch (error) {
    if (request !== state.historyRequest) return;
    $('#chart-period').textContent = '無法更新歷史資料，保留最後一次結果。請重新整理重試。';
    if (!state.history) $('#history-chart').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}
function renderHistory() {
  const h = state.history;
  if (!h) return;
  const small = window.innerWidth <= 680;
  const actualWidth = $('#history-chart').clientWidth;
  const width = Math.max(small ? 290 : 400, actualWidth || 700);
  $('#chart-period').textContent = `${chartDate(h.start)} ${chartTime(h.start)} — ${chartDate(h.end)} ${chartTime(h.end)} · 台北時間 · ${h.sample}取樣`;
  $('#history-chart').innerHTML = lineChart(h.series, { metric: h.metric, width, height: small ? 207 : 245, start: h.start, end: h.end,
    thresholds: h.metric === 'temperature' ? h.series.map(s => s.threshold) : [],
    title: `${h.range === '1h' ? '最近一小時' : '最近一天'}${METRICS[h.metric].label}，${h.series.map(s => s.name).join('、')}，模擬數據` });
  $('#chart-legend').innerHTML = h.series.map(s => `<span class="legend-item"><i class="legend-dot" style="background:${seriesColor(s.id)}"></i>${escapeHtml(s.name)}</span>`).join('');
  $('#chart-data').innerHTML = `<table><thead><tr><th>機台</th><th>最新${METRICS[h.metric].label}</th><th>時間</th></tr></thead><tbody>${h.series.map(s => `<tr><td>${escapeHtml(s.name)}</td><td>${numberText(s.points.at(-1).value, h.metric)} ${METRICS[h.metric].unit}</td><td>${chartTime(s.points.at(-1).t, true)}</td></tr>`).join('')}</tbody></table>`;
  $$('.segmented [data-range]').forEach(b => { b.classList.toggle('active', b.dataset.range === state.range); b.setAttribute('aria-pressed', String(b.dataset.range === state.range)); });
}
function showTooltip(index) {
  const h = state.history;
  if (!h?.series?.[0]?.points.length) return;
  const reference = h.series[0].points;
  const i = Math.max(0, Math.min(index, reference.length - 1));
  state.tooltipIndex = i;
  const target = reference[i].t;
  let tooltip = $('#history-chart .chart-tooltip');
  if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'chart-tooltip'; $('#history-chart').append(tooltip); }
  tooltip.innerHTML = `<p>${chartDate(target)} ${chartTime(target, true)}</p>${h.series.map(s => {
    const p = s.points.reduce((best, current) => Math.abs(current.t - target) < Math.abs(best.t - target) ? current : best);
    return `<div class="tooltip-item"><span style="color:${seriesColor(s.id)}">● ${escapeHtml(s.name)}</span><strong>${numberText(p.value, h.metric)} ${METRICS[h.metric].unit}</strong></div>`;
  }).join('')}`;
  const svg = $('#history-chart svg'), cursor = $('#history-chart .chart-cursor');
  if (svg && cursor) {
    const left = Number(svg.dataset.left), right = Number(svg.dataset.right), width = Number(svg.dataset.chartWidth);
    const x = left + (target - h.start) / (h.end - h.start) * (width - left - right);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('opacity', '.65');
  }
}
function setView(view, { scroll = true } = {}) {
  if (!Object.hasOwn(titles, view)) view = 'overview';
  state.view = view; document.body.dataset.view = view;
  $('#page-title').textContent = titles[view][0]; $('#page-description').textContent = titles[view][1];
  $$('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  if (state.snapshot) { renderAlerts(); requestAnimationFrame(renderHistory); }
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
function openSettings() {
  if (!state.snapshot) return;
  $('#demo-count').value = state.snapshot.machines.length;
  $('#demo-interval').value = state.snapshot.intervalMs;
  $('#demo-paused').checked = state.snapshot.paused;
  const prior = $('#scenario-machine').value;
  $('#scenario-machine').innerHTML = state.snapshot.machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)} · ${STATUS_LABELS[m.status]}</option>`).join('');
  if (state.snapshot.machines.some(m => m.id === prior)) $('#scenario-machine').value = prior;
  $('#settings-dialog').showModal();
}
function renderDetail() {
  const m = state.snapshot?.machines.find(m => m.id === state.detailId);
  if (!m) { $('#detail-dialog').close(); state.detailId = null; return; }
  $('#detail-title').textContent = `${m.name} · 即時數據`;
  const chartWidth = Math.max(280, $('#detail-dialog').clientWidth - 70);
  $('#detail-content').innerHTML = `<div class="detail-intro"><span>${escapeHtml(m.kind)} · ${escapeHtml(m.line)} · ${m.id}</span>${badge(m)}</div>${metricCards(m)}${m.alarmState === 'critical' ? `<div class="detail-warning">${icon('warning')} 溫度 ${m.temperature}°C，已超過 ${m.threshold}°C 門檻。此為模擬警示。</div>` : ''}${['temperature', 'rpm', 'output'].map(metric => `<section class="detail-chart"><h3>${METRICS[metric].label}<span>${numberText(m[metric], metric)} ${METRICS[metric].unit}</span></h3>${lineChart([{ id: m.id, name: m.name, points: m.recent.map(p => ({ t: p.t, value: p[metric] })) }], { metric, width: chartWidth, height: 180, thresholds: metric === 'temperature' ? [m.threshold] : [], colorOverride: metric === 'temperature' && m.alarmState === 'critical' ? '#e94061' : metric === 'rpm' ? '#246bfd' : '#0eaa9e', title: `${m.name}${METRICS[metric].label}趨勢` })}</section>`).join('')}<p class="settings-footnote">更新於 ${chartTime(m.updatedAt, true)}（台北時間）。近十分鐘走勢；資料均為模擬。</p>`;
}
async function runScenario(action) {
  const id = $('#scenario-machine').value;
  try { await client.scenario(id, action); $('#settings-dialog').close(); toast(action === 'hot' ? '高溫情境已套用' : '已恢復正常，警示紀錄已更新', { detail: '此模擬情境維持約兩分鐘，之後回到原始模擬基準。' }); }
  catch (error) { toast(`操作失敗：${error.message}`, { level: 'critical' }); }
}
function setTheme(theme) {
  state.theme = theme; document.documentElement.dataset.theme = theme;
  $('#theme-button').innerHTML = icon(theme === 'light' ? 'sun' : 'moon');
  $('#theme-button').setAttribute('aria-label', `切換${theme === 'light' ? '深' : '淺'}色模式`);
  $('meta[name="theme-color"]').content = theme === 'light' ? '#f5f8fc' : '#101a2a';
  writePreference('machine-demo-theme', theme);
}
function exportCsv() {
  const h = state.history;
  if (!h) return toast('歷史資料尚未載入。');
  const safe = value => { let text = String(value); if (/^[=+@-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const rows = [['時間（台北）', '機台代碼', '機台', `${METRICS[h.metric].label} (${METRICS[h.metric].unit})`, '資料來源']];
  h.series.forEach(s => s.points.forEach(p => rows.push([`${chartDate(p.t)} ${chartTime(p.t, true)}`, s.id, s.name, p.value, '模擬資料'])));
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `machine-history-${h.metric}-${h.range}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('CSV 已匯出', { detail: `${h.series.length} 台機台 · ${h.range === '1h' ? '最近一小時' : '最近一天'} · 模擬資料` });
}

function wireEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) return setView(button.dataset.view);
    if (button.hasAttribute('data-open-settings')) return openSettings();
    if (button.hasAttribute('data-close-dialog')) return button.closest('dialog').close();
    if (button.dataset.detail) { state.detailId = button.dataset.detail; $('#detail-dialog').showModal(); renderDetail(); return; }
    if (button.dataset.status) { state.status = state.status === button.dataset.status ? 'all' : button.dataset.status; $('#status-filter').value = state.status; state.visible = 12; renderSummary(); renderMachines(); return; }
    if (button.dataset.range) { state.range = button.dataset.range; $$('.segmented [data-range]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); loadHistory(); return; }
    if (button.dataset.historyId) {
      const id = button.dataset.historyId;
      if (state.ids.includes(id)) { if (state.ids.length === 1) return toast('至少保留一台比較機台。'); state.ids = state.ids.filter(x => x !== id); }
      else { if (state.ids.length === 6) return toast('最多同時比較六台機台，請先取消一台。'); state.ids.push(id); }
      renderHistoryPicker(); loadHistory(); return;
    }
    if (button.hasAttribute('data-clear-filters')) { state.query = ''; state.status = 'all'; $('#machine-search').value = ''; $('#status-filter').value = 'all'; renderSummary(); renderMachines(); }
    if (button.id === 'more-machines') { state.visible += 12; renderMachines(); }
    if (button.id === 'collapse-machines') { state.visible = 12; renderMachines(); }
    if (button.id === 'more-alerts') { state.alertVisible += 50; renderAlerts(); }
  });
  $('#machine-search').addEventListener('input', e => { state.query = e.target.value; state.visible = 12; renderMachines(); });
  $('#status-filter').addEventListener('change', e => { state.status = e.target.value; state.visible = 12; renderSummary(); renderMachines(); });
  $('#density-button').onclick = () => { state.density = state.density === 'cards' ? 'list' : 'cards'; $('#density-button').innerHTML = icon(state.density === 'cards' ? 'list' : 'grid'); $('#density-button').setAttribute('aria-label', `切換${state.density === 'cards' ? '列表' : '卡片'}檢視`); writePreference('machine-demo-density', state.density); renderMachines(); };
  $('#metric-select').onchange = event => { state.metric = event.target.value; loadHistory(); };
  $('#alert-filter').onchange = event => { state.alertFilter = event.target.value; renderAlerts(); };
  $('#all-alerts').onclick = () => setView('alerts');
  $('#theme-button').onclick = () => setTheme(state.theme === 'light' ? 'dark' : 'light');
  $('#refresh-button').onclick = async () => { try { await client.refresh(); await loadHistory(); toast('已重新整理最新模擬資料'); } catch (error) { toast(`無法更新：${error.message}`, { level: 'critical' }); } };
  $('#settings-form').onsubmit = async event => {
    event.preventDefault();
    const button = $('#settings-form [type="submit"]'); button.disabled = true;
    try { await client.configure({ count: Number($('#demo-count').value), intervalMs: Number($('#demo-interval').value), paused: $('#demo-paused').checked }); state.visible = 12; renderMachines(); $('#settings-dialog').close(); toast('展示設定已更新'); }
    catch (error) { toast(`設定失敗：${error.message}`, { level: 'critical' }); }
    finally { button.disabled = false; }
  };
  $('#trigger-alert').onclick = () => runScenario('hot');
  $('#resolve-alert').onclick = () => runScenario('recover');
  $('#export-csv').onclick = exportCsv;
  $('#history-chart').addEventListener('pointermove', event => {
    const svg = $('#history-chart svg'), h = state.history;
    if (!svg || !h) return;
    const bounds = svg.getBoundingClientRect();
    const left = Number(svg.dataset.left), right = Number(svg.dataset.right), width = Number(svg.dataset.chartWidth);
    const x = (event.clientX - bounds.left) / bounds.width * width;
    const index = Math.round((x - left) / (width - left - right) * (h.series[0].points.length - 1));
    showTooltip(index);
  });
  $('#history-chart').addEventListener('pointerleave', () => { $('#history-chart .chart-tooltip')?.remove(); $('#history-chart .chart-cursor')?.setAttribute('opacity', '0'); });
  $('#history-chart').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showTooltip((state.tooltipIndex ?? state.history?.series[0].points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1)); }
    if (event.key === 'Escape') { $('#history-chart .chart-tooltip')?.remove(); }
  });
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { const r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); });
  });
  $('#detail-dialog').addEventListener('close', () => { state.detailId = null; });
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { renderHistory(); if (state.detailId) renderDetail(); }, 120); });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
  window.addEventListener('online', renderConnection); window.addEventListener('offline', renderConnection);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  $('#install-button').onclick = async () => {
    if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
    else if (location.protocol === 'file:') toast('單檔預覽不支援安裝', { detail: '請啟動專案並使用 localhost 或 HTTPS 網站，再安裝 PWA。', timeout: 9000 });
    else toast('將看板加入主畫面', { detail: 'iPhone：Safari「分享 → 加入主畫面」。Android／電腦：使用瀏覽器選單的安裝功能；支援程度依瀏覽器而異。', timeout: 10000 });
  };
  if (window.__PORTABLE_DEMO__) $('.site-footer a').onclick = event => { event.preventDefault(); toast('Machine Dashboard Demo', { detail: '此檔案為離線可操作的單頁預覽。完整專案內含 README、模擬 REST/SSE 後端、測試與 PWA／App 打包設定。', timeout: 10000 }); };
}

fillIcons();
state.density = readPreference('machine-demo-density', 'cards') === 'list' ? 'list' : 'cards';
setTheme(readPreference('machine-demo-theme', 'light') === 'dark' ? 'dark' : 'light');
wireEvents();
setView(location.hash.slice(1) || 'overview', { scroll: false });
client.connect().catch(error => { $('#offline-banner').hidden = false; $('#offline-banner').textContent = `無法啟動示範：${error.message}`; });
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol) && !window.__PORTABLE_DEMO__ && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* Offline caching is optional; dashboard still works. */ }));
}
