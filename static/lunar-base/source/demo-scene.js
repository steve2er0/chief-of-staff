/* Isolated Canvas renderer. All activity below is scripted synthetic state. */
(function () {
  'use strict';
  const canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
  const sim = window.LunarSimulation, motion = matchMedia('(prefers-reduced-motion: reduce)');
  const images = {}, loading = document.querySelector('#loading');
  let time = 4, previous = 0, paused = motion.matches, selected = '', latestCrew = sim.crew(time);
  const objects = {
    habitat: {x: 191, y: 130, width: 410, height: 255, depth: 383},
    console: {x: 154, y: 300, width: 86, height: 95, depth: 395}
  };
  const metadata = {
    teal: ['CREW / 01 · TEAL SUIT', 'Astra', 'Astra follows the circuit in gentle lunar bounds, then takes a turn at the research console. All activity is a scripted visual demonstration.'],
    amber: ['CREW / 02 · AMBER SUIT', 'Sol', 'Sol explores the foreground and takes the next console shift. The suit colour keeps the two crew members discernible as their paths continue.'],
    habitat: ['HABITAT / A-01', 'Tranquility habitat', 'A single warm-lit habitat, with a rooftop array, communications dish and airlock ramp. Its artwork is a separate transparent asset with no baked-in crew.'],
    console: ['WORK AREA / C-01', 'Research console', 'Astra and Sol take turns here. Typing uses a separate planted-foot animation, and the work area stays still. All console activity is synthetic.']
  };
  function updateMotion() {
    document.querySelector('#pause').textContent = paused ? 'Resume motion' : 'Pause motion';
    document.querySelector('#pause').setAttribute('aria-pressed', String(paused));
    document.querySelector('#motion-state').textContent = paused ? (motion.matches ? 'Paused · reduced motion' : 'Motion paused') : 'Bounding & working';
  }
  function select(id) {
    selected = id;
    const data = metadata[id];
    document.querySelector('#detail-kicker').textContent = data[0];
    document.querySelector('#detail-title').textContent = data[1];
    document.querySelector('#detail-body').textContent = data[2];
    document.querySelectorAll('[data-entity]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.entity === id)));
    updateDetail();
    draw();
  }
  function updateDetail() {
    const astronaut = latestCrew.find(a => a.id === selected);
    document.querySelector('#detail-status').textContent = astronaut ? 'Demo state · ' + (astronaut.boundPhase || astronaut.action) : 'Synthetic activity';
  }
  function shadow(x, y, width, alpha = .30) {
    ctx.fillStyle = 'rgba(23,25,55,' + alpha + ')';
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), width, width * .25, -.15, 0, Math.PI * 2); ctx.fill();
  }
  function selectionRing(x, y, width, colour) {
    ctx.strokeStyle = colour; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y) + 1, width, width * .28, 0, 0, Math.PI * 2); ctx.stroke();
  }
  function renderAstronaut(agent) {
    const x = Math.round(agent.x), y = Math.round(agent.y);
    if (selected === agent.id) selectionRing(x, y, 15, agent.id === 'teal' ? '#60e2eb' : '#ffc265');
    ctx.save(); ctx.translate(x, y - agent.height);
    if (agent.flip) ctx.scale(-1, 1);
    ctx.scale(1, agent.squash);
    const row = {walking: 0, idle: 1, working: 2}[agent.action];
    ctx.drawImage(images[agent.id], agent.frame * 64, row * 64, 64, 64, -32, -58, 64, 64);
    ctx.restore();
  }
  function draw() {
    if (!images.terrain) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(images.terrain, 0, 0, 768, 512);
    // Small inset route markers sit on the floor and never obscure a sprite.
    ctx.fillStyle = '#d3a05baa';
    for (const [x, y] of [[250,420],[328,415],[402,409],[490,402]]) ctx.fillRect(x, y, 3, 1);
    shadow(366, 367, 165, .28); shadow(195, 391, 36, .34);
    for (const agent of latestCrew) shadow(agent.x - 6, agent.y, 13 - agent.height * .16, .30 - agent.height * .008);
    if (selected === 'habitat') selectionRing(385, 379, 169, '#6ed6db');
    if (selected === 'console') selectionRing(197, 395, 38, '#6ed6db');
    const drawables = Object.entries(objects).map(([id, object]) => ({depth: object.depth, draw: () => ctx.drawImage(images[id], object.x, object.y, object.width, object.height)}));
    for (const agent of latestCrew) drawables.push({depth: agent.y, draw: () => renderAstronaut(agent)});
    drawables.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  }
  function loop(timestamp) {
    if (previous) time = sim.advance(time, (timestamp - previous) / 1000, paused, document.hidden);
    previous = timestamp;
    latestCrew = sim.crew(time);
    draw(); updateDetail();
    requestAnimationFrame(loop);
  }
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 768 / rect.width, y = (event.clientY - rect.top) * 512 / rect.height;
    const agent = [...latestCrew].reverse().find(a => Math.abs(a.x - x) < 23 && y >= a.y - a.height - 54 && y <= a.y - a.height + 5);
    if (agent) return select(agent.id);
    for (const id of ['console', 'habitat']) {
      const object = objects[id];
      if (x >= object.x && x <= object.x + object.width && y >= object.y && y <= object.y + object.height) return select(id);
    }
  });
  document.querySelectorAll('[data-entity]').forEach(button => button.addEventListener('click', () => select(button.dataset.entity)));
  function toggle() { paused = !paused; updateMotion(); }
  document.querySelector('#pause').addEventListener('click', toggle);
  canvas.addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); toggle(); } });
  motion.addEventListener('change', event => { if (event.matches) { paused = true; updateMotion(); } });
  document.addEventListener('visibilitychange', () => { previous = 0; });
  updateMotion();
  Promise.all(Object.entries({terrain:'terrain', habitat:'habitat', console:'console', teal:'astronaut-teal', amber:'astronaut-amber'}).map(([key, name]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Missing scene asset: ' + name));
    image.src = './assets/' + name + '.png';
  }))).then(() => { loading.hidden = true; requestAnimationFrame(loop); }).catch(error => { loading.textContent = error.message + '. Reload or check the local demo files.'; });
})();
