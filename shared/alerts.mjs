/** Pure threshold state machine. Hysteresis prevents flickering at a boundary. */
export function temperatureState(value, threshold = 80, previous = 'normal') {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) throw new TypeError('Temperature and threshold must be finite numbers');
  if (!['normal', 'warning', 'critical'].includes(previous)) throw new RangeError('Invalid previous alarm state');
  if (value >= threshold) return 'critical';
  if (previous === 'critical' && value >= threshold - 3) return 'critical';
  if (value >= threshold - 5) return 'warning';
  if (previous === 'warning' && value >= threshold - 8) return 'warning';
  return 'normal';
}
