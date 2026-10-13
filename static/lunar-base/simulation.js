/* Pure, deterministic demo state. No jobs, API calls, telemetry or randomness. */
(function (root) {
  'use strict';
  const points = [[143, 402], [254, 420], [392, 412], [514, 403], [581, 429], [391, 483], [252, 484], [143, 402]];
  const bound = {stride: 30, push: .4, flight: 2.3, landing: .4, height: 12};
  bound.duration = bound.push + bound.flight + bound.landing;
  const speed = bound.stride / bound.flight;
  const workTime = 12, idleTime = 3;
  const segments = points.slice(1).map((end, i) => {
    const start = points[i], length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    return {start, end, length, duration: length / speed};
  });
  const routeLength = segments.reduce((sum, s) => sum + s.length, 0);
  const travelTime = Math.ceil(routeLength / bound.stride) * bound.duration;
  const period = workTime + idleTime + travelTime;
  function sample(time, offset = 0) {
    let phase = ((time + offset) % period + period) % period;
    if (phase < workTime) return {x: points[0][0], y: points[0][1], action: 'working', frame: Math.floor(phase * 5) % 6, flip: false, distance: 0, height: 0, squash: 1};
    phase -= workTime;
    if (phase < idleTime) return {x: points[0][0], y: points[0][1], action: 'idle', frame: Math.floor(phase * 2) % 6, flip: false, distance: 0, height: 0, squash: 1};
    phase -= idleTime;
    const hop = Math.floor(phase / bound.duration), hopTime = phase % bound.duration;
    const stepStart = hop * bound.stride, stepLength = Math.min(bound.stride, routeLength - stepStart);
    let progress = 0, height = 0, squash = 1, pose = 0, boundPhase = 'push-off';
    if (hopTime < bound.push) {
      const p = hopTime / bound.push;
      squash = 1 - .07 * Math.sin(Math.PI * p);
      pose = p < .55 ? 0 : 1;
    } else if (hopTime < bound.push + bound.flight) {
      progress = (hopTime - bound.push) / bound.flight;
      height = 4 * bound.height * progress * (1 - progress);
      pose = progress < .25 ? 2 : progress < .70 ? 5 : 3;
      boundPhase = 'floating';
    } else {
      progress = 1;
      squash = 1 - .08 * Math.sin(Math.PI * (hopTime - bound.push - bound.flight) / bound.landing);
      pose = 4;
      boundPhase = 'landing';
    }
    const travelled = stepStart + stepLength * progress;
    let distance = travelled;
    for (const segment of segments) {
      if (distance <= segment.length) {
        const p = distance / segment.length;
        return {x: segment.start[0] + (segment.end[0] - segment.start[0]) * p, y: segment.start[1] + (segment.end[1] - segment.start[1]) * p, action: 'walking', frame: pose, flip: segment.end[0] < segment.start[0], distance: travelled, height, squash, boundPhase};
      }
      distance -= segment.length;
    }
    return sample(0);
  }
  function crew(time) {
    return [{id: 'teal', name: 'Astra', ...sample(time)}, {id: 'amber', name: 'Sol', ...sample(time, period / 2)}];
  }
  function advance(time, elapsed, paused, hidden) { return time + (paused || hidden ? 0 : Math.min(Math.max(elapsed, 0), 0.08)); }
  const api = {points, segments, period, speed, bound, routeLength, sample, crew, advance};
  root.LunarSimulation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
