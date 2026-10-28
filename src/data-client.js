import { SimulationEngine } from '../shared/simulator.mjs';
/** A single transport boundary. The view layer never generates random data. */
export class DemoDataClient {
  constructor({ onSnapshot, onConnection, preferLocal = false }) {
    this.onSnapshot = onSnapshot;
    this.onConnection = onConnection;
    this.preferLocal = preferLocal;
    this.mode = 'connecting';
    this.engine = null;
    this.events = null;
    this.timer = null;
    this.closed = false;
    this.apiBase = ['http:', 'https:'].includes(location.protocol) ? new URL('./api/', location.href).href : ''; 
    this.lastSnapshot = null;
  }
  async connect() {
    if (!this.preferLocal && ['http:', 'https:'].includes(location.protocol)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        let response;
        try { response = await fetch(`${this.apiBase}health`, { signal: controller.signal, cache: 'no-store' }); }
        finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('No mock server');
        const health = await response.json();
        if (health.service !== 'machine-dashboard-demo') throw new Error('Not the demo server');
        this.mode = 'server';
        this.onConnection({ mode: 'server', connected: true });
        await this.refresh();
        this.events = new EventSource(`${this.apiBase}events`);
        this.events.addEventListener('snapshot', event => {
          try { this._emit(JSON.parse(event.data)); this.onConnection({ mode: 'server', connected: true }); }
          catch { this.onConnection({ mode: 'server', connected: false }); }
        });
        this.events.onopen = () => this.onConnection({ mode: 'server', connected: true });
        this.events.onerror = () => this.onConnection({ mode: 'server', connected: false });
        return;
      } catch { /* A static host or native app uses the identical local engine. */ }
    }
    this.mode = 'local';
    this.engine = new SimulationEngine();
    this.onConnection({ mode: 'local', connected: true });
    this._emit(this.engine.snapshot());
    this._schedule();
  }
  _schedule() {
    clearTimeout(this.timer);
    if (this.closed) return;
    this.timer = setTimeout(() => {
      this._emit(this.engine.tick()); this._schedule();
    }, this.engine.intervalMs);
  }
  _emit(snapshot) { this.lastSnapshot = snapshot; this.onSnapshot(snapshot); }
  async _request(path, data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${this.apiBase}${path}`, { signal: controller.signal, cache: 'no-store',
        ...(data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async refresh() {
    const snapshot = this.mode === 'server' ? await this._request('snapshot') : this.engine.snapshot();
    this._emit(snapshot); return snapshot;
  }
  async history(options) {
    if (this.mode === 'local') return this.engine.history(options);
    const params = new URLSearchParams({ ids: options.ids.join(','), metric: options.metric, range: options.range });
    return this._request(`history?${params}`);
  }
  async configure(config) {
    const snapshot = this.mode === 'server' ? await this._request('demo/config', config) : this.engine.configure(config);
    this._emit(snapshot);
    if (this.mode === 'local') this._schedule();
    return snapshot;
  }
  async scenario(machineId, action) {
    const snapshot = this.mode === 'server' ? await this._request('demo/scenario', { machineId, action }) : this.engine.scenario(machineId, action);
    this._emit(snapshot); return snapshot;
  }
  close() { this.closed = true; this.events?.close(); clearTimeout(this.timer); }
}
