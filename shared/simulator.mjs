import { temperatureState } from './alerts.mjs';
/**
 * Framework-independent, deterministic simulator shared by Node and the browser.
 * All telemetry is synthetic. Histories are bounded to 24 hours; nothing is sent
 * to an external service. Units: temperature °C, rpm rev/min, output pieces/min.
 */
export const DEMO_COUNTS = Object.freeze([3, 12, 30, 60]);
export const DEMO_INTERVALS = Object.freeze([1000, 3000, 5000, 10000]);
export const METRICS = Object.freeze({
  temperature: { label: '溫度', unit: '°C', decimals: 1 },
  rpm: { label: '轉速', unit: 'RPM', decimals: 0 },
  output: { label: '產出速率', unit: '件／分', decimals: 1 },
});
const DAY_MS = 86_400_000;
const clampNumber = (x, min, max) => Math.min(max, Math.max(min, x));
const roundOne = x => Math.round(x * 10) / 10;
export function taipeiDay(timestamp) {
  return new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function seededRandom(seed = 20261026) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function downsample(points, maxPoints = 241) {
  if (points.length <= maxPoints) return points.map(p => ({ ...p }));
  const stride = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => ({ ...points[Math.round(i * stride)] }));
}
export class SimulationEngine {
  constructor({ count = 3, now = Date.now(), seed = 20261026 } = {}) {
    if (!DEMO_COUNTS.includes(count)) throw new RangeError('機台數量只允許 3、12、30、60');
    if (!Number.isFinite(now)) throw new TypeError('Invalid simulation timestamp');
    this.now = now;
    this.seed = seed;
    this.random = seededRandom(seed);
    this.intervalMs = 5000;
    this.paused = false;
    this.revision = 1;
    this.machines = [];
    this.histories = new Map();
    this.realtime = new Map();
    this.alerts = [];
    this.sequence = 0;
    this.configure({ count });
    this._seedEvents();
  }

  _createMachine(index) {
    const letter = String.fromCharCode(65 + index);
    const base = [62.4, 96.8, 45.6][index] ?? roundOne(49 + this.random() * 22);
    const idle = index === 2 || (index > 2 && index % 5 === 0);
    const error = index === 1 || (index > 2 && index % 11 === 0);
    const temperature = error && index > 2 ? 91.2 : base;
    const machine = {
      id: `MC-${String(index + 1).padStart(3, '0')}`,
      name: index < 3 ? `機台 ${letter}` : `機台 ${String(index + 1).padStart(2, '0')}`,
      kind: ['CNC 加工機', '射出成型機', '包裝機', '雷射切割機'][index % 4],
      line: `產線 ${String.fromCharCode(65 + Math.floor(index / 4))}`,
      status: error ? 'error' : idle ? 'idle' : 'running',
      operating: !idle,
      temperature, rpm: idle ? 0 : index === 0 ? 1820 : index === 1 ? 1650 : Math.round(1400 + this.random() * 800),
      output: idle ? 0 : index === 0 ? 42 : index === 1 ? 28 : roundOne(22 + this.random() * 25),
      total: [346, 28, 0][index] ?? Math.round(250 + this.random() * 1100),
      threshold: index === 2 ? 70 : 80,
      alarmState: error ? 'critical' : 'normal',
      updatedAt: this.now,
      _index: index, _base: temperature, _fraction: 0, _day: taipeiDay(this.now),
      _forced: null, _forcedUntil: 0,
    };
    this._seedHistory(machine);
    return machine;
  }

  _seedHistory(machine) {
    const points = [];
    const jitter = seededRandom(this.seed + machine._index * 719);
    for (let i = 1440; i >= 0; i--) {
      const progress = (1440 - i) / 1440;
      const rising = machine.status === 'error' ? 25 * (1 - progress ** 5) : 5 * (1 - progress);
      const wave = Math.sin(i / 21 + machine._index) * 1.8 + (jitter() - 0.5) * 1.6;
      points.push({
        t: this.now - i * 60_000,
        temperature: roundOne(Math.max(15, machine.temperature - rising + wave)),
        rpm: machine.operating ? Math.round(machine.rpm + Math.sin(i / 12) * 80 + (jitter() - 0.5) * 65) : 0,
        output: machine.operating ? roundOne(Math.max(0, machine.output + Math.sin(i / 9) * 2 + jitter() * 1.6)) : 0,
      });
    }
    points[points.length - 1] = this._point(machine);
    this.histories.set(machine.id, points);
    const recent = [];
    for (let i = 120; i >= 0; i--) {
      const position = points.length - 1 - i / 12;
      const lower = Math.floor(position);
      const fraction = position - lower;
      const before = points[lower], after = points[Math.min(lower + 1, points.length - 1)];
      const interpolate = key => before[key] + (after[key] - before[key]) * fraction;
      recent.push({ t: this.now - i * 5000,
        temperature: roundOne(interpolate('temperature') + (jitter() - 0.5) * 0.65),
        rpm: machine.operating ? Math.round(interpolate('rpm') + (jitter() - 0.5) * 35) : 0,
        output: machine.operating ? roundOne(Math.max(0, interpolate('output') + (jitter() - 0.5) * 1.2)) : 0,
      });
    }
    recent[recent.length - 1] = this._point(machine);
    this.realtime.set(machine.id, recent);
  }

