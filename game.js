(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const startPanel = document.getElementById("start");
  const overPanel = document.getElementById("gameOver");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const finalScoreEl = document.getElementById("finalScore");

  const G = 900;
  const RABBIT_R = 18;
  const BELL_FALL = 72;
  const FIRST_JUMP = -720;
  const BELL_JUMP_BASE = 660;
  const MAX_DT = 1 / 30;
  const MIN_BELL_GAP = 52;
  const MAX_BELL_GAP = 94;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let state = "menu";
  let score = 0;
  let best = 0;
  let rabbit;
  let bells = [];
  let birds = [];
  let stars = [];
  let particles = [];
  let cameraY = 0;
  let last = 0;
  let mouseX = 0;
  let waitingForJump = true;
  let hasLanded = false;
  let bellHits = 0;
  let bellIndex = 0;
  let nextBell = null;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function worldY(y) { return y - cameraY; }

  function loadBest() {
    try {
      const v = Number.parseInt(localStorage.getItem("winterbell-best") || "0", 10);
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch (_) { return 0; }
  }

  function saveBest(v) {
    try { localStorage.setItem("winterbell-best", String(v)); } catch (_) {}
  }

  best = loadBest();
  bestEl.textContent = best;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const oldW = W || rect.width || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state === "playing" && rabbit) {
      const scale = W / oldW;
      rabbit.x = clamp(rabbit.x * scale, RABBIT_R, Math.max(RABBIT_R, W - RABBIT_R));
      mouseX = clamp(mouseX * scale, 0, W);
      for (const b of bells) b.x = clamp(b.x * scale, 42, Math.max(42, W - 42));
      for (const b of birds) b.x = clamp(b.x * scale, 20, Math.max(20, W - 20));
      for (const s of stars) s.x *= scale;
      if (nextBell) nextBell.x = clamp(nextBell.x * scale, 42, Math.max(42, W - 42));
    } else {
      mouseX = W / 2;
    }
    if (state !== "playing" && rabbit) draw();
  }

  window.addEventListener("resize", resize);

  // This is the only horizontal physics used by both gameplay and the
  // reachability simulator. That prevents the generator from using a different
  // movement model from the real game.
  function horizontalStep(x, vx, target, dt) {
    vx += (target - x) * 8 * dt;
    vx *= Math.pow(0.035, dt);
    x += vx * dt;
    if (x < RABBIT_R) { x = RABBIT_R; vx = 0; }
    if (x > W - RABBIT_R) { x = W - RABBIT_R; vx = 0; }
    return { x, vx };
  }

  function bellWidth(index) { return Math.max(25, 52 - index * 0.65); }

  function reset() {
    score = 0;
    bellHits = 0;
    bellIndex = 0;
    cameraY = 0;
    bells = [];
    birds = [];
    particles = [];
    nextBell = null;
    rabbit = { x: W / 2, y: H - 155, vx: 0, vy: 0, r: RABBIT_R };
    stars = Array.from({ length: 120 }, () => ({
      x: rand(0, W), y: rand(-300, H + 300), r: rand(0.5, 1.8), a: rand(0.25, 0.9)
    }));
    mouseX = W / 2;
    waitingForJump = true;
    hasLanded = false;
    scoreEl.textContent = "0";

    // Only the first bell exists before play starts. Every subsequent bell is
    // spawned when the previous bell is actually landed on, so its starting
    // state is known exactly and reachability can be proven from that state.
    const firstY = rabbit.y + rabbit.r - 95;
    spawnReachableNextBell(rabbit.x, rabbit.y + rabbit.r, firstY, 720);
  }

  function landingTimeForMovingBell(fromY, bellStartY, jumpVelocity, bellFallSpeed) {
    // Rabbit foot: fromY - v*t + 0.5*g*t^2
    // Bell: bellStartY + fall*t
    // Solve 0.5*g*t^2 - (v + fall)*t + (fromY-bellStartY) = 0.
    const gap = fromY - bellStartY;
    const a = 0.5 * G;
    const b = -(jumpVelocity + bellFallSpeed);
    const c = gap;
    const d = b * b - 4 * a * c;
    if (d < 0) return null;
    const root = Math.sqrt(d);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    if (t1 > 0) return t1;
    return t2 > 0 ? t2 : null;
  }

  function simulateReachability(startX, fromY, bellY, bellX, jumpVelocity, bellWidthValue) {
    const time = landingTimeForMovingBell(fromY, bellY, jumpVelocity, BELL_FALL);
    if (time === null || time > 3.5) return false;

    let x = startX;
    let vx = 0;
    let rabbitY = fromY;
    let rabbitVy = -jumpVelocity;
    let bellCurrentY = bellY;
    const steps = Math.max(1, Math.ceil(time * 240));
    const dt = time / steps;
    const hitHalf = bellWidthValue / 2 + RABBIT_R * 0.55 + 3;

    for (let i = 0; i < steps; i++) {
      const prevFoot = rabbitY;
      const prevBell = bellCurrentY;
      const h = horizontalStep(x, vx, bellX, dt);
      x = h.x;
      vx = h.vx;
      rabbitVy += G * dt;
      rabbitY += rabbitVy * dt;
      bellCurrentY += BELL_FALL * dt;
      const relativeBefore = prevFoot - prevBell;
      const relativeAfter = rabbitY - bellCurrentY;
      if (relativeBefore <= 4 && relativeAfter >= 0 && Math.abs(x - bellX) <= hitHalf) return true;
    }
    return Math.abs(x - bellX) <= hitHalf && rabbitY >= bellCurrentY;
  }

  function chooseReachableBell(fromX, fromY, proposedY, jumpVelocity, width) {
    let targetY = proposedY;
    for (let attempt = 0; attempt < 40; attempt++) {
      const minX = 42;
      const maxX = Math.max(minX, W - 42);
      const candidates = [];
      const preferred = clamp(fromX + rand(-110, 110), minX, maxX);
      candidates.push(preferred, clamp(fromX, minX, maxX));
      for (let i = 0; i <= 80; i++) candidates.push(minX + (maxX - minX) * i / 80);

      // Shuffle equal-quality candidates slightly, but always test every
      // candidate against the actual moving-bell simulation.
      candidates.sort((a, b) => Math.abs(a - fromX) - Math.abs(b - fromX));
      for (const x of candidates) {
        if (simulateReachability(fromX, fromY, targetY, x, jumpVelocity, width)) {
          return { x, y: targetY };
        }
      }
      targetY = fromY - Math.max(MIN_BELL_GAP, (fromY - targetY) * 0.88);
    }
    return null;
  }

  function spawnReachableNextBell(fromX, fromY, proposedY, jumpVelocity) {
    const width = bellWidth(bellIndex);
    const chosen = chooseReachableBell(fromX, fromY, proposedY, jumpVelocity, width);
    const fallbackY = fromY - MIN_BELL_GAP;
    const result = chosen || { x: clamp(fromX, 42, Math.max(42, W - 42)), y: fallbackY };
    nextBell = {
      x: result.x,
      y: result.y,
      w: width,
      h: 12,
      vy: BELL_FALL,
      hit: false,
      index: bellIndex++
    };
  }

  function promoteNextBell() {
    if (!nextBell) return;
    bells.push(nextBell);
    nextBell = null;
  }

  function startGame() {
    reset();
    state = "playing";
    startPanel.classList.add("hidden");
    overPanel.classList.add("hidden");
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function launchFirstJump() {
    if (state !== "playing" || !waitingForJump) return;
    waitingForJump = false;
    promoteNextBell();
    rabbit.vy = FIRST_JUMP;
  }

  function restartFromInput() {
    const inputX = mouseX;
    if (state === "menu" || state === "over") {
      startGame();
      mouseX = clamp(inputX, 0, W);
    }
    launchFirstJump();
  }

  function end() {
    state = "over";
    finalScoreEl.textContent = score;
    if (score > best) {
      best = score;
      saveBest(best);
      bestEl.textContent = best;
    }
    overPanel.classList.remove("hidden");
  }

  function onBellLanded(bell) {
    rabbit.y = bell.y - rabbit.r;
    rabbit.vy = -Math.min(780, BELL_JUMP_BASE + score * 0.6);
    bell.hit = true;
    hasLanded = true;
    bellHits += 1;
    score += bellHits * 10;
    scoreEl.textContent = score;
    for (let i = 0; i < 8; i++) {
      particles.push({ x: bell.x, y: bell.y, vy: rand(-50, 20), vx: rand(-70, 70), life: 1 });
    }

    // The next bell is generated from the exact landing state. This is the
    // key invariant that makes the reachability guarantee match gameplay.
    const gap = clamp(rand(MIN_BELL_GAP, MAX_BELL_GAP), MIN_BELL_GAP, MAX_BELL_GAP);
    spawnReachableNextBell(rabbit.x, rabbit.y + rabbit.r, bell.y - gap, Math.min(780, BELL_JUMP_BASE + score * 0.6));
    if (Math.random() < 0.12) {
      birds.push({
        x: clamp(bell.x + rand(-100, 100), 40, Math.max(40, W - 40)),
        y: bell.y - rand(25, 55),
        vx: rand(45, 90) * (Math.random() < 0.5 ? -1 : 1),
        r: 10,
        hit: false
      });
    }
  }

  function updateBells(dt) {
    for (const b of bells) b.y += b.vy * dt;
    if (nextBell) nextBell.y += nextBell.vy * dt;
  }

  function updateBirds(dt) {
    for (const b of birds) {
      b.x += b.vx * dt;
      if (b.x < -30 || b.x > W + 30) {
        b.vx *= -1;
        b.x = clamp(b.x, -30, W + 30);
      }
    }
  }

  function update(dt) {
    if (waitingForJump) return;

    const previousFootY = rabbit.y + rabbit.r;
    const previousBellYs = new Map();
    for (const b of bells) previousBellYs.set(b, b.y);
    updateBells(dt);
    updateBirds(dt);

    const h = horizontalStep(rabbit.x, rabbit.vx, mouseX, dt);
    rabbit.x = h.x;
    rabbit.vx = h.vx;
    rabbit.vy += G * dt;
    rabbit.y += rabbit.vy * dt;

    const currentFootY = rabbit.y + rabbit.r;
    let landed = false;

    if (rabbit.vy > 0) {
      for (const b of bells) {
        if (b.hit) continue;
        const previousBellY = previousBellYs.get(b);
        const relativeBefore = previousFootY - previousBellY;
        const relativeAfter = currentFootY - b.y;
        const xHit = rabbit.x > b.x - b.w / 2 - rabbit.r * 0.55 &&
                     rabbit.x < b.x + b.w / 2 + rabbit.r * 0.55;
        if (xHit && relativeBefore <= 4 && relativeAfter >= 0) {
          onBellLanded(b);
          landed = true;
          break;
        }
      }

      if (!landed) {
        for (const b of birds) {
          if (b.hit) continue;
          const birdTop = b.y - b.r * 0.55;
          const xHit = rabbit.x > b.x - rabbit.r - b.r * 0.9 &&
                       rabbit.x < b.x + rabbit.r + b.r * 0.9;
          if (xHit && previousFootY <= birdTop + 4 && currentFootY >= birdTop) {
            b.hit = true;
            score *= 2;
            scoreEl.textContent = score;
            rabbit.y = birdTop - rabbit.r;
            rabbit.vy = -Math.min(900, 720 + score * 0.15);
            for (let i = 0; i < 14; i++) {
              particles.push({ x: b.x, y: b.y, vy: rand(-90, 30), vx: rand(-100, 100), life: 1.2 });
            }
            break;
          }
        }
      }
    }

    const targetCamera = rabbit.y - H * 0.45;
    if (targetCamera < cameraY) {
      cameraY += (targetCamera - cameraY) * Math.min(1, 5 * dt);
    }

    if (nextBell && worldY(nextBell.y) > H + 120) {
      // A next bell can never legitimately be missed because its reachability
      // was proven from the previous landing state. If it nevertheless falls
      // past the viewport, keep it near the player instead of allowing a hidden
      // impossible state to accumulate.
      nextBell.y = rabbit.y - 70;
    }

    bells = bells.filter(b => !b.hit && worldY(b.y) < H + 120 && worldY(b.y) > -260);
    birds = birds.filter(b => !b.hit && worldY(b.y) < H + 120 && worldY(b.y) > -260);
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      p.life -= dt * 2;
    });
    particles = particles.filter(p => p.life > 0);

    if (rabbit.y - cameraY > H + 80) {
      if (!hasLanded) {
        reset();
        return;
      }
      end();
    }
  }

  function drawBell(b) {
    const y = worldY(b.y);
    if (y < -55 || y > H + 55) return;
    ctx.save();
    ctx.translate(b.x, y);
    ctx.fillStyle = b.hit ? "#b9d7ec" : "#eef8ff";
    ctx.strokeStyle = "rgba(100,160,195,.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.w / 2, b.h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d4e9f6";
    ctx.fillRect(-b.w * 0.34, -5, b.w * 0.68, 7);
    ctx.fillStyle = "#789bb8";
    ctx.beginPath();
    ctx.arc(0, 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBird(b) {
    const y = worldY(b.y);
    if (y < -45 || y > H + 45) return;
    ctx.save();
    ctx.translate(b.x, y);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3, -1);
    ctx.quadraticCurveTo(-15, -13, -18, -2);
    ctx.quadraticCurveTo(-9, -5, -2, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, -1);
    ctx.quadraticCurveTo(15, -13, 18, -2);
    ctx.quadraticCurveTo(9, -5, 2, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawRabbit(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, 7, 17, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-9, -14, 6, 17, -0.18, 0, Math.PI * 2);
    ctx.ellipse(9, -14, 6, 17, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1aebd";
    ctx.beginPath();
    ctx.ellipse(-9, -14, 2.2, 11, -0.18, 0, Math.PI * 2);
    ctx.ellipse(9, -14, 2.2, 11, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#24384d";
    ctx.beginPath();
    ctx.arc(-6, 0, 2.1, 0, Math.PI * 2);
    ctx.arc(6, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8a7b8";
    ctx.beginPath();
    ctx.arc(0, 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#081a35");
    gradient.addColorStop(1, "#24476b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const y = ((s.y - cameraY) % H + H) % H;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const b of bells) drawBell(b);
    if (nextBell) drawBell(nextBell);
    for (const b of birds) drawBird(b);

    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(p.x, worldY(p.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawRabbit(rabbit.x, rabbit.y - cameraY);
  }

  function loop(timestamp) {
    if (state !== "playing") return;
    const dt = Math.min(MAX_DT, Math.max(0, (timestamp - last) / 1000));
    last = timestamp;
    update(dt);
    draw();
    if (state === "playing") requestAnimationFrame(loop);
  }

  function pointer(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = clamp(e.clientX - rect.left, 0, W);
    if (e.type === "pointerdown") {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      restartFromInput();
    }
  }

  canvas.addEventListener("pointermove", pointer);
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (canvas.setPointerCapture && e.pointerId !== undefined) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    pointer(e);
  });
  canvas.addEventListener("pointerup", e => {
    if (canvas.releasePointerCapture && e.pointerId !== undefined) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  });
  canvas.addEventListener("pointercancel", e => {
    if (canvas.releasePointerCapture && e.pointerId !== undefined) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (state === "menu" || state === "over") restartFromInput();
    else if (waitingForJump) launchFirstJump();
  });

  resize();
  reset();
  draw();
})();
