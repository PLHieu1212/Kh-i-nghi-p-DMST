(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("scene");
  const ctx = canvas.getContext("2d");
  const tuning = {
    batteryDrainPerSecond: 0.19,
    shakeCount: 4,
    shakeWindowMs: 1050,
    threatSeconds: 3,
    stunMs: 7200,
    monsterMoveSeconds: 14
  };
  const nodes = {
    lobby: { name: "Sảnh đợi", links: ["east", "west"], room: "lobby" },
    east: { name: "Hành lang Đông", links: ["lobby", "storage", "machine"], room: "hall" },
    west: { name: "Hành lang Tây", links: ["lobby", "nursery"], room: "hall" },
    storage: { name: "Kho vật tư", links: ["east", "machine"], room: "storage", item: "fuse" },
    nursery: { name: "Phòng trực", links: ["west", "machine"], room: "nursery", item: "fuse" },
    machine: { name: "Phòng máy", links: ["east", "storage", "nursery", "exit"], room: "machine", item: "fuse" },
    exit: { name: "Cửa thoát hiểm", links: ["machine"], room: "exit" }
  };
  const roomDecor = {
    lobby: { sign: "KHU A  ·  LỐI VÀO", accent: "#666e61" },
    hall: { sign: "ĐƯỜNG HẦM 04", accent: "#59675e" },
    storage: { sign: "KHO VẬT TƯ", accent: "#6d6655" },
    nursery: { sign: "PHÒNG TRỰC", accent: "#536c65" },
    machine: { sign: "MÁY PHÁT  ·  KHU B", accent: "#796746" },
    exit: { sign: "LỐI THOÁT", accent: "#764949" }
  };
  const state = {
    started: false, ended: false, won: false, current: "lobby", nv: false,
    battery: 100, collected: new Set(), restored: false, elapsed: 0,
    monster: "machine", stunnedUntil: 0, threatUntil: 0, threatStarted: false,
    yaw: 0, shakeHits: [], lastShakeDirection: 0, lastShakeAt: 0,
    toastTimeout: null, lastFrame: 0, moveCount: 0, sound: null, lastNavSignature: "",
    flashUntil: 0, nextMonsterMoveAt: tuning.monsterMoveSeconds
  };
  let width = 0, height = 0, dpr = 1, animationId = 0;
  let lastNoiseAt = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function noise() {
    const count = Math.floor(width * height / 850);
    ctx.save();
    ctx.globalAlpha = state.nv ? 0.11 : 0.035;
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = Math.random() > 0.5 ? "#ddffe0" : "#101810";
      ctx.fillRect(Math.random() * width, Math.random() * height, 1.2, 1.2);
    }
    ctx.restore();
  }

  function draw() {
    if (!width || !height) return;
    const now = performance.now();
    if (now - lastNoiseAt > 90) lastNoiseAt = now;
    const nightVision = state.nv && state.started && !state.ended;
    const centerX = width / 2;
    const horizon = height * 0.47;
    const decor = roomDecor[nodes[state.current].room];

    ctx.clearRect(0, 0, width, height);
    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, nightVision ? "#192a1d" : "#080a09");
    wall.addColorStop(0.7, nightVision ? "#26372a" : "#101311");
    wall.addColorStop(1, nightVision ? "#0e160f" : "#050606");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, width, height);

    const shift = Math.sin(state.yaw) * width * 0.15;
    ctx.save();
    ctx.translate(shift, 0);
    ctx.fillStyle = nightVision ? "#25342a" : "#111412";
    ctx.beginPath();
    ctx.moveTo(width * 0.12, 0);
    ctx.lineTo(width * 0.88, 0);
    ctx.lineTo(width * 0.67, horizon);
    ctx.lineTo(width * 0.33, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = nightVision ? "#1b291f" : "#0a0c0b";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width * 0.67, horizon);
    ctx.lineTo(width * 0.33, horizon);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = nightVision ? "#849d86" : "#343a36";
    ctx.globalAlpha = nightVision ? 0.27 : 0.18;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = width * i / 6;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(centerX + (x - centerX) * 0.42, horizon); ctx.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const y = horizon + (height - horizon) * i / 6;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = nightVision ? "#536453" : "#282e2a";
    ctx.fillRect(width * 0.48 - 1, height * 0.13, 2, height * 0.28);
    ctx.fillStyle = nightVision ? "#becd9d" : "#353833";
    ctx.fillRect(width * 0.48 - 8, height * 0.12, 16, 5);
    if (nightVision) {
      ctx.shadowColor = "#a3ff9b";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "#baffae";
      ctx.fillRect(width * 0.48 - 2, height * 0.13, 4, 3);
      ctx.shadowBlur = 0;
    }

    if (nodes[state.current].room === "hall") drawHall(width, height, nightVision);
    else drawRoomProps(width, height, nightVision, decor);
    drawDoorways(width, height, nightVision);

    const monsterPresent = state.monster === state.current && performance.now() > state.stunnedUntil;
    const relative = getMonsterAngle();
    const monsterX = centerX + Math.sin(relative) * width * 0.48;
    const monsterVisible = monsterPresent && nightVision && Math.abs(relative) < 1.18;
    if (monsterVisible) drawMonster(monsterX, height * 0.68, Math.abs(relative));
    if (nightVision && nodes[state.current].item === "fuse" && !state.collected.has(state.current)) drawFuse(centerX + width * 0.27, height * 0.73);
    if (nightVision && state.current === "machine" && !state.restored) drawFuse(centerX, height * 0.63);

    ctx.restore();
    if (!nightVision) {
      const darknessOverlay = ctx.createRadialGradient(centerX, height * 0.54, 2, centerX, height * 0.54, width * 0.55);
      darknessOverlay.addColorStop(0, "rgba(0,0,0,0.84)");
      darknessOverlay.addColorStop(0.48, "rgba(0,0,0,0.95)");
      darknessOverlay.addColorStop(1, "rgba(0,0,0,0.99)");
      ctx.fillStyle = darknessOverlay;
      ctx.fillRect(0, 0, width, height);
      if (state.started && !state.ended) {
        ctx.fillStyle = "#a1b9a2";
        ctx.globalAlpha = 0.18;
        ctx.beginPath(); ctx.arc(centerX, height * 0.53, 26, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const overlay = ctx.createRadialGradient(centerX, height * 0.45, width * 0.04, centerX, height * 0.45, width * 0.72);
      overlay.addColorStop(0, "rgba(130,255,140,0.09)");
      overlay.addColorStop(1, "rgba(0,0,0,0.24)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);
    }
    if (state.flashUntil > now) {
      ctx.fillStyle = `rgba(211,255,207,${Math.min(0.82, (state.flashUntil - now) / 115)})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (state.started && Math.random() < 0.025) {
      ctx.fillStyle = "#d5ffd9";
      ctx.globalAlpha = 0.08 + Math.random() * 0.1;
      ctx.fillRect(0, Math.random() * height, width, 1 + Math.random() * 3);
      ctx.globalAlpha = 1;
    }
    noise();
  }

  function drawHall(w, h, nv) {
    const center = w / 2;
    ctx.fillStyle = nv ? "#111b14" : "#090b0a";
    ctx.beginPath();
    ctx.moveTo(w * 0.29, h * 0.17); ctx.lineTo(w * 0.71, h * 0.17);
    ctx.lineTo(w * 0.57, h * 0.71); ctx.lineTo(w * 0.43, h * 0.71);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = nv ? "#8b9b8a" : "#393d3a";
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.14, h * 0.18); ctx.lineTo(w * 0.29, h * 0.17); ctx.lineTo(w * 0.43, h * 0.71); ctx.lineTo(w * 0.03, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.86, h * 0.18); ctx.lineTo(w * 0.71, h * 0.17); ctx.lineTo(w * 0.57, h * 0.71); ctx.lineTo(w * 0.97, h); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i += 1) {
      const yy = h * (0.28 + i * 0.12);
      const scale = 1 - i * 0.14;
      ctx.fillStyle = nv ? "#3d4d40" : "#202522";
      ctx.fillRect(w * 0.17, yy, 24 * scale, 4 * scale);
      ctx.fillRect(w * 0.83 - 24 * scale, yy, 24 * scale, 4 * scale);
    }
    ctx.fillStyle = nv ? "#536253" : "#242825";
    ctx.fillRect(center - 10, h * 0.18, 20, h * 0.42);
  }

  function drawRoomProps(w, h, nv, decor) {
    const accent = decor.accent;
    ctx.fillStyle = nv ? "#4b5a4a" : "#222622";
    ctx.fillRect(w * 0.13, h * 0.27, w * 0.18, h * 0.16);
    ctx.fillRect(w * 0.69, h * 0.3, w * 0.18, h * 0.15);
    ctx.fillStyle = nv ? accent : "#262a27";
    ctx.fillRect(w * 0.15, h * 0.3, w * 0.14, h * 0.12);
    ctx.fillRect(w * 0.71, h * 0.33, w * 0.14, h * 0.11);
    ctx.fillStyle = nv ? "#314033" : "#181b19";
    ctx.fillRect(w * 0.17, h * 0.32, w * 0.1, h * 0.08);
    ctx.fillRect(w * 0.73, h * 0.35, w * 0.1, h * 0.07);
    ctx.fillStyle = nv ? "#c4d2b2" : "#626860";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(decor.sign, w / 2, h * 0.29);

    if (nodes[state.current].room === "storage") {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = nv ? "#354437" : "#1a1e1b";
        ctx.fillRect(w * (0.22 + i * 0.2), h * 0.58, w * 0.13, h * 0.17);
        ctx.strokeStyle = nv ? "#718372" : "#343b35";
        ctx.strokeRect(w * (0.22 + i * 0.2), h * 0.58, w * 0.13, h * 0.17);
      }
    } else if (nodes[state.current].room === "machine") {
      ctx.fillStyle = nv ? "#4e5948" : "#252a26";
      ctx.fillRect(w * 0.38, h * 0.44, w * 0.24, h * 0.32);
      ctx.strokeStyle = nv ? "#829478" : "#454943";
      ctx.strokeRect(w * 0.38, h * 0.44, w * 0.24, h * 0.32);
      ctx.fillStyle = nv ? "#b8d08c" : "#6e704c";
      ctx.fillRect(w * 0.42, h * 0.51, 5, 5);
      ctx.fillRect(w * 0.52, h * 0.51, 5, 5);
      ctx.fillRect(w * 0.42, h * 0.62, w * 0.15, 2);
    } else if (nodes[state.current].room === "nursery") {
      ctx.fillStyle = nv ? "#354237" : "#181d1a";
      ctx.fillRect(w * 0.28, h * 0.61, w * 0.44, h * 0.09);
      ctx.fillRect(w * 0.31, h * 0.7, 5, h * 0.11);
      ctx.fillRect(w * 0.68, h * 0.7, 5, h * 0.11);
    } else if (nodes[state.current].room === "exit") {
      ctx.strokeStyle = nv ? "#8b9e8c" : "#4b514c";
      ctx.lineWidth = 5;
      ctx.strokeRect(w * 0.38, h * 0.18, w * 0.24, h * 0.53);
      ctx.fillStyle = nv ? "#aaff9c" : "#5c665b";
      ctx.fillRect(w * 0.57, h * 0.44, 4, 4);
    }
  }

  function drawDoorways(w, h, nv) {
    ctx.strokeStyle = nv ? "#79897a" : "#424640";
    ctx.globalAlpha = nv ? 0.45 : 0.24;
    ctx.lineWidth = Math.max(2, w * 0.004);
    const y = h * 0.35;
    ctx.strokeRect(w * 0.055, y, w * 0.12, h * 0.39);
    ctx.strokeRect(w * 0.825, y, w * 0.12, h * 0.39);
    ctx.globalAlpha = 1;
  }

  function drawMonster(x, ground, distance) {
    const scale = Math.max(0.68, 1 - distance * 0.3);
    const bodyH = height * 0.36 * scale;
    const bodyW = bodyH * 0.48;
    ctx.save();
    ctx.translate(x, ground);
    ctx.shadowColor = "#9effa2";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#050706";
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.16, bodyW * 0.43, bodyH * 0.53, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.83, bodyW * 0.24, bodyW * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#101810";
    ctx.lineWidth = bodyW * 0.2;
    ctx.beginPath(); ctx.moveTo(-bodyW * 0.23, -bodyH * 0.43); ctx.lineTo(-bodyW * 0.54, -bodyH * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bodyW * 0.23, -bodyH * 0.43); ctx.lineTo(bodyW * 0.47, -bodyH * 0.04); ctx.stroke();
    ctx.fillStyle = "#d4ff92";
    ctx.shadowColor = "#cbff87";
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(-bodyW * 0.09, -bodyH * 0.85, 2.4 * scale, 1.4 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bodyW * 0.09, -bodyH * 0.85, 2.4 * scale, 1.4 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFuse(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "#dcff8c"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#d7e8ad";
    ctx.fillRect(-10, -4, 20, 8);
    ctx.fillStyle = "#8ea36e";
    ctx.fillRect(-13, -3, 4, 6); ctx.fillRect(9, -3, 4, 6);
    ctx.restore();
  }

  function showToast(message, duration = 2400) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => toast.classList.add("hidden"), duration);
  }

  function getMonsterAngle() {
    return Math.atan2(Math.sin((state.monsterBearing || 0) - state.yaw), Math.cos((state.monsterBearing || 0) - state.yaw));
  }

  function updateHud() {
    $("room-name").textContent = nodes[state.current].name.toLocaleUpperCase("vi");
    $("battery-fill").style.width = `${Math.max(0, state.battery)}%`;
    $("battery-text").textContent = `${Math.ceil(state.battery)}%`;
    $("battery-state").textContent = state.battery < 20 ? "PIN YẾU" : (state.nv ? "ĐANG QUÉT" : "CHẾ ĐỘ NGHỈ");
    $("battery-state").style.color = state.battery < 20 ? "#ff8c81" : "";
    $("parts-count").textContent = state.collected.size;
    $("nv-button").setAttribute("aria-pressed", String(state.nv));
    $("threat").classList.toggle("hidden", !state.threatStarted || state.ended);
    const seconds = Math.max(0, (state.threatUntil - performance.now()) / 1000);
    $("threat-seconds").textContent = seconds.toFixed(1).padStart(4, "0");
    $("threat-fill").style.width = `${Math.max(0, seconds / tuning.threatSeconds * 100)}%`;
    $("shake-fill").style.width = `${Math.min(100, state.shakeHits.length / tuning.shakeCount * 100)}%`;
    const currentNode = nodes[state.current];
    const canCollectFuse = currentNode.item === "fuse" && !state.collected.has(state.current);
    const canCollectBattery = state.battery < 65 && (state.current === "storage" || state.current === "nursery") && !state.collected.has(`${state.current}-battery`);
    const canRestore = state.current === "machine" && state.collected.size === 3 && !state.restored;
    const canEscape = state.current === "exit" && state.restored;
    const navSignature = [state.current, state.started, state.ended, canCollectFuse, canCollectBattery, canRestore, canEscape].join(":");
    if (navSignature !== state.lastNavSignature) {
      state.lastNavSignature = navSignature;
      const nav = $("navigation");
      nav.replaceChildren();
      if (canCollectFuse) addAction(nav, "NHẶT CẦU CHÌ", collectFuse);
      if (canCollectBattery) addAction(nav, "NHẶT PIN DỰ PHÒNG", collectBattery);
      if (canRestore) addAction(nav, "LẮP CẦU CHÌ", restorePower);
      if (canEscape) addAction(nav, "MỞ CỬA THOÁT", win);
      nodes[state.current].links.forEach((id) => {
        const button = document.createElement("button");
        button.className = "nav-button";
        button.textContent = `→ ${nodes[id].name.toLocaleUpperCase("vi")}`;
        button.disabled = !state.started || state.ended;
        button.addEventListener("click", () => moveTo(id));
        nav.append(button);
      });
    }
  }

  function addAction(nav, label, action) {
    const button = document.createElement("button");
    button.className = "action-button";
    button.textContent = `＋ ${label}`;
    button.disabled = !state.started || state.ended;
    button.addEventListener("click", action);
    nav.prepend(button);
  }

  function setNightVision(enabled) {
    if (!state.started || state.ended) return;
    if (enabled && state.battery <= 0) {
      showToast("PIN THỊ LỰC ĐÃ CẠN — TÌM PIN DỰ PHÒNG");
      return;
    }
    state.nv = enabled;
    updateHud();
    draw();
  }

  function moveTo(id) {
    if (!state.started || state.ended || !nodes[state.current].links.includes(id)) return;
    state.current = id;
    state.yaw = 0;
    state.threatStarted = false;
    state.moveCount += 1;
    if (state.monster === id && performance.now() > state.stunnedUntil) {
      state.monsterBearing = (Math.random() - 0.5) * 0.9;
    }
    showToast(`VỊ TRÍ: ${nodes[id].name.toLocaleUpperCase("vi")}`, 1400);
    updateHud();
    draw();
  }

  function collectFuse() {
    if (state.collected.has(state.current)) return;
    state.collected.add(state.current);
    showToast(`ĐÃ THU THẬP CẦU CHÌ ${state.collected.size}/3`);
    updateHud();
    draw();
  }

  function collectBattery() {
    const key = `${state.current}-battery`;
    if (state.collected.has(key)) return;
    state.collected.add(key);
    state.battery = Math.min(100, state.battery + 38);
    showToast("PIN DỰ PHÒNG +38%");
    updateHud();
  }

  function restorePower() {
    if (state.collected.size !== 3) return;
    state.restored = true;
    showToast("MÁY PHÁT ĐÃ KHỞI ĐỘNG — ĐẾN CỬA THOÁT");
    state.monster = "west";
    state.monsterBearing = -0.3;
    updateHud();
    draw();
  }

  function win() {
    state.ended = true;
    state.won = true;
    $("end-kicker").textContent = "TÍN HIỆU KHÔI PHỤC";
    $("end-title").textContent = "BẠN ĐÃ THOÁT.";
    $("end-copy").textContent = `Máy phát đã hoạt động và bạn rời khỏi đường hầm sau ${formatTime(state.elapsed)}. Bản ghi ca trực đã được lưu.`;
    $("end-card").classList.remove("hidden");
    updateHud();
    draw();
  }

  function lose(reason) {
    if (state.ended) return;
    state.ended = true;
    state.nv = false;
    $("end-kicker").textContent = "MẤT TÍN HIỆU";
    $("end-title").textContent = "CA TRỰC KẾT THÚC.";
    $("end-copy").textContent = reason || "Thứ đó đã đến quá gần. Đường hầm lại chìm vào bóng tối.";
    $("end-card").classList.remove("hidden");
    updateHud();
    draw();
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function beginThreat() {
    if (state.threatStarted) return;
    state.threatStarted = true;
    state.threatUntil = performance.now() + tuning.threatSeconds * 1000;
    sound("threat");
    showToast("CHUYỂN ĐỘNG PHÍA TRƯỚC — LẮC ĐÈN!", 1800);
  }

  function shake() {
    if (!state.started || state.ended) return;
    const now = performance.now();
    state.shakeHits = state.shakeHits.filter((time) => now - time < tuning.shakeWindowMs);
    if (now - state.lastShakeAt < 100) return;
    state.lastShakeAt = now;
    state.shakeHits.push(now);
    sound("click");
    if (state.shakeHits.length >= tuning.shakeCount) {
      state.shakeHits = [];
      flash();
    }
    updateHud();
  }

  function flash() {
    if (state.battery < 4) {
      showToast("ĐÈN PIN KHÔNG CÒN ĐIỆN");
      return;
    }
    state.battery -= 4;
    state.flashUntil = performance.now() + 115;
    const threat = state.nv && state.monster === state.current && performance.now() > state.stunnedUntil && Math.abs(getMonsterAngle()) < 0.48;
    if (threat) {
      state.stunnedUntil = performance.now() + tuning.stunMs;
      state.threatStarted = false;
      const retreats = nodes[state.current].links.filter((id) => id !== state.current);
      state.monster = retreats[Math.floor(Math.random() * retreats.length)] || "east";
      state.monsterBearing = (Math.random() - 0.5) * 1.4;
      showToast("TRÚNG ĐÍCH — ĐỐI TƯỢNG CHOÁNG, RÚT LUI!", 2400);
      sound("stun");
    } else {
      showToast(state.monster === state.current ? "TRƯỢT MỤC TIÊU — XOAY NHÌN VÀ NGẮM LẠI" : "ĐÈN PIN CHỚP NHÁY — KHÔNG CÓ GÌ TRƯỚC MẶT");
    }
    draw();
    updateHud();
  }

  function sound(type) {
    if (!state.sound) return;
    const audio = state.sound;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain); gain.connect(audio.destination);
    const now = audio.currentTime;
    if (type === "threat") {
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(190, now); oscillator.frequency.exponentialRampToValueAtTime(90, now + 0.35);
      gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    } else if (type === "stun") {
      oscillator.type = "sawtooth"; oscillator.frequency.setValueAtTime(520, now); oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.25);
      gain.gain.setValueAtTime(0.07, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    } else {
      oscillator.type = "square"; oscillator.frequency.setValueAtTime(260 + Math.random() * 100, now);
      gain.gain.setValueAtTime(0.025, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    }
    oscillator.start(now); oscillator.stop(now + (type === "click" ? 0.08 : 0.42));
  }

  function tick(now) {
    if (!state.started || state.ended) return;
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min((now - state.lastFrame) / 1000, 0.1);
    state.lastFrame = now;
    state.elapsed += dt;
    if (state.nv) state.battery = Math.max(0, state.battery - dt * tuning.batteryDrainPerSecond);
    if (state.battery <= 0 && state.nv) {
      state.nv = false;
      showToast("PIN THỊ LỰC CẠN — MÀN HÌNH TỐI");
    }

    if (state.elapsed >= state.nextMonsterMoveAt) {
      state.nextMonsterMoveAt += tuning.monsterMoveSeconds;
      const candidates = Object.keys(nodes).filter((node) => nodes[node].links.includes(state.monster));
      state.monster = candidates[Math.floor(Math.random() * candidates.length)];
      state.monsterBearing = (Math.random() - 0.5) * 1.4;
    }
    const monsterVisible = state.nv && state.monster === state.current && now > state.stunnedUntil && Math.abs(getMonsterAngle()) < 1.18;
    if (monsterVisible) beginThreat();
    if (state.threatStarted && now >= state.threatUntil) lose("Ba giây đã trôi qua. Đèn pin không kịp chớp sáng.");

    $("clock").textContent = formatTime(state.elapsed);
    updateHud();
    draw();
    animationId = requestAnimationFrame(tick);
  }

  async function start() {
    if (state.started) return;
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") showToast("CẢM BIẾN CHƯA ĐƯỢC CẤP QUYỀN — DÙNG NÚT LẮC ĐÈN");
      } catch (error) {
        showToast("KHÔNG THỂ BẬT CẢM BIẾN — DÙNG NÚT LẮC ĐÈN");
      }
    }
    state.started = true;
    state.lastFrame = performance.now();
    state.nextMonsterMoveAt = tuning.monsterMoveSeconds;
    state.sound = new (window.AudioContext || window.webkitAudioContext)();
    $("start-card").classList.add("hidden");
    $("footnote").textContent = "BẬT NV ĐỂ QUÉT · LẮC ĐÈN 4 LẦN NHANH · CẦU CHÌ ĐƯỢC ĐÁNH DẤU BẰNG ÁNH SÁNG";
    setNightVision(true);
    updateHud();
    animationId = requestAnimationFrame(tick);
    draw();
  }

  function restart() {
    cancelAnimationFrame(animationId);
    state.started = false; state.ended = false; state.won = false; state.current = "lobby";
    state.nv = false; state.battery = 100; state.collected = new Set(); state.restored = false;
    state.elapsed = 0; state.monster = "machine"; state.monsterBearing = 0.15; state.stunnedUntil = 0; state.threatUntil = 0;
    state.threatStarted = false; state.yaw = 0; state.shakeHits = []; state.lastShakeAt = 0;
    state.nextMonsterMoveAt = tuning.monsterMoveSeconds; state.flashUntil = 0; state.moveCount = 0;
    state.lastNavSignature = "";
    if (state.sound) { state.sound.close(); state.sound = null; }
    $("end-card").classList.add("hidden");
    $("start-card").classList.remove("hidden");
    $("clock").textContent = "00:00";
    updateHud(); draw();
  }

  $("start-button").addEventListener("click", start);
  $("restart-button").addEventListener("click", restart);
  $("nv-button").addEventListener("click", () => setNightVision(!state.nv));
  $("shake-button").addEventListener("click", shake);
  $("look-help").addEventListener("click", () => showToast("GIỮ CHUỘT VÀ KÉO · ĐIỆN THOẠI: VUỐT NGANG ĐỂ NHÌN"));

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { event.preventDefault(); shake(); }
    else if (event.key.toLowerCase() === "n") setNightVision(!state.nv);
    else if (event.key === "ArrowLeft") state.yaw = Math.max(-1.1, state.yaw - 0.1);
    else if (event.key === "ArrowRight") state.yaw = Math.min(1.1, state.yaw + 0.1);
    draw();
  });
  let dragging = false, previousX = 0;
  canvas.addEventListener("pointerdown", (event) => { dragging = true; previousX = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || !state.started) return;
    const dx = event.clientX - previousX;
    previousX = event.clientX;
    state.yaw = Math.max(-1.15, Math.min(1.15, state.yaw + dx / Math.max(width, 1) * 1.9));
    if (Math.abs(dx) > 8) {
      const direction = Math.sign(dx);
      const now = performance.now();
      if (state.lastShakeDirection && direction !== state.lastShakeDirection && now - state.lastShakeAt > 75 && now - state.lastShakeAt < 520) shake();
      state.lastShakeDirection = direction;
    }
    draw();
  });

  if ("DeviceMotionEvent" in window) {
    window.addEventListener("devicemotion", (event) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + (a.z || 0) * (a.z || 0));
      const current = window.performance.now();
      if (magnitude > 17 && current - state.lastShakeAt > 180) shake();
    });
  }
  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length) previousX = event.touches[0].clientX;
  }, { passive: true });

  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  state.monsterBearing = 0.15;
  state.lastMonsterMove = 0;
  resize();
  updateHud();
  draw();
})();