  _point(machine) {
    return { t: this.now, temperature: machine.temperature, rpm: machine.rpm, output: machine.output };
  }

  _record(machine) {
    const point = this._point(machine);
    const history = this.histories.get(machine.id);
    const last = history.at(-1);
    if (Math.floor(last.t / 60_000) === Math.floor(this.now / 60_000)) history[history.length - 1] = point;
    else history.push(point);
    while (history.length > 1442 || (history.length > 1 && history[1].t < this.now - DAY_MS)) history.shift();
    const recent = this.realtime.get(machine.id);
    if (recent.at(-1)?.t === this.now) recent[recent.length - 1] = point;
    else recent.push(point);
    while (recent.length > 601 || (recent.length > 1 && recent[1].t < this.now - 600_000)) recent.shift();
  }

  configure(config = {}) {
    const { count = this.machines.length || 3, intervalMs = this.intervalMs, paused = this.paused } = config;
    if (!DEMO_COUNTS.includes(count)) throw new RangeError('機台數量只允許 3、12、30、60');
    if (!DEMO_INTERVALS.includes(intervalMs)) throw new RangeError('更新頻率只允許 1、3、5、10 秒');
    if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean');
    const oldCount = this.machines.length;
    for (let i = oldCount; i < count; i++) {
      const machine = this._createMachine(i);
      this.machines.push(machine);
      if (machine.alarmState === 'critical') {
        this._pushEvent(machine, 'critical', '溫度過高，已超過上限', machine.temperature, true);
      }
    }
    if (count < oldCount) {
      const removed = this.machines.splice(count);
      removed.forEach(m => { this.histories.delete(m.id); this.realtime.delete(m.id); });
      this.alerts = this.alerts.filter(a => this.machines.some(m => m.id === a.machineId));
    }
    this.intervalMs = intervalMs;
    this.paused = paused;
    this.revision++;
    return this.snapshot();
  }

  tick(at = Date.now()) {
    if (this.paused || at <= this.now) return this.snapshot();
    if (!Number.isFinite(at)) throw new TypeError('Invalid simulation timestamp');
    const seconds = Math.min((at - this.now) / 1000, 10);
    this.now = at;
    this.machines.forEach(machine => {
      if (machine._day !== taipeiDay(at)) { machine.total = 0; machine._fraction = 0; machine._day = taipeiDay(at); }
      const forced = machine._forced && at < machine._forcedUntil;
      const target = forced ? (machine._forced === 'hot' ? machine.threshold + 16.8 : machine.threshold - 18) : machine._base;
      machine.temperature = roundOne(clampNumber(machine.temperature + (target - machine.temperature) * 0.16 + (this.random() - 0.5) * 1.2, 15, 115));
      if (machine.operating) {
        machine.rpm = Math.round(clampNumber(machine.rpm + (this.random() - 0.5) * 65, 1300, 2350));
        machine.output = roundOne(clampNumber(machine.output + (this.random() - 0.5) * 1.8, 16, 52));
        machine._fraction += machine.output * seconds / 60;
        const pieces = Math.floor(machine._fraction);
        machine.total += pieces;
        machine._fraction -= pieces;
      } else { machine.rpm = 0; machine.output = 0; }
      machine.updatedAt = at;
      this._evaluate(machine);
      this._record(machine);
    });
    this.revision++;
    return this.snapshot();
  }

