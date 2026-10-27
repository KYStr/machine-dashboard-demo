/** Lightweight SVG charts: real coordinates, visible thresholds, no chart CDN. */
const CHART_COLORS = ['#246bfd', '#e94061', '#0eaa9e', '#9564df', '#d88b20', '#1f9dc1'];
let chartSequence = 0;
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function seriesColor(id) { return CHART_COLORS[(Math.max(1, Number(id.split('-').at(-1))) - 1) % CHART_COLORS.length]; }
export function chartTime(timestamp, seconds = false) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(timestamp);
}
export function chartDate(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
}
export function numberText(value, metric = 'temperature') {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: metric === 'temperature' ? 1 : 0, maximumFractionDigits: metric === 'rpm' ? 0 : 1 });
}
export function sparkline(points, { color = '#0eaa9e', width = 300, height = 70, min = null, max = null } = {}) {
  if (!points?.length) return '';
  const values = points.map(p => p.value);
  let lo = min ?? Math.min(...values) - 3;
  let hi = max ?? Math.max(...values) + 3;
  if (hi <= lo) hi = lo + 1;
  const x = i => 2 + i * (width - 4) / Math.max(1, points.length - 1);
  const y = value => 4 + (hi - value) / (hi - lo) * (height - 8);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const id = `spark-${++chartSequence}`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".21"/><stop offset="100%" stop-color="${color}" stop-opacity=".02"/></linearGradient></defs><path d="${d} L${width - 2},${height} L2,${height} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
export function lineChart(series, { metric = 'temperature', width = 700, height = 260, mini = false, thresholds = [], title = '模擬資料趨勢', colorOverride = null, start = null, end = null } = {}) {
  const w = Math.max(mini ? 130 : 280, width), h = height;
  const left = mini ? 29 : metric === 'rpm' ? 47 : 36;
  const right = mini ? 9 : 16;
  const top = mini ? 10 : 15;
  const bottom = mini ? 22 : 30;
  const plotW = w - left - right, plotH = h - top - bottom;
  const allPoints = series.flatMap(s => s.points);
  if (!allPoints.length) return '<p class="empty-state">此時段尚無資料</p>';
  const from = start ?? Math.min(...allPoints.map(p => p.t));
  const to = end ?? Math.max(...allPoints.map(p => p.t));
  const observedMax = Math.max(...allPoints.map(p => p.value), ...thresholds, 1);
  const baseMax = metric === 'temperature' ? 120 : metric === 'rpm' ? 3000 : 60;
  const scaleMax = Math.max(baseMax, Math.ceil(observedMax / (baseMax / 4)) * (baseMax / 4));
  const x = time => left + (time - from) / Math.max(1, to - from) * plotW;
  const y = value => top + (1 - value / scaleMax) * plotH;
  const unique = ++chartSequence;
  const fontSize = mini ? 8 : w < 450 ? 9 : 11;
  const rows = mini ? 3 : 4;
  let grid = '';
  for (let i = 0; i <= rows; i++) {
    const value = scaleMax * i / rows;
    grid += `<line x1="${left}" y1="${y(value)}" x2="${w - right}" y2="${y(value)}" stroke="var(--line)"/><text x="${left - 7}" y="${y(value) + 3}" text-anchor="end" fill="var(--muted)" font-size="${fontSize}">${Math.round(value).toLocaleString('en-US')}</text>`;
  }
  const ticks = mini ? 2 : w < 450 ? 4 : 6;
  for (let i = 0; i <= ticks; i++) {
    const t = from + (to - from) * i / ticks;
    const xpos = x(t);
    grid += `<line x1="${xpos}" y1="${top}" x2="${xpos}" y2="${h - bottom}" stroke="var(--line)"/><text x="${xpos}" y="${h - 9}" text-anchor="${i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}" fill="var(--muted)" font-size="${fontSize}">${chartTime(t)}</text>`;
  }
  const defs = series.map((s, i) => `<linearGradient id="area-${unique}-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colorOverride || seriesColor(s.id)}" stop-opacity=".14"/><stop offset="100%" stop-color="${colorOverride || seriesColor(s.id)}" stop-opacity=".015"/></linearGradient>`).join('');
  const paths = series.map((s, i) => {
    const color = colorOverride || seriesColor(s.id);
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
    const last = s.points.at(-1), first = s.points[0];
    return `<path d="${d} L${x(last.t)},${h - bottom} L${x(first.t)},${h - bottom} Z" fill="url(#area-${unique}-${i})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${mini ? 1.7 : 2.2}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${x(last.t)}" cy="${y(last.value)}" r="${mini ? 2 : 4}" fill="${color}" stroke="var(--surface)" stroke-width="${mini ? 1 : 2}"/>`;
  }).join('');
  const limits = [...new Set(thresholds)].map(value => `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--red)" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>${mini ? '' : `<text x="${left + 5}" y="${y(value) - 5}" fill="var(--red)" font-size="${fontSize - 1}">門檻 ${value}°C</text>`}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}" data-left="${left}" data-right="${right}" data-chart-width="${w}"><title>${escapeHtml(title)}</title><defs>${defs}</defs>${grid}${paths}${limits}<line class="chart-cursor" x1="${w - right}" x2="${w - right}" y1="${top}" y2="${h - bottom}" stroke="var(--muted)" stroke-dasharray="3 4" opacity="0"/></svg>`;
}
