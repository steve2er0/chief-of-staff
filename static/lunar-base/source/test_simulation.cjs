/* Dependency-free checks for movement and motion policy. */
const assert = require('node:assert/strict');
const sim = require('../simulation.js');
let minSeparation = Infinity;
let working = new Set(), walking = new Set(), poses = new Set();
for (let time = 0; time < sim.period * 2; time += 1 / 60) {
  const agents = sim.crew(time);
  minSeparation = Math.min(minSeparation, Math.hypot(agents[0].x - agents[1].x, agents[0].y - agents[1].y));
  assert(agents.filter(a => a.action === 'working').length <= 1, 'one console operator at a time');
  for (const agent of agents) {
    assert(agent.x >= 120 && agent.x <= 620 && agent.y >= 395 && agent.y <= 490, 'crew stays in foreground viewport');
    assert(Number.isInteger(agent.frame) && agent.frame >= 0 && agent.frame < 6);
    if (agent.action === 'working') working.add(agent.id);
    if (agent.action === 'walking') { walking.add(agent.id); poses.add(agent.frame); }
  }
}
assert(minSeparation > 52, 'crew sprites stay clearly separated');
assert.equal(working.size, 2); assert.equal(walking.size, 2); assert.equal(poses.size, 6);
for (let time = 0; time < sim.period; time += .001) {
  const a = sim.sample(time), b = sim.sample(time + .001);
  assert(Math.hypot(a.x - b.x, a.y - b.y) <= sim.speed * .001 + .00001, 'continuous bounded airborne speed, including corners and cycle boundary');
}
const start = 15;
for (const t of [.05, .15, .30]) {
  const a = sim.sample(start + t), b = sim.sample(start + t + .02);
  assert.equal(a.x, b.x); assert.equal(a.y, b.y);
  assert.equal(a.height, 0); assert.equal(a.boundPhase, 'push-off');
}
const apex = sim.sample(start + sim.bound.push + sim.bound.flight / 2);
assert(Math.abs(apex.height - sim.bound.height) < 1e-8); assert.equal(apex.boundPhase, 'floating');
const landed = sim.sample(start + sim.bound.push + sim.bound.flight + .15);
const laterLanding = sim.sample(start + sim.bound.push + sim.bound.flight + .20);
assert.equal(landed.x, laterLanding.x); assert.equal(landed.y, laterLanding.y);
assert.equal(landed.height, 0); assert.equal(landed.boundPhase, 'landing');
assert(sim.bound.flight > sim.bound.push + sim.bound.landing, 'prolonged lunar float');
assert.equal(sim.sample(4).height, 0, 'console work is planted');
assert.equal(sim.advance(10, 1, true, false), 10, 'pause freezes time');
assert.equal(sim.advance(10, 1, false, true), 10, 'background tab freezes time');
assert.equal(sim.advance(10, 1, false, false), 10.08, 'elapsed time is bounded after a slow frame');
console.log('PASS: planted push-off/landing, prolonged float, continuous route, six poses, two planted console shifts, separation, pause and hidden-tab clock. Minimum separation:', minSeparation.toFixed(1));
