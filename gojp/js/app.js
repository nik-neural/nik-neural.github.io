/* 九州北部 2026 — 離線 PWA。骨架喺 trip.json；勾選／座位／角色喺 localStorage。 */
(() => {
  const SEED_URL = "./data/trip.json";
  const KEY = "kyushu2026.v3";
  const TABS = [
    { id: "today", label: "今日", ic: "◎" },
    { id: "plan", label: "行程", ic: "☰" },
    { id: "stay", label: "住", ic: "⌂" },
    { id: "fly", label: "航班", ic: "✈" },
    { id: "more", label: "更多", ic: "…" },
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  let seed = null;
  let trip = null;
  let tab = "today";
  let planDate = null;
  let morePage = null;
  let editDay = null;
  let store = loadStore();

  function stayNights() {
    return (trip.days || []).map((d) => {
      const st = (trip.stays || []).find((s) => s.id === d.stayId || (s.nights || []).includes(d.date));
      const idx = st ? trip.stays.indexOf(st) : 0;
      const cls = idx <= 0 ? "beppu" : idx === 1 ? "taisho" : "jonly";
      return { date: d.date, cls, label: st?.short || d.dow || "" };
    });
  }
  function persistTrip() {
    trip.meta.updated = new Date().toISOString().slice(0, 10);
    store.trip = trip;
    save();
  }
  function ensurePlace(name) {
    const n = (name || "").trim();
    if (!n) return "";
    const hit = trip.places.find((p) => p.name === n || p.id === n);
    if (hit) return hit.id;
    const id = "p" + Date.now();
    trip.places.push({ id, name: n, query: n, kind: "sight", inGuide: true });
    return id;
  }

  const wx = { current: null, daily: null, warn: [], place: null, at: 0, fetching: false };

  function weatherPlace() {
    const ymd = viewDate();
    const st = (trip.stays || []).find((s) => (s.nights || []).includes(ymd));
    if (st) {
      const p = place(st.placeId);
      if (p?.lat != null) return { name: st.short || p.name, lat: p.lat, lng: p.lng, jma: jmaFor(p) };
    }
    const any = (trip.stays || [])[0];
    if (any) {
      const p = place(any.placeId);
      if (p?.lat != null) return { name: any.short || p.name, lat: p.lat, lng: p.lng, jma: jmaFor(p) };
    }
    return { name: "福岡", lat: 33.59, lng: 130.401, jma: "400000" };
  }
  function jmaFor(p) {
    const n = (p.name || "") + (p.query || "");
    if (/福岡|FUK|天神/.test(n)) return "400000";
    if (/嬉野|佐賀|大正/.test(n)) return "410000";
    if (/阿蘇|草千里|黑川|黒川/.test(n)) return "430000";
    return "440000";
  }
  function wxIcon(code) {
    if (code == null) return "☁";
    if (code === 0) return "☀";
    if (code <= 3) return "⛅";
    if (code <= 48) return "🌫";
    if (code <= 57) return "🌦";
    if (code <= 67) return "🌧";
    if (code <= 77) return "❄";
    if (code <= 82) return "🌧";
    if (code <= 86) return "❄";
    return "⛈";
  }
  function wxLabel(code) {
    if (code == null) return "—";
    if (code === 0) return "晴";
    if (code === 1) return "大致晴";
    if (code === 2) return "部分多雲";
    if (code === 3) return "陰";
    if (code <= 48) return "霧";
    if (code <= 57) return "毛毛雨";
    if (code <= 67) return "雨";
    if (code <= 77) return "雪";
    if (code <= 82) return "驟雨";
    if (code <= 86) return "驟雪";
    if (code >= 95) return "雷暴";
    return "有雨";
  }
  function wxWarn(cur, daily) {
    const w = [];
    const code = cur?.weather_code;
    const wind = cur?.wind_speed_10m;
    const rain = cur?.precipitation;
    if (code >= 95) w.push("雷暴。減少戶外同纜車。");
    else if (code >= 80) w.push("驟雨。路面濕滑，揸車留神。");
    else if (code >= 61) w.push("落雨。吊橋／纜車或會限制。");
    if (wind >= 50) w.push("強風。纜車同吊橋好可能停。");
    else if (wind >= 35) w.push("風偏大。上山前核對纜車運行。");
    if (rain >= 8) w.push("雨量偏大。避開低窪同急彎。");
    const aso = (trip.days || []).some((d) => (d.blocks || []).some((b) => /草千里|阿蘇/.test(b.title || "")));
    if (aso) w.push("阿蘇火口視當日警戒，出發前核對。");
    return w;
  }
  function fetchWeather() {
    const loc = weatherPlace();
    const now = Date.now();
    const same = wx.place && wx.place.lat === loc.lat && wx.place.lng === loc.lng;
    if (same && now - wx.at < 15 * 60 * 1000) {
      paintWx();
      return;
    }
    if (wx.fetching) return;
    wx.place = loc;
    wx.fetching = true;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}`
      + `&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m`
      + `&daily=weather_code,temperature_2m_max,precipitation_sum,wind_speed_10m_max`
      + `&timezone=Asia%2FTokyo&forecast_days=2`;
    fetch(url).then((r) => r.json()).then((data) => {
      wx.current = data.current || null;
      wx.daily = data.daily || null;
      wx.warn = wxWarn(wx.current, wx.daily);
      wx.at = Date.now();
      wx.fetching = false;
      paintWx();
      if ($("#wxPop")?.classList.contains("on")) fillWxPop();
    }).catch(() => {
      wx.fetching = false;
      paintWx();
    });
  }
  function paintWx() {
    const icon = $("#wxIcon");
    const dot = $("#wxDot");
    if (!icon) return;
    icon.textContent = wxIcon(wx.current?.weather_code);
    if (dot) dot.classList.toggle("on", wx.warn.length > 0);
  }
  function fillWxPop() {
    const pop = $("#wxPop");
    if (!pop) return;
    const loc = wx.place || weatherPlace();
    const c = wx.current;
    const t = c ? Math.round(c.temperature_2m) : "—";
    const wind = c ? Math.round(c.wind_speed_10m) : "—";
    const rain = c ? c.precipitation : "—";
    const jma = loc.jma || "440000";
    const warns = wx.warn.length
      ? wx.warn.map((x) => `<div class="wx-alert">${esc(x)}</div>`).join("")
      : `<div class="tiny">暫時未見明顯惡劣天氣（以現場同官方為準）。</div>`;
    pop.innerHTML = `
      <div class="wx-h">${esc(loc.name)} · ${t}°C ${wxLabel(c?.weather_code)}</div>
      <div class="tiny">風 ${wind} km/h · 降雨 ${rain} mm</div>
      ${warns}
      <a class="wx-link" href="https://www.jma.go.jp/bosai/warning/#area_type=offices&area_code=${jma}" target="_blank" rel="noopener">氣象廳警報</a>
      <a class="wx-link" href="https://www.aso-volcano.jp/" target="_blank" rel="noopener">阿蘇火山</a>
      <a class="wx-link" href="https://www.jma.go.jp/bosai/forecast/" target="_blank" rel="noopener">天氣預報</a>
    `;
  }
  function toggleWxPop() {
    const pop = $("#wxPop");
    if (!pop) return;
    const on = !pop.classList.contains("on");
    pop.classList.toggle("on", on);
    if (on) {
      fetchWeather();
      fillWxPop();
    }
  }
  function closeWxPop() {
    $("#wxPop")?.classList.remove("on");
  }

  function logoG() {
    return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;
  }
  function logoA() {
    return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.23c.03 3.43 3.01 4.57 3.04 4.58-.03.08-.47 1.62-1.56 3.21-.94 1.37-1.91 2.73-3.44 2.76-1.5.03-1.98-.89-3.7-.89-1.73 0-2.26.86-3.69.92-1.48.06-2.61-1.48-3.56-2.84-1.94-2.78-3.42-7.85-1.43-11.27.99-1.7 2.75-2.77 4.67-2.8 1.46-.03 2.83.98 3.7.98.86 0 2.48-1.21 4.18-1.03.71.03 2.71.29 4 2.17-.1.06-2.39 1.4-2.21 4.21zM13.9 5.5c.79-.95 1.32-2.28 1.17-3.6-1.13.05-2.5.75-3.31 1.7-.73.84-1.37 2.19-1.2 3.48 1.27.1 2.56-.65 3.34-1.58z"/></svg>`;
  }

  function loadStore() {
    try { return Object.assign(defaultStore(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch { return defaultStore(); }
  }
  function defaultStore() {
    return {
      role: "driver",
      planner: false,
      seenGate: false,
      checks: {},
      notes: {},
      seats: {},
      gates: {},
      unlockedNotes: {},
      checklist: {},
      hideSensitive: false,
      previewDate: "",
      seedVersion: 0,
    };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(store)); }

  const fmt = {
    ymd(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    },
    md(ymd) { return ymd.slice(5).replace("-", "/"); },
    hm(ms) {
      if (ms < 0) ms = 0;
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      return { d, h, m, s: s % 60 };
    },
  };

  function pad2(n) { return String(n).padStart(2, "0"); }
  function flightWho(f) {
    return (f?.who || []).map((id) => (trip.people.find((p) => p.id === id) || {}).display || id).filter(Boolean).join("／");
  }
  function flightDepMs(f) {
    if (!f?.date || !f?.dep) return NaN;
    return new Date(`${f.date}T${f.dep}:00+08:00`).getTime();
  }
  function depQueue() {
    return (trip?.flights || [])
      .filter((f) => f.date && f.dep)
      .map((f) => ({ f, t: flightDepMs(f) }))
      .filter((x) => !Number.isNaN(x.t))
      .sort((a, b) => a.t - b.t);
  }
  function nextDep() {
    const q = depQueue();
    return q.find((x) => x.t > Date.now()) || q[0] || null;
  }
  function depLeft() {
    const n = nextDep();
    return n ? n.t - Date.now() : 0;
  }
  function tickCountdown() {
    if (!$("#countdown")) return;
    const cd = fmt.hm(depLeft());
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("cd-d", cd.d);
    set("cd-h", pad2(cd.h));
    set("cd-m", pad2(cd.m));
    set("cd-s", pad2(cd.s));
  }

  function tzNow(tz) {
    const raw = new Date().toLocaleString("en-CA", { timeZone: tz, hour12: false });
    return new Date(raw.replace(", ", "T"));
  }
  function viewDate() {
    if (store.previewDate) return store.previewDate;
    const q = new URLSearchParams(location.search).get("day");
    if (q) return q;
    return fmt.ymd(tzNow("Asia/Tokyo"));
  }
  function inTrip(ymd) {
    if (!trip.days?.length) return false;
    const ds = trip.days.map((d) => d.date).sort();
    return ymd >= ds[0] && ymd <= ds[ds.length - 1];
  }

  function place(id) { return trip.places.find((p) => p.id === id); }
  function day(ymd) { return trip.days.find((d) => d.date === ymd); }
  function stay(id) { return trip.stays.find((s) => s.id === id); }
  function person(id) { return trip.people.find((p) => p.id === id); }

  function appleURL(p, dir) {
    if (!p) return "https://maps.apple.com/";
    const q = (p.appleQuery || p.query || p.address || p.nameJa || p.name || "").trim();
    const encoded = encodeURIComponent(q);
    if (p.lat != null && p.lng != null) {
      if (dir) return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`;
      return `https://maps.apple.com/?ll=${p.lat},${p.lng}&z=19`;
    }
    if (dir && q) return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
    if (q) return `https://maps.apple.com/?q=${encoded}`;
    return "https://maps.apple.com/";
  }
  function googleURL(p, dir) {
    if (!p) return "https://www.google.com/maps";
    const q = (p.googleQuery || p.query || p.address || p.name || "").trim();
    const dest = q || (p.lat != null ? `${p.lat},${p.lng}` : "");
    if (!dest) return "https://www.google.com/maps";
    if (dir) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  }
  function fixupPlaces() {}

  function tierChip(n) {
    const label = trip.meta.tiers[String(n)] || `①②③`[n - 1] || "";
    return `<span class="tier t${n}">${esc(label)}</span>`;
  }
  function navPair(p, dir = true) {
    if (!p) return "";
    const googleOn = store.role !== "copilot";
    const a = appleURL(p, dir);
    const g = googleURL(p, dir);
    return `
      <div class="navpair">
        <a class="btn ${googleOn ? "" : "ghost"} google" href="${g}">${logoG()} Gemini導航</a>
        <a class="btn ${googleOn ? "ghost" : ""} apple" href="${a}">${logoA()} Siri導航</a>
      </div>
`;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on", "glass");
    clearTimeout(toast._id);
    toast._id = setTimeout(() => t.classList.remove("on"), 2200);
  }

  function wa(text) {
    location.href = "https://wa.me/?text=" + encodeURIComponent(text);
  }

  function shareDay(ymd) {
    const d = day(ymd);
    if (!d) return;
    const lines = [
      `九州北部 2026｜${fmt.md(ymd)}（${d.dow}）`,
      d.theme,
      "",
    ];
    for (const b of d.blocks) {
      const mark = b.hard ? "⏰" : "·";
      const t = b.time ? `${b.time}${b.end ? "–" + b.end : ""} ` : "";
      lines.push(`${mark} ${t}${b.title}`);
      if (b.placeId) {
        const p = place(b.placeId);
        if (p) {
          lines.push(`  Google ${googleURL(p, true)}`);
          lines.push(`  蘋果 ${appleURL(p, true)}`);
        }
      }
    }
    const st = stay(d.stayId);
    if (st) lines.push("", `今晚住：${st.name}`);
    lines.push("", "起飛");
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => toast("已複製呢日，去 WhatsApp 貼上")).catch(() => wa(text));
  }

  function sharePlace(p) {
    wa([
      p.nameJa || p.name,
      p.address || "",
      `G Google 地圖 ${googleURL(p, true)}`,
      ` 蘋果地圖 ${appleURL(p, true)}`,
      "主駕駛開 Google、副駕駛開蘋果。雙線對路線。",
    ].filter(Boolean).join("\n"));
  }

  function shareEmergency() {
    const nums = trip.emergency.numbers
      .filter((n) => n.tel)
      .map((n) => `${n.name} ${n.tel}`)
      .join("\n");
    wa(`九州自駕意外簡介（唔係法律意見）\n\n${nums}\n\n${trip.emergency.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  async function boot() {
    seed = await (await fetch(SEED_URL)).json();
    trip = (store.trip && ((store.trip.days || []).length || (store.trip.people || []).length))
      ? store.trip
      : seed;
    if (!(trip.checklist7d || []).length && (seed.checklist7d || []).length) {
      trip.checklist7d = seed.checklist7d;
    }
    fixupPlaces();
    persistTrip();
    if (!store.seedVersion) store.seedVersion = seed.meta.dataVersion;
    save();
    if (!store.seenGate) $("#gate").classList.add("on");
    bind();
    render();
    setInterval(tickCountdown, 1000);
    setInterval(() => {
      if (tab === "today" || tab === "fly") render();
    }, 30000);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    fetchWeather();
  }

  function bind() {
    $("#tabs").innerHTML = TABS.map((t) =>
      `<button data-tab="${t.id}"><span class="ic">${t.ic}</span>${t.label}</button>`
    ).join("");
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      tab = b.dataset.tab;
      morePage = null;
      editDay = null;
      render();
    });
    $("#view").addEventListener("click", onViewClick);
    $("#sheet").addEventListener("click", (e) => {
      if (e.target.id === "sheet") closeSheet();
    });
    $("#gate").addEventListener("click", onGate);
    $("#wxBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWxPop();
    });
    document.addEventListener("click", (e) => {
      if (!$("#wxPop")?.classList.contains("on")) return;
      if (e.target.closest(".wx-wrap")) return;
      closeWxPop();
    });
  }

  function onGate(e) {
    const b = e.target.closest("[data-role]");
    if (!b) return;
    store.role = b.dataset.role;
    store.planner = b.dataset.planner === "1";
    store.seenGate = true;
    save();
    $("#gate").classList.remove("on");
    render();
  }

  function onViewClick(e) {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    const id = a.dataset.id;
    if (act === "check") {
      store.checks[id] = !store.checks[id];
      save(); render();
    } else if (act === "place") {
      openPlace(id);
    } else if (act === "plan-day") {
      planDate = id;
      tab = "plan";
      morePage = null;
      render();
    } else if (act === "more-open") {
      morePage = id;
      render();
      $("#view").scrollTop = 0;
    } else if (act === "more-back") {
      morePage = null;
      render();
      $("#view").scrollTop = 0;
    } else if (act === "share-day") {
      shareDay(id);
    } else if (act === "share-place") {
      sharePlace(place(id));
    } else if (act === "share-em") {
      shareEmergency();
    } else if (act === "share-today") {
      shareDay(inTrip(viewDate()) ? viewDate() : (trip.days[0]?.date || viewDate()));
    } else if (act === "copy") {
      navigator.clipboard.writeText(a.dataset.text || "").then(() => toast("已複製")).catch(() => toast("複製唔到"));
    } else if (act === "check7") {
      store.checklist[id] = !store.checklist[id];
      save(); render();
    } else if (act === "save-seat") {
      const fl = a.dataset.fl;
      if (!store.seats[fl]) store.seats[fl] = {};
      save(); toast("座位已存呢部機");
    } else if (act === "save-gate") {
      const fl = a.dataset.fl;
      store.gates[fl] = $(`#gate-${fl}`)?.value.trim() || "";
      save(); toast("閘口已存呢部機");
    } else if (act === "save-note") {
      store.unlockedNotes[id] = $(`#un-${id}`)?.value || "";
      save(); toast("備註已存本地");
    } else if (act === "preview") {
      store.previewDate = a.dataset.date || "";
      save(); render();
    } else if (act === "export") {
      const blob = new Blob([JSON.stringify({ trip: seed, local: store }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const l = document.createElement("a");
      l.href = url; l.download = "kyushu-2026-local.json"; l.click();
      URL.revokeObjectURL(url);
    } else if (act === "import") {
      $("#fileIn").click();
    } else if (act === "reset-local") {
      if (confirm("清呢部機嘅行程同勾選？")) {
        store = defaultStore();
        store.seenGate = true;
        trip = seed;
        save(); render(); toast("已清空");
      }
    } else if (act === "toggle-sens") {
      store.hideSensitive = !store.hideSensitive;
      save(); render();
    } else if (act === "planner") {
      store.planner = !store.planner;
      save(); render();
    } else if (act === "set-role") {
      store.role = a.dataset.role;
      save(); render();
    } else if (act === "edit-day") {
      editDay = id;
      tab = "plan";
      render();
    } else if (act === "cancel-edit") {
      editDay = null;
      render();
    } else if (act === "save-day") {
      saveDayEdit(id, false);
    } else if (act === "add-block") {
      saveDayEdit(id, true);
      const d = day(id);
      if (!d) return;
      d.blocks.push({ id: id + "-n" + Date.now(), time: "", title: "", tier: 3, hard: false, notes: "" });
      persistTrip();
      render();
    } else if (act === "del-block") {
      saveDayEdit(a.dataset.day, true);
      const d = day(a.dataset.day);
      if (!d) return;
      d.blocks = d.blocks.filter((b) => b.id !== id);
      persistTrip();
      render();
    } else if (act === "add-day") {
      const last = trip.days[trip.days.length - 1];
      const base = last ? new Date(last.date + "T00:00:00") : new Date();
      base.setDate(base.getDate() + 1);
      const ymd = fmt.ymd(base);
      const dows = "日一二三四五六";
      trip.days.push({ date: ymd, dow: dows[base.getDay()], theme: "", locked: false, blocks: [] });
      persistTrip();
      planDate = ymd;
      editDay = ymd;
      tab = "plan";
      render();
    } else if (act === "del-day") {
      const d = day(id);
      if (!d) return;
      if (!confirm(`刪 ${fmt.md(d.date)} ${d.dow}？呢日項目一齊冇。`)) return;
      const dates = trip.days.map((x) => x.date);
      const idx = dates.indexOf(id);
      trip.days = trip.days.filter((x) => x.date !== id);
      persistTrip();
      editDay = null;
      const remain = trip.days.map((x) => x.date);
      planDate = remain[Math.min(idx, remain.length - 1)] || remain[0] || null;
      toast("已刪呢日");
      render();
    } else if (act === "copy-trip") {
      const text = TripText.serialize(trip);
      navigator.clipboard.writeText(text).then(() => toast("已複製，去 WhatsApp 貼上")).catch(() => {
        morePage = "paste";
        render();
        toast("複製唔到，去貼上頁手動揀");
      });
    } else if (act === "apply-paste") {
      applyPastedTrip();
    }
  }

  async function applyPastedTrip() {
    let text = ($("#pasteBox")?.value || "").trim();
    try {
      const clip = (await navigator.clipboard.readText() || "").trim();
      if (clip) {
        text = clip;
        const box = $("#pasteBox");
        if (box) box.value = clip;
      }
    } catch (_) { /* iPhone 可能要先准貼上；用格入面已有嘅字 */ }
    if (!text) {
      toast("未讀到剪貼簿。長按格入面貼上，再撳一次");
      return;
    }
    const parsed = TripText.parse(text, seed);
    if (!parsed.days.length && !parsed.people.length) {
      toast("認唔到。剪貼簿要由「侍藍行程」開頭嗰段");
      return;
    }
    trip = parsed;
    if (!(trip.checklist7d || []).length && (seed.checklist7d || []).length) {
      trip.checklist7d = seed.checklist7d;
    }
    fixupPlaces();
    persistTrip();
    editDay = null;
    morePage = null;
    tab = "plan";
    toast("行程已更新");
    render();
  }

  function saveDayEdit(date, keep) {
    const d = day(date);
    if (!d) return;
    d.theme = $("#ed-theme")?.value.trim() || d.theme;
    const n = d.blocks.length;
    const next = [];
    for (let i = 0; i < n; i++) {
      const old = d.blocks[i];
      const title = $(`#eb-${i}-title`)?.value.trim() || "";
      const hh = $(`#eb-${i}-hh`)?.value || "";
      const mm = $(`#eb-${i}-mm`)?.value || "00";
      const time = hh ? `${hh}:${mm}` : "";
      if (!title && !time) continue;
      const placeName = $(`#eb-${i}-place`)?.value.trim() || "";
      next.push({
        id: old.id || date + "-" + i,
        time,
        end: old.end || "",
        title,
        notes: $(`#eb-${i}-notes`)?.value.trim() || "",
        hard: !!$(`#eb-${i}-hard`)?.checked,
        tier: +($(`#eb-${i}-tier`)?.value || 3),
        placeId: ensurePlace(placeName),
        nav: !!placeName,
        status: old.status || "",
      });
    }
    d.blocks = next;
    persistTrip();
    if (!keep) {
      editDay = null;
      toast("呢日已儲");
      render();
    }
  }

  function openPlace(id) {
    const p = place(id);
    if (!p) return;
    const sheet = $("#sheet");
    sheet.classList.add("on");
    sheet.innerHTML = `
      <div class="panel glass">
        <div class="handle"></div>
        <div class="row"><span class="kicker">${esc(p.kind)}</span>${tierChip(p.coordTier || 1)}</div>
        <h2 style="margin:8px 0 4px">${esc(p.name)}</h2>
        <div class="muted">${esc(p.nameJa || "")}</div>
        <div class="muted" style="margin-top:8px">${esc(p.address || p.query || "")}</div>
        ${p.hours ? `<div class="tiny" style="margin-top:8px">時間 ${esc(p.hours)}</div>` : ""}
        ${p.phone ? `<div class="tiny">電話 <a href="tel:${esc(p.phone)}" style="color:#fff">${esc(p.phone)}</a></div>` : ""}
        ${p.parking ? `<div class="tiny">停車 ${esc(p.parking)}</div>` : ""}
        ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ""}
        ${p.coordNote ? `<p class="tiny">${esc(p.coordNote)}</p>` : ""}
        ${navPair(p, true)}
        <div class="navpair" style="margin-top:8px">
          <a class="btn ghost small" href="${googleURL(p, false)}">${logoG()} 地點詳情</a>
          <a class="btn ghost small" href="${appleURL(p, false)}">${logoA()} 地點詳情</a>
        </div>
        <button class="btn ghost" style="margin-top:12px" id="sheetClose">關閉</button>
      </div>`;
    $("#sheetClose").onclick = closeSheet;
  }
  function closeSheet() { $("#sheet").classList.remove("on"); $("#sheet").innerHTML = ""; }

  function render() {
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const ymd = viewDate();
    $("#subline").textContent = trip.meta.title && trip.meta.title !== "侍藍行程" ? trip.meta.title : "本地行程";
    fetchWeather();
    let html = "";
    if (tab === "today") html += viewToday(ymd);
    else if (tab === "plan") html += viewPlan();
    else if (tab === "stay") html += viewStay();
    else if (tab === "fly") html += viewFly();
    else html += viewMore();
    $("#view").innerHTML = html;
  }

  function nextHard(ymd) {
    const d = day(ymd);
    if (!d) return null;
    const now = tzNow("Asia/Tokyo");
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return d.blocks.find((b) => b.hard && b.time && b.time >= hm && !store.checks[b.id])
      || d.blocks.find((b) => b.hard && !store.checks[b.id]);
  }

  function viewEmpty() {
    return `<section class="hero glass">
      <div class="kicker">起飛</div>
      <h2>未有行程</h2>
      <p class="sub">從 WhatsApp 複製行程文字，貼呢度。改完再複製傳返去。</p>
    </section>
    ${viewPaste()}`;
  }

  function viewPaste() {
    const current = trip.days.length ? TripText.serialize(trip) : "";
    return `<section class="card glass">
      <h3>WhatsApp 複製／貼上</h3>
      <p class="tiny">WhatsApp 複製行程之後，返嚟撳「貼上並更新」（會讀剪貼簿）。iPhone 可能問准唔准貼。</p>
      <button class="btn" data-act="copy-trip">複製行程</button>
      <textarea class="field" id="pasteBox" rows="10" placeholder="喺 WhatsApp 複製行程，貼呢度">${esc(current)}</textarea>
      <button class="btn" style="margin-top:8px" data-act="apply-paste">貼上並更新</button>
    </section>`;
  }

  function viewToday(ymd) {
    if (!trip.days.length) return viewEmpty();
    const tripOn = inTrip(ymd);
    const d = tripOn ? day(ymd) : trip.days[0];
    const showY = tripOn ? ymd : d.date;
    const st = stay(d.stayId);
    const hard = tripOn ? nextHard(showY) : d.blocks.find((b) => b.hard);
    const cd = fmt.hm(depLeft());
    const nxt = nextDep();
    const depLines = !tripOn
      ? depQueue().map((x) => {
          const on = nxt && x.f.no === nxt.f.no;
          return `<div class="${on ? "" : "muted"}" style="margin-top:4px">${esc(x.f.no)} ${esc(x.f.dep)}　${esc(flightWho(x.f) || "")}${on ? " · 倒數跟呢班" : ""}</div>`;
        }).join("")
      : "";

    return `
      <section class="hero glass">
        <div class="kicker">${tripOn ? "今日" : "出發倒數"}</div>
        <h2>${tripOn ? `${fmt.md(showY)} ${d.dow}` : (nxt ? `${esc(nxt.f.no)} ${esc(nxt.f.dep)}` : "仲未起飛")}</h2>
        <div class="sub">${tripOn ? esc(d.theme) : (nxt ? esc(flightWho(nxt.f) || "") : esc(d.theme))}</div>
        ${!tripOn ? `
          <div class="countdown" id="countdown">
            <div class="cd"><b id="cd-d">${cd.d}</b><span>日</span></div>
            <div class="cd"><b id="cd-h">${pad2(cd.h)}</b><span>時</span></div>
            <div class="cd"><b id="cd-m">${pad2(cd.m)}</b><span>分</span></div>
            <div class="cd"><b id="cd-s">${pad2(cd.s)}</b><span>秒</span></div>
          </div>
          <div class="tiny" style="margin-top:10px">${depLines}</div>` : ""}
        ${hard ? `<p class="muted" style="margin:12px 0 0">下一個硬性時間：<b>${esc(hard.time || "")} ${esc(hard.title)}</b></p>` : ""}
      </section>

      ${st ? `<section class="card glass">
        <div class="row"><h3 style="margin:0">今晚住</h3>${tierChip(st.tier)}</div>
        <div class="title" style="font-weight:750;margin:6px 0">${esc(st.short)} · ${esc(st.name)}</div>
        <div class="muted">${esc(st.parking || st.meal || st.notes || "")}</div>
        ${navPair(place(st.placeId), true)}
      </section>` : ""}

      <section class="card glass">
        <div class="row">
          <h3 style="margin:0">${tripOn ? "今日時間表" : "10/7 骨架"}</h3>
          <button class="pill" data-act="share-day" data-id="${showY}">WhatsApp</button>
        </div>
        ${renderBlocks(d)}
      </section>

      ${d.date === "2026-10-08" ? renderDining() : ""}
      ${renderUnlockedMini()}
    `;
  }

  function renderBlocks(d) {
    return `<div class="timeline">${d.blocks.map((b) => {
      const p = b.placeId ? place(b.placeId) : null;
      const done = !!store.checks[b.id];
      return `
        <article class="block ${b.hard ? "is-hard" : ""} ${done ? "done" : ""} ${b.status === "cancelled" ? "cancelled" : ""}">
          <div class="row">
            <div class="when">${esc(b.time || "彈性")}${b.end ? "–" + esc(b.end) : ""}${b.tz ? " " + esc(b.tz) : ""}</div>
            <div class="chip-row">
              ${b.hard ? `<span class="badge-hard">硬性</span>` : ""}
              ${tierChip(b.tier)}
            </div>
          </div>
          <div class="title">${esc(b.title)}</div>
          ${b.notes ? `<div class="muted">${esc(b.notes)}</div>` : ""}
          <div class="row" style="margin-top:8px">
            <label class="tiny"><input type="checkbox" data-act="check" data-id="${b.id}" ${done ? "checked" : ""}> 搞掂</label>
            ${p ? `<button class="pill" data-act="place" data-id="${p.id}">地圖</button>` : ""}
          </div>
        </article>`;
    }).join("")}</div>`;
  }

  function renderDining() {
    return `<section class="card glass">
      <h3>10/8 燒肉後備（可網訂）</h3>
      ${trip.dining.map((x) => `
        <div class="list-item">
          <div class="ico">${x.priority}</div>
          <div>
            <b>${esc(x.name)}</b>
            <div class="tiny">${esc(x.notes || "Hot Pepper 席のみ")}</div>
            <a class="btn small" style="margin-top:8px" href="${esc(x.url)}">去訂位</a>
          </div>
        </div>`).join("")}
    </section>`;
  }

  function renderUnlockedMini() {
    const open = trip.unlocked.slice(0, 4);
    return `<section class="card glass">
      <div class="row"><h3 style="margin:0">未鎖</h3><span class="tiny">②／③</span></div>
      ${open.map((u) => `<div class="muted" style="margin-top:6px">· ${esc(u.title)}</div>`).join("")}
      <div class="tiny" style="margin-top:8px">完整清單喺「更多」。</div>
    </section>`;
  }

  function viewPlan() {
    if (!trip.days.length) return viewEmpty();
    const ymd = planDate || (inTrip(viewDate()) ? viewDate() : trip.days[0].date);
    const d = day(ymd) || trip.days[0];
    if (editDay === d.date) return viewPlanEdit(d);
    const nights = stayNights();
    return `
      <div class="daychip">
        ${trip.days.map((x) =>
          `<button class="${x.date === d.date ? "on" : ""}" data-act="plan-day" data-id="${x.date}">${fmt.md(x.date)} ${x.dow}</button>`
        ).join("")}
        <button data-act="add-day">＋</button>
      </div>
      <section class="hero glass">
        <div class="kicker">${d.locked ? "骨架" : "未鎖"}</div>
        <h2>${fmt.md(d.date)} ${d.dow}</h2>
        <div class="sub">${esc(d.theme)}</div>
        ${nights.length ? `<div class="stay-bar">
          ${nights.map((n) =>
            `<button type="button" class="${n.cls} ${n.date === d.date ? "on" : ""}" data-act="plan-day" data-id="${n.date}" aria-label="${esc(n.label)} ${fmt.md(n.date)}"></button>`
          ).join("")}
        </div>` : ""}
      </section>
      <section class="card glass" id="timeline-card">
        <div class="row">
          <h3 style="margin:0">時間表</h3>
          <div class="chip-row">
            <button class="pill" data-act="edit-day" data-id="${d.date}">編輯呢日</button>
            <button class="pill" data-act="share-day" data-id="${d.date}">複製呢日</button>
          </div>
        </div>
        ${renderBlocks(d)}
      </section>
      ${(trip.dining || []).length && d.date === "2026-10-08" ? renderDining() : ""}
    `;
  }

  function hmParts(t) {
    const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
    return {
      hh: m ? String(+m[1]).padStart(2, "0") : "",
      mm: m ? m[2] : "00",
    };
  }
  function hourOptions(hh) {
    let s = `<option value="" ${hh ? "" : "selected"}>彈性</option>`;
    for (let h = 0; h < 24; h++) {
      const v = String(h).padStart(2, "0");
      s += `<option value="${v}" ${v === hh ? "selected" : ""}>${v}</option>`;
    }
    return s;
  }
  function minOptions(mm) {
    let s = "";
    for (let x = 0; x < 60; x++) {
      const v = String(x).padStart(2, "0");
      s += `<option value="${v}" ${v === mm ? "selected" : ""}>${v}</option>`;
    }
    return s;
  }

  function viewPlanEdit(d) {
    const rows = d.blocks.map((b, i) => {
      const p = b.placeId ? place(b.placeId) : null;
      const hm = hmParts(b.time);
      return `<div class="edit-block">
        <input class="field" id="eb-${i}-title" placeholder="項目" value="${esc(b.title || "")}">
        <div class="time-wheel">
          <select class="field" id="eb-${i}-hh" aria-label="時">${hourOptions(hm.hh)}</select>
          <span class="time-colon">:</span>
          <select class="field" id="eb-${i}-mm" aria-label="分">${minOptions(hm.mm)}</select>
        </div>
        <input class="field" id="eb-${i}-place" placeholder="地點（開地圖用）" value="${esc(p ? p.name : "")}">
        <input class="field" id="eb-${i}-notes" placeholder="備註" value="${esc(b.notes || "")}">
        <div class="row edit-flags">
          <label class="hard-toggle">
            <input type="checkbox" id="eb-${i}-hard" ${b.hard ? "checked" : ""}>
            <span>硬性</span>
          </label>
          <select class="field" id="eb-${i}-tier">
            <option value="1" ${b.tier===1?"selected":""}>①已確認</option>
            <option value="2" ${b.tier===2?"selected":""}>②可能變</option>
            <option value="3" ${b.tier===3?"selected":""}>③估算</option>
          </select>
          <button class="pill del-block" data-act="del-block" data-id="${b.id}" data-day="${d.date}">刪</button>
        </div>
      </div>`;
    }).join("");
    return `
      <div class="page-head">
        <button type="button" data-act="cancel-edit">‹ 取消</button>
        <h3 style="margin:0">編輯 ${fmt.md(d.date)}</h3>
      </div>
      <section class="card glass">
        <div class="tiny">主題</div>
        <input class="field" id="ed-theme" value="${esc(d.theme || "")}">
        ${rows || '<p class="muted">未有項目。</p>'}
        <button class="btn ghost" style="margin-top:10px" data-act="add-block" data-id="${d.date}">＋ 加一項</button>
        <button class="btn" style="margin-top:8px" data-act="save-day" data-id="${d.date}">儲呢日</button>
        <button class="btn ghost kill-day" data-act="del-day" data-id="${d.date}">刪除一日</button>
      </section>`;
  }

  function viewStay() {
    if (!trip.stays.length) return viewEmpty();
    return trip.stays.map((s) => {
      const p = place(s.placeId);
      const nights = (s.nights || []).map(fmt.md).join("、");
      const who = (s.who || []).map((id) => person(id)?.display || id).join(" · ");
      return `<section class="card glass">
        <div class="row"><h3 style="margin:0">${esc(s.short)}</h3>${tierChip(s.tier)}</div>
        <div style="font-weight:750;margin:6px 0">${esc(s.name)}</div>
        <div class="muted">住：${esc(nights)} 晚</div>
        <div class="muted">邊個：${esc(who)}</div>
        ${s.ciTime ? `<div class="tiny">CI ${esc(s.ciTime)}${s.coTime ? " · CO " + esc(s.coTime) : ""}</div>` : ""}
        ${s.meal ? `<div class="tiny">${esc(s.meal)}</div>` : ""}
        ${s.parking ? `<div class="tiny">${esc(s.parking)}</div>` : ""}
        ${s.notes ? `<p class="muted">${esc(s.notes)}</p>` : ""}
        ${p ? navPair(p, true) : ""}
      </section>`;
    }).join("");
  }

  function viewFly() {
    if (!trip.flights.length) return viewEmpty();
    return trip.flights.map((f) => {
      const who = (f.who || []).map((id) => person(id)?.display).join(" · ");
      return `
        <article class="pass glass">
          <div class="hd">
            <div>
              <div class="airline">${esc(f.airline)}</div>
              <div class="no">${esc(f.no)}</div>
            </div>
            <div>${tierChip(f.tier)}<div class="tiny" style="margin-top:8px">${esc(f.date)} ${esc(f.dow)}</div></div>
          </div>
          <div class="bd">
            <div class="route">
              <div><div class="code">${esc(f.from.code)}</div><div class="city">${esc(f.from.name)} ${esc(f.from.term || "")}</div></div>
              <div class="mid">${esc(f.dep)} → ${esc(f.arr)}</div>
              <div style="text-align:right"><div class="code">${esc(f.to.code)}</div><div class="city">${esc(f.to.name)} ${esc(f.to.term || "")}</div></div>
            </div>
            <div class="meta-grid">
              <div><div class="k">邊個</div><div class="v">${esc(who)}</div></div>
              <div><div class="k">行李</div><div class="v">${esc(f.bag || "—")}</div></div>
            </div>
            ${f.airportArrive ? `<p class="muted" style="margin-top:10px">${esc(f.airportArrive.label)}</p>` : ""}
            ${f.checkinOpen?.label ? `<p class="muted">網上預辦 ${esc(f.checkinOpen.label)}</p>` : ""}
            ${f.notes ? `<p class="muted">${esc(f.notes)}</p>` : ""}
            ${f.checkinUrl ? `<a class="btn" href="${esc(f.checkinUrl)}" style="margin-top:10px">網上預辦</a>` : ""}
            ${f.placeId || f.to.placeId ? navPair(place(f.to.placeId || f.from.placeId), true) : ""}
          </div>
        </article>`;
    }).join("");
  }

  function viewMore() {
    if (morePage === "paste") return withBack("複製／貼上", viewPaste());
    if (morePage === "places") return viewPlaces();
    if (morePage === "unlocked") return viewUnlocked();
    if (morePage === "car") return withBack("租車", viewCar());
    if (morePage === "emergency") return withBack("萬一出事", viewEmergency());
    if (morePage === "check7") return withBack("出發前 7 日", viewChecklist());
    if (morePage === "settings") return withBack("呢部機", viewSettings());
    const nPlace = trip.places.filter((p) => p.inGuide).length;
    const nOpen = trip.unlocked.length;
    return `<section class="card glass">
      <h3>更多</h3>
      <p class="tiny">內頁分開睇。改行程用編輯；傳團友用複製貼上。</p>
      ${menu("paste", "📋", "複製／貼上行程", "WhatsApp 一鍵")}
      ${menu("places", "📍", "地點 · Maps guide", `${nPlace} 個點`)}
      ${menu("unlocked", "📝", "未鎖清單", `${nOpen} 項`)}
      ${menu("car", "🚗", "租車 · ORIX", "取車／還車")}
      ${menu("emergency", "☎", "萬一出事", "110／119／ORIX")}
      ${menu("check7", "☑", "出發前 7 日", "阿蘇、天氣、店名")}
      ${menu("settings", "📱", "呢部機", "加到主畫面")}
    </section>`;
  }
  function menu(id, ic, title, sub) {
    return `<button class="menu" data-act="more-open" data-id="${id}">
      <div class="ico">${ic}</div>
      <div><b>${esc(title)}</b><div class="tiny">${esc(sub)}</div></div>
      <span class="go">›</span>
    </button>`;
  }
  function withBack(title, body) {
    return `<div class="page-head"><button type="button" data-act="more-back">‹ 返回</button><h3 style="margin:0">${esc(title)}</h3></div>${body}`;
  }

  function viewPlaces() {
    const guide = trip.places.filter((p) => p.inGuide);
    return `${withBack("地點", "")}<section class="card glass">
      <p class="tiny">撳一格開 Gemini／Siri 導航。</p>
      ${guide.map((p) => `
        <button class="menu" data-act="place" data-id="${p.id}">
          <div class="ico">${iconFor(p.kind)}</div>
          <div><b>${esc(p.name)}</b><div class="tiny">${esc(p.nameJa || "")}</div></div>
          <span class="go">›</span>
        </button>`).join("")}
    </section>`;
  }
  function iconFor(k) {
    return ({ stay: "⌂", food: "🍽", sight: "◉", transit: "🚡", onsen: "♨", airport: "✈", car: "🚗", area: "◎" }[k] || "•");
  }

  function viewCar() {
    const c = trip.car || {};
    if (!c.company && !c.pickup?.date) return `<section class="card glass"><p class="muted">未有租車資料。貼上行程後會出現。</p></section>`;
    return `<section class="card glass">
      <div class="row"><h3 style="margin:0">租車 · ${esc(c.company)}</h3>${tierChip(1)}</div>
      <p class="muted">已訂。店名未鎖＝只信確認書。</p>
      <div class="list-item">
        <div class="ico">取</div>
        <div>
          <b>${esc(c.pickup?.date || "")} ${esc(c.pickup?.time || "")}</b>
          <div class="muted">${esc(c.pickup?.who || "")}</div>
          <div class="tiny">${esc(c.pickup?.note || "")}</div>
          ${navPair(place(c.pickup?.placeId), true)}
        </div>
      </div>
      <div class="list-item">
        <div class="ico">還</div>
        <div>
          <b>${esc(c.dropoff?.date || "")} ${esc(c.dropoff?.time || "")}</b>
          <div class="muted">${esc(c.dropoff?.who || "")}</div>
          <div class="tiny">${esc(c.dropoff?.note || "")}</div>
          ${navPair(place(c.dropoff?.placeId), true)}
        </div>
      </div>
    </section>`;
  }

  function viewUnlocked() {
    return `${withBack("未鎖清單", "")}<section class="card glass">
      ${trip.unlocked.map((u) => `
        <div style="margin:10px 0 16px">
          <div class="row"><b>${esc(u.title)}</b>${tierChip(u.tier)}</div>
          <textarea class="field" id="un-${u.id}" rows="2" placeholder="本地備註（只呢部機）">${esc(store.unlockedNotes[u.id] || "")}</textarea>
          <button class="btn ghost small" data-act="save-note" data-id="${u.id}">儲備註</button>
        </div>`).join("")}
    </section>`;
  }

  function viewEmergency() {
    const em = trip.emergency;
    return `<section class="card glass">
      <div class="row"><h3 style="margin:0">萬一出事</h3><span class="badge-hard">簡介</span></div>
      <p class="tiny">${esc(em.disclaimer)}</p>
      ${em.numbers.map((n) => `
        <div class="list-item">
          <div class="ico">☎</div>
          <div>
            <b>${esc(n.name)}</b>
            ${n.tel ? `<div><a class="btn danger small" href="tel:${esc(n.tel)}" style="margin-top:8px">${esc(n.tel)}</a></div>` : `<div class="muted">睇貸渡證</div>`}
            <div class="tiny">${esc(n.when)}</div>
          </div>
        </div>`).join("")}
      <ol class="muted" style="padding-left:18px">
        ${em.steps.map((s) => `<li style="margin:8px 0">${esc(s)}</li>`).join("")}
      </ol>
      <button class="btn wa" data-act="share-em">WhatsApp 呢份簡介</button>
    </section>`;
  }

  function viewChecklist() {
    if (!(trip.checklist7d || []).length) {
      return `<section class="card glass"><p class="muted">未有清單。</p></section>`;
    }
    return `<section class="card glass">
      <h3>出發前 7 日</h3>
      ${trip.checklist7d.map((c) => `
        <label class="check">
          <input type="checkbox" data-act="check7" data-id="${c.id}" ${store.checklist[c.id] ? "checked" : ""}>
          <span><b>${esc(c.title)}</b><div class="tiny">${esc(c.how)}</div>
          ${c.url ? `<a href="${esc(c.url)}" style="color:#cfe4ff">開連結</a>` : ""}</span>
        </label>`).join("")}
    </section>`;
  }

  function viewABCD() {
    return `<section class="card glass">
      <h3>神算子 ABCD</h3>
      <p class="tiny">A 必須 · B 建議 · C 保留骨架 · D 7 日前再確認。唔為改而改。</p>
      ${trip.abcd.map((x) => `
        <div class="list-item">
          <div class="ico">${esc(x.level)}</div>
          <div><b>${esc(x.date)} ${esc(x.item)}</b><div class="muted">${esc(x.text)}</div></div>
        </div>`).join("")}
    </section>`;
  }

  function viewSettings() {
    return `<section class="card glass">
      <h3>加到主畫面</h3>
      <div class="install">
        <div class="install-step"><span class="install-ico">①</span><div><b>用 Safari 開</b><div class="muted">Chrome／其他瀏覽器加唔到。</div></div></div>
        <div class="install-step"><span class="install-ico">⬆</span><div><b>撳底部分享</b><div class="muted">方框加向上箭咀嗰粒。</div></div></div>
        <div class="install-step"><span class="install-ico">＋</span><div><b>加到主畫面</b><div class="muted">之後離線都開到。</div></div></div>
      </div>
      <button class="btn ghost" style="margin-top:16px" data-act="reset-local">清本地行程</button>
    </section>`;
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
