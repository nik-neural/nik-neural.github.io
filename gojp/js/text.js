/* 神算子 WhatsApp 文本 ↔ 行程物件。唔用 JSON 分享。 */
(function (w) {
  const TIER_CH = { "①": 1, "②": 2, "③": 3, "1": 1, "2": 2, "3": 3 };
  const CH_TIER = { 1: "①", 2: "②", 3: "③" };

  function emptyTrip() {
    return {
      meta: {
        id: "gojp",
        title: "侍藍行程",
        subtitle: "WhatsApp 貼上",
        dataVersion: 1,
        updated: "",
        tz: "Asia/Tokyo",
        tzHK: "Asia/Hong_Kong",
        engine: "神算子",
        year: 2026,
        tiers: { "1": "①已確認", "2": "②10月前可能變", "3": "③估算／建議" },
      },
      people: [],
      flights: [],
      stays: [],
      car: { company: "", pickup: {}, dropoff: {} },
      places: [],
      days: [],
      dining: [],
      unlocked: [],
      checklist7d: [],
      abcd: [],
      emergency: {
        disclaimer: "簡介，唔係法律意見。現場以警察／租車公司指示為準。",
        numbers: [
          { id: "police", name: "警察", tel: "110", when: "任何碰撞、有人傷、財物損。即使輕微都建議報。" },
          { id: "ambulance", name: "救護／消防", tel: "119", when: "有傷、火、高速公路緊急。" },
        ],
        steps: [
          "停安全位。開警示燈。車尾三角牌。",
          "有傷：119。跟住 110。救人優先。",
          "即使刮花都當事故。唔報警察＋租車公司，保險可以作廢。",
          "影相：全景、損壞、車牌、路面、行車記錄儀。",
          "交換名、電話、保險、車牌、駕照。唔好簽睇唔明嘅日文認錯紙。",
          "打租車公司事故中心（貸渡證上嘅電話）。",
          "通知旅行保險／信用卡租車保險。",
        ],
      },
    };
  }

  function md(ymd) {
    if (!ymd) return "";
    const p = String(ymd).split("-");
    if (p.length < 3) return ymd;
    return `${+p[1]}/${+p[2]}`;
  }
  function parseMd(s, year) {
    const m = String(s).match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return "";
    return `${year}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
  }
  function slug(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u3400-\u9fff-]/g, "")
      .slice(0, 40) || "p";
  }
  function displayOf(t, id) {
    return (t.people.find((p) => p.id === id) || {}).display || id;
  }
  function idsFromNames(t, names) {
    return names
      .split(/[、,，]/)
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const hit = t.people.find((p) => p.display === n || p.id === n);
        if (hit) return hit.id;
        const id = slug(n).toLowerCase();
        t.people.push({ id, display: n, roles: ["viewer"], flights: [] });
        return id;
      });
  }
  function findPlace(t, name) {
    if (!name) return "";
    const hit = t.places.find((p) => p.name === name || p.nameJa === name || p.id === name);
    if (hit) return hit.id;
    const id = slug(name);
    t.places.push({ id, name, query: name, kind: "sight", inGuide: true });
    return id;
  }

  function serialize(t) {
    const y = t.meta.year || 2026;
    const L = [];
    L.push("侍藍行程");
    L.push(t.meta.title || "");
    L.push(`v${t.meta.dataVersion || 1}｜${t.meta.updated || ""}`);
    L.push("");
    L.push("【團友】");
    (t.people || []).forEach((p) => {
      const roles = p.roles || [];
      const role = roles.includes("driver") ? "主駕駛" : roles.includes("copilot") ? "副駕駛" : "";
      const bits = [p.display];
      if (role) bits.push(role);
      if ((p.flights || []).length) bits.push(p.flights.join(" "));
      L.push(bits.join("｜"));
      if (p.freqNote && !/確認號/.test(p.freqNote) && !/^[A-Z0-9]{5,7}$/i.test(p.freqNote.trim())) {
        L.push("備註：" + p.freqNote);
      }
    });
    L.push("");
    L.push("【航班】");
    (t.flights || []).forEach((f) => {
      const who = (f.who || []).map((id) => displayOf(t, id)).join("、");
      const dep = [f.from?.code, f.from?.term].filter(Boolean).join(" ");
      const arr = [f.to?.code, f.to?.term].filter(Boolean).join(" ");
      L.push(`${f.no}｜${md(f.date)}${f.dow || ""}｜${f.dep} ${dep}→${f.arr} ${arr}｜${who}｜${CH_TIER[f.tier] || "③"}`);
      if (f.notes) L.push("備註：" + f.notes);
      if (f.checkinOpen?.label) L.push("預辦：" + f.checkinOpen.label + " 開");
      if (f.airportArrive?.label) L.push("到場：" + f.airportArrive.label);
      if (f.bag) L.push("行李：" + f.bag);
      if (f.checkinUrl) L.push("連結：" + f.checkinUrl);
    });
    L.push("");
    L.push("【住宿】");
    (t.stays || []).forEach((s) => {
      const nights = s.nights || [];
      let span = "";
      if (nights.length === 1) span = md(nights[0]) + "晚";
      else if (nights.length) span = md(nights[0]) + "–" + md(nights[nights.length - 1]) + "晚";
      const who = (s.who || []).map((id) => displayOf(t, id)).join("、");
      const pl = (t.places || []).find((p) => p.id === s.placeId);
      const addr = pl ? (pl.address || pl.query || "") : "";
      const bits = [span, s.name, addr, who, CH_TIER[s.tier] || "①"];
      if (s.ciTime) bits.push("CI " + s.ciTime);
      L.push(bits.filter(Boolean).join("｜"));
      if (s.notes) L.push("備註：" + s.notes);
      if (s.parking) L.push("停車：" + s.parking);
      if (s.meal) L.push("餐：" + s.meal);
    });
    if (t.car?.company) {
      L.push("");
      L.push("【租車】");
      L.push(t.car.company);
      const pu = t.car.pickup || {};
      const drop = t.car.dropoff || {};
      if (pu.date || pu.time) L.push(`取｜${pu.date || ""} ${pu.time || ""}｜${pu.who || ""}｜②`);
      if (pu.note) L.push("備註：" + pu.note);
      if (pu.meet) L.push("會合：" + pu.meet);
      if (drop.date || drop.time) L.push(`還｜${drop.date || ""} ${drop.time || ""}｜${drop.who || ""}｜②`);
      if (drop.note) L.push("備註：" + drop.note);
    }
    L.push("");
    L.push("【地點】");
    (t.places || []).forEach((p) => {
      const coord = p.lat != null ? `${p.lat},${p.lng}` : "";
      L.push([p.name, p.query || p.address || "", coord].join("｜"));
    });
    L.push("");
    (t.days || []).forEach((d) => {
      L.push(`【${md(d.date)}${d.dow || ""}】${d.theme || ""}`);
      (d.blocks || []).forEach((b) => {
        let tm = b.time || "";
        if (b.end) tm = `${tm}-${b.end}`;
        if (b.tz) tm += b.tz;
        const flags = [];
        if (b.hard) flags.push("硬性");
        if (b.status === "cancelled") flags.push("取消");
        flags.push(CH_TIER[b.tier] || "③");
        let pname = "";
        if (b.placeId) {
          const pl = (t.places || []).find((p) => p.id === b.placeId);
          if (pl) pname = pl.name;
        }
        const bits = [tm, b.title || "", flags.join("｜")];
        if (pname) bits.push(pname);
        L.push(bits.join("｜"));
        if (b.notes) L.push("備註：" + b.notes);
      });
      L.push("");
    });
    if ((t.dining || []).length) {
      L.push("【晚餐後備】");
      t.dining.forEach((x) => {
        L.push(`${x.priority || ""}｜${x.name}｜${x.url || ""}`);
        if (x.notes) L.push("備註：" + x.notes);
      });
      L.push("");
    }
    if ((t.unlocked || []).length) {
      L.push("【未鎖】");
      t.unlocked.forEach((u) => L.push(`${u.title}｜${CH_TIER[u.tier] || "②"}`));
    }
    return L.join("\n").trim() + "\n";
  }

  function serializeDay(t, ymd) {
    const d = (t.days || []).find((x) => x.date === ymd);
    if (!d) return "";
    const slice = emptyTrip();
    slice.meta = Object.assign({}, t.meta);
    slice.emergency = t.emergency;
    const pids = new Set();
    (d.blocks || []).forEach((b) => { if (b.placeId) pids.add(b.placeId); });
    if (d.stayId) pids.add(d.stayId);
    slice.places = (t.places || []).filter((p) => pids.has(p.id));
    slice.stays = (t.stays || []).filter((s) => s.id === d.stayId || (s.nights || []).includes(d.date));
    slice.days = [d];
    const lines = serialize(slice).split("\n");
    if (lines[0] === "侍藍行程") lines.splice(1, 0, "一日");
    return lines.join("\n");
  }

  const COORD_RE = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/;

  function serializePatch(t, names) {
    const want = names && names.length
      ? new Set(names.map((n) => String(n).trim()).filter(Boolean))
      : null;
    const list = (t.places || []).filter((p) => {
      if (!want) return p.lat != null && p.lng != null;
      return want.has(p.name) || want.has(p.id) || (p.nameJa && want.has(p.nameJa));
    });
    const L = ["侍藍行程", "補丁", "", "【地點】"];
    list.forEach((p) => {
      const coord = p.lat != null ? `${p.lat},${p.lng}` : "";
      L.push(coord ? `${p.name}｜${coord}` : p.name);
    });
    return L.join("\n") + "\n";
  }

  function destFromMapLine(line) {
    const m = String(line || "").match(/https?:\/\/\S+/);
    if (!m) return "";
    try {
      const u = new URL(m[0]);
      const dest = u.searchParams.get("destination") || u.searchParams.get("daddr")
        || u.searchParams.get("q") || u.searchParams.get("ll") || "";
      return decodeURIComponent(String(dest).replace(/\+/g, " ")).trim();
    } catch (_) {
      return "";
    }
  }

  function placeFromDest(t, dest, fallbackName) {
    if (!dest && !fallbackName) return "";
    const coord = String(dest || "").match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coord) {
      const name = fallbackName || dest;
      const rec = {
        id: slug(name),
        name,
        query: dest,
        kind: "sight",
        inGuide: true,
        lat: +coord[1],
        lng: +coord[2],
      };
      const exist = t.places.find((p) => p.id === rec.id || p.name === name
        || (p.lat === rec.lat && p.lng === rec.lng));
      if (exist) {
        if (exist.lat == null) { exist.lat = rec.lat; exist.lng = rec.lng; }
        return exist.id;
      }
      t.places.push(rec);
      return rec.id;
    }
    return findPlace(t, dest || fallbackName);
  }

  function parseHumanDay(raw, t) {
    const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
    const head = (lines[0] || "").trim();
    const hm = head.match(/20(\d{2})\s*[｜|]\s*(\d{1,2}\/\d{1,2})\s*[（(]([^）)]*)[）)]?/);
    if (!hm) return t;
    t.meta.year = 2000 + +hm[1];
    t.meta.partial = true;
    const date = parseMd(hm[2], t.meta.year);
    const dow = (hm[3] || "").trim();
    const titleBit = head.split(/[｜|]/)[0].replace(/20\d{2}/, "").trim();
    if (titleBit) t.meta.title = titleBit;

    let i = 1;
    while (i < lines.length && !lines[i].trim()) i++;
    let theme = "";
    if (i < lines.length) {
      const L = lines[i].trim();
      if (!/^[·•⏰]/.test(L) && !/^今晚住/.test(L) && L !== "起飛") {
        theme = L;
        i++;
      }
    }

    const curDay = { date, dow, theme, locked: true, blocks: [] };
    t.days.push(curDay);

    while (i < lines.length) {
      const line = lines[i].trim();
      i++;
      if (!line || line === "起飛") continue;
      if (/^今晚住[：:]/.test(line)) {
        const name = line.replace(/^今晚住[：:]\s*/, "").trim();
        if (name) {
          const pid = findPlace(t, name);
          t.stays.push({
            id: pid, name, short: name.split(/\s+/)[0],
            nights: [date], checkIn: date, checkOut: "",
            who: [], tier: 1, placeId: pid,
          });
          curDay.stayId = pid;
        }
        continue;
      }
      const bm = line.match(/^[·•⏰]\s*(?:(\d{1,2}:\d{2})(?:[–\-〜～](\d{1,2}:\d{2}))?\s+)?(.*)$/);
      if (!bm) continue;
      const title = (bm[3] || "").trim();
      const block = {
        id: `${date}-${curDay.blocks.length}`,
        time: bm[1] || "",
        end: bm[2] || "",
        tz: "",
        title,
        hard: /^⏰/.test(line),
        tier: 3,
        status: "",
        placeId: "",
        nav: false,
      };
      while (i < lines.length && (/^\s+(Google|蘋果|G |)/.test(lines[i]) || /^\s+https?:/.test(lines[i]))) {
        const dest = destFromMapLine(lines[i]);
        i++;
        if (dest && !block.placeId) {
          block.placeId = placeFromDest(t, dest, title);
          block.nav = true;
        }
      }
      curDay.blocks.push(block);
    }
    return t;
  }

  function parse(text, base) {
    const t = emptyTrip();
    if (base?.emergency) t.emergency = base.emergency;
    const raw = String(text || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return t;
    const lines = raw.split("\n");
    let year = 2026;
    const ym = raw.match(/20\d{2}/);
    if (ym) year = +ym[0];
    t.meta.year = year;

    let sec = "";
    let curDay = null;
    let last = null;
    let titled = false;

    function eatNote(line) {
      if (line.startsWith("備註：") && last) {
        last.notes = (last.notes ? last.notes + " " : "") + line.slice(3);
        return true;
      }
      return false;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "一日") { t.meta.partial = true; continue; }
      if (line === "補丁" || line === "起飛補丁") {
        t.meta.partial = true;
        t.meta.patch = true;
        continue;
      }
      if (!titled && !sec && line && line !== "侍藍行程" && !line.startsWith("【") && !/^v\d+｜/.test(line)) {
        t.meta.title = line;
        titled = true;
      }
      if (line.startsWith("v") && line.includes("｜")) {
        const m = line.match(/v(\d+)｜(.*)/);
        if (m) {
          t.meta.dataVersion = +m[1] || 1;
          t.meta.updated = m[2].trim();
        }
      }
      const secHit = line.match(/^【(.+?)】(.*)$/);
      if (secHit) {
        const name = secHit[1];
        const rest = secHit[2] || "";
        const dayHit = name.match(/^(\d{1,2}\/\d{1,2})(.*)$/);
        if (dayHit) {
          sec = "day";
          const date = parseMd(dayHit[1], year);
          const dow = (dayHit[2] || "").trim();
          curDay = { date, dow, theme: rest.trim(), locked: true, blocks: [] };
          t.days.push(curDay);
          last = curDay;
        } else {
          sec = name;
          curDay = null;
          last = null;
        }
        continue;
      }
      if (!line) continue;
      if (eatNote(line)) continue;
      if (line.startsWith("預辦：") && last) { last.checkinOpen = { label: line.slice(3).replace(/ 開$/, "") }; continue; }
      if (line.startsWith("到場：") && last) { last.airportArrive = { label: line.slice(3) }; continue; }
      if (line.startsWith("行李：") && last) { last.bag = line.slice(3); continue; }
      if (line.startsWith("連結：") && last) { last.checkinUrl = line.slice(3); continue; }
      if (line.startsWith("停車：") && last) { last.parking = line.slice(3); continue; }
      if (line.startsWith("餐：") && last) { last.meal = line.slice(2); continue; }
      if (line.startsWith("會合：") && last) { last.meet = line.slice(3); continue; }

      if (sec === "團友") {
        const p = line.split("｜").map((s) => s.trim());
        const display = p[0];
        const id = slug(display).toLowerCase();
        const rec = { id, display, roles: ["viewer"], flights: [] };
        p.slice(1).forEach((bit) => {
          if (bit === "主駕駛") rec.roles = ["planner", "driver"];
          else if (bit === "副駕駛") rec.roles = ["planner", "copilot"];
          else if (/確認號/.test(bit)) rec.hxRecord = bit.replace(/確認號\s*/, "");
          else if (/HX|CX|NH|JL/.test(bit)) rec.flights = bit.split(/\s+/).filter(Boolean);
        });
        t.people.push(rec);
        last = rec;
      } else if (sec === "航班") {
        const p = line.split("｜").map((s) => s.trim());
        const no = p[0];
        const dateBit = p[1] || "";
        const date = parseMd(dateBit, year);
        const dow = (dateBit.replace(/^\d{1,2}\/\d{1,2}/, "") || "").trim();
        const route = p[2] || "";
        const rm = route.match(/^(\d{1,2}:\d{2})\s+(.+?)→(\d{1,2}:\d{2})\s+(.+)$/);
        const fromCode = ((rm && rm[2]) || "").split(/\s+/)[0];
        const fromTerm = ((rm && rm[2]) || "").split(/\s+/).slice(1).join(" ");
        const toCode = ((rm && rm[4]) || "").split(/\s+/)[0];
        const toTerm = ((rm && rm[4]) || "").split(/\s+/).slice(1).join(" ");
        const fl = {
          id: no,
          no,
          date,
          dow,
          airline: /HX/.test(no) ? "香港航空" : /CX/.test(no) ? "國泰航空" : "",
          dep: rm ? rm[1] : "",
          arr: rm ? rm[3] : "",
          from: { code: fromCode, name: fromCode, term: fromTerm },
          to: { code: toCode, name: toCode, term: toTerm },
          who: idsFromNames(t, p[3] || ""),
          tier: TIER_CH[(p[4] || "③").charAt(0)] || 3,
        };
        t.flights.push(fl);
        last = fl;
      } else if (sec === "住宿") {
        const p = line.split("｜").map((s) => s.trim());
        const span = p[0] || "";
        const dates = [...span.matchAll(/(\d{1,2}\/\d{1,2})/g)].map((m) => parseMd(m[1], year));
        let nights = [];
        if (dates.length === 1) nights = [dates[0]];
        else if (dates.length >= 2) {
          const a = new Date(dates[0] + "T12:00:00");
          const b = new Date(dates[1] + "T12:00:00");
          for (let x = new Date(a); x <= b; x.setDate(x.getDate() + 1)) {
            const y = x.getFullYear();
            const mo = String(x.getMonth() + 1).padStart(2, "0");
            const da = String(x.getDate()).padStart(2, "0");
            nights.push(`${y}-${mo}-${da}`);
          }
        }
        const name = p[1] || "";
        const addr = p[2] || "";
        const pid = slug(name);
        if (!t.places.some((x) => x.id === pid) && (name || addr)) {
          t.places.push({ id: pid, name, address: addr, query: addr || name, kind: "stay", inGuide: true });
        }
        const stay = {
          id: pid,
          name,
          short: name.split(/\s+/)[0],
          nights,
          checkIn: nights[0] || "",
          checkOut: "",
          who: idsFromNames(t, p[3] || ""),
          tier: TIER_CH[(p.find((x) => /[①②③]/.test(x)) || "①").charAt(0)] || 1,
          placeId: pid,
        };
        const ci = p.find((x) => x.startsWith("CI"));
        if (ci) stay.ciTime = ci.replace(/^CI\s*/, "");
        t.stays.push(stay);
        last = stay;
      } else if (sec === "租車") {
        if (!line.includes("｜") && !t.car.company) { t.car.company = line; continue; }
        const p = line.split("｜").map((s) => s.trim());
        if (p[0] === "取") {
          const dt = (p[1] || "").trim().split(/\s+/);
          t.car.pickup = { date: dt[0] || "", time: dt[1] || "", who: p[2] || "", tier: 2 };
          last = t.car.pickup;
        } else if (p[0] === "還") {
          const dt = (p[1] || "").trim().split(/\s+/);
          t.car.dropoff = { date: dt[0] || "", time: dt[1] || "", who: p[2] || "", tier: 2 };
          last = t.car.dropoff;
        }
      } else if (sec === "地點") {
        const p = line.split("｜").map((s) => s.trim());
        const name = p[0];
        if (!name) continue;
        let q = "";
        let coordStr = "";
        if (p.length >= 3 && COORD_RE.test(p[2])) {
          q = p[1];
          coordStr = p[2];
        } else if (p.length >= 2 && COORD_RE.test(p[1])) {
          coordStr = p[1];
          if (p[2] && !COORD_RE.test(p[2])) q = p[2];
        } else {
          q = p[1] || "";
          coordStr = p[2] || "";
        }
        const rec = { id: slug(name), name, kind: "sight", inGuide: true };
        if (q) {
          rec.nameJa = q;
          rec.query = q;
          rec.address = q;
        }
        const coord = coordStr.split(",");
        if (coord.length === 2 && !isNaN(+coord[0]) && !isNaN(+coord[1])) {
          rec.lat = +coord[0];
          rec.lng = +coord[1];
        }
        const exist = t.places.find((x) => x.name === name || x.id === rec.id);
        if (exist) {
          const kind = exist.kind;
          Object.assign(exist, rec, { id: exist.id, kind: kind || rec.kind });
        } else t.places.push(rec);
      } else if (sec === "day" && curDay) {
        const p = line.split("｜").map((s) => s.trim());
        let time = p[0] || "";
        let tz = "";
        let end = "";
        const tm = time.match(/^(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?([A-Z]{3})?$/);
        if (tm) {
          time = tm[1];
          end = tm[2] || "";
          tz = tm[3] || "";
        } else if (!/\d/.test(time)) {
          p.unshift("");
          time = "";
        }
        const title = p[1] || "";
        const flagStr = p.slice(2, -0).join("｜");
        const hard = /硬性/.test(line);
        const cancelled = /取消/.test(line);
        let tier = 3;
        const tch = line.match(/[①②③]/);
        if (tch) tier = TIER_CH[tch[0]];
        const lastField = p[p.length - 1];
        let placeName = "";
        if (p.length >= 4 && lastField && !/[①②③]/.test(lastField) && lastField !== "硬性" && lastField !== "取消") {
          placeName = lastField;
        }
        const block = {
          id: `${curDay.date}-${curDay.blocks.length}`,
          time,
          end,
          tz,
          title,
          hard,
          tier,
          status: cancelled ? "cancelled" : "",
          placeId: placeName ? findPlace(t, placeName) : "",
          nav: !!placeName,
        };
        curDay.blocks.push(block);
        last = block;
      } else if (sec === "晚餐後備") {
        const p = line.split("｜").map((s) => s.trim());
        t.dining.push({ id: slug(p[1] || p[0]), priority: p[0], name: p[1] || p[0], url: p[2] || "" });
        last = t.dining[t.dining.length - 1];
      } else if (sec === "未鎖") {
        const p = line.split("｜").map((s) => s.trim());
        const tier = TIER_CH[(p[1] || "②").charAt(0)] || 2;
        t.unlocked.push({ id: slug(p[0]), title: p[0], tier });
      }
    }

    if (!t.days.length) parseHumanDay(raw, t);
    if ((t.places || []).length && !t.days.length && !t.people.length) {
      t.meta.partial = true;
      t.meta.patch = true;
    }

    t.days.forEach((d) => {
      const st = t.stays.find((s) => (s.nights || []).includes(d.date));
      if (st) d.stayId = st.id;
    });
    t.flights.forEach((f) => {
      const pl = t.places.find((p) => /福岡/.test(p.name) && /國際/.test(p.name));
      if (pl && /FUK/.test(f.to?.code || "")) f.to.placeId = pl.id;
    });
    const withC = (t.places || []).filter((p) => p.lat != null && p.lng != null);
    (t.places || []).forEach((p) => {
      if (p.lat != null) return;
      const blob = `${p.address || ""} ${p.query || ""} ${p.name || ""}`;
      const keys = blob.match(/\d{3,5}-\d{1,4}/g) || [];
      const hit = withC.find((q) => {
        const qb = `${q.address || ""} ${q.query || ""} ${q.name || ""}`;
        return keys.some((k) => qb.includes(k));
      });
      if (hit) {
        p.lat = hit.lat;
        p.lng = hit.lng;
      }
    });
    return t;
  }

  w.TripText = { emptyTrip, serialize, serializeDay, serializePatch, parse };
})(window);