  _pushEvent(machine, level, message, value, active = false, at = this.now, unit = '°C') {
    const event = { id: `evt-${++this.sequence}`, machineId: machine.id, machineName: machine.name,
      timestamp: at, level, message, value, unit, threshold: machine.threshold, active,
      resolvedAt: null };
    this.alerts.unshift(event);
    // Never evict an active alarm to make room for old informational messages.
    const activeEvents = this.alerts.filter(a => a.active);
    const otherEvents = this.alerts.filter(a => !a.active).sort((a, b) => b.timestamp - a.timestamp);
    this.alerts = [...activeEvents, ...otherEvents.slice(0, 500 - activeEvents.length)]
      .sort((a, b) => b.timestamp - a.timestamp || Number(b.id.slice(4)) - Number(a.id.slice(4)));
    return event;
  }

  _seedEvents() {
    const [a, b, c] = this.machines;
    const warning = this._pushEvent(b, 'warning', '溫度接近上限', 78.1, false, this.now - 12 * 60_000);
    warning.resolvedAt = this.now;
    this._pushEvent(a, 'info', '今日累計產量達到 300 件', 300, false, this.now - 42 * 60_000, '件');
    this._pushEvent(c, 'info', '由運轉切換為待機', null, false, this.now - 65 * 60_000, '');
    this._pushEvent(b, 'info', '上一筆異常已解除', 68.4, false, this.now - 90 * 60_000);
    const prior = this._pushEvent(b, 'critical', '溫度過高，已超過上限', 88.2, false, this.now - 105 * 60_000);
    prior.resolvedAt = this.now - 90 * 60_000;
  }

  _evaluate(machine) {
    const previous = machine.alarmState;
    const next = temperatureState(machine.temperature, machine.threshold, previous);
    if (next !== previous) {
      for (const event of this.alerts) {
        if (event.machineId === machine.id && event.active) {
          event.active = false; event.resolvedAt = this.now;
        }
      }
      if (next === 'critical') this._pushEvent(machine, 'critical', '溫度過高，已超過上限', machine.temperature, true);
      else if (next === 'warning') this._pushEvent(machine, 'warning', '溫度接近上限', machine.temperature, true);
      else this._pushEvent(machine, 'info', '溫度已恢復正常', machine.temperature);
    }
    machine.alarmState = next;
    machine.status = next === 'critical' ? 'error' : machine.operating ? 'running' : 'idle';
  }

  scenario(machineId, action, at = Date.now()) {
    const machine = this.machines.find(m => m.id === machineId);
    if (!machine) throw new RangeError('找不到機台');
    if (!['hot', 'recover'].includes(action)) throw new RangeError('未知的模擬操作');
    this.now = Math.max(at, this.now);
    machine._forced = action === 'hot' ? 'hot' : 'cool';
    machine._forcedUntil = this.now + 120_000;
    machine.temperature = action === 'hot' ? roundOne(machine.threshold + 16.8) : roundOne(machine.threshold - 18);
    machine.updatedAt = this.now;
    this._evaluate(machine);
    this._record(machine);
    this.revision++;
    return this.snapshot();
  }

  snapshot() {
    const counts = { all: this.machines.length, running: 0, idle: 0, error: 0 };
    const machines = this.machines.map(machine => {
      counts[machine.status]++;
      const safe = Object.fromEntries(Object.entries(machine).filter(([key]) => !key.startsWith('_')));
      return { ...safe, recent: downsample(this.realtime.get(machine.id), 41) };
    });
    return { mode: 'simulation', revision: this.revision, generatedAt: this.now, intervalMs: this.intervalMs, paused: this.paused,
      counts, machines, alerts: this.alerts.map(a => ({ ...a })), retentionHours: 24 };
  }

  history({ ids = this.machines.slice(0, 3).map(m => m.id), metric = 'temperature', range = '1h' } = {}) {
    if (!Object.hasOwn(METRICS, metric)) throw new RangeError('未知的數據指標');
    if (!['1h', '24h'].includes(range)) throw new RangeError('範圍只允許 1h、24h');
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 6 || new Set(ids).size !== ids.length) throw new RangeError('請選擇 1 至 6 台不同的機台');
    const duration = range === '1h' ? 3_600_000 : DAY_MS;
    const start = this.now - duration;
    const series = ids.map(id => {
      const machine = this.machines.find(m => m.id === id);
      if (!machine) throw new RangeError(`找不到機台 ${id}`);
      const points = this.histories.get(id).filter(p => p.t >= start);
      return { id, name: machine.name, threshold: machine.threshold, status: machine.status,
        points: downsample(points, range === '1h' ? 121 : 289).map(p => ({ t: p.t, value: p[metric] })) };
    });
    return { metric, range, start, end: this.now, sample: range === '1h' ? '約 1 分鐘' : '約 5 分鐘', simulated: true, series };
  }
}
