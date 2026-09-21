(function(){
  "use strict";

  // ---------------------------------------------------------------
  // Config (peut être personnalisée par page via window.EDT_CONFIG)
  // ---------------------------------------------------------------
  var CFG = window.EDT_CONFIG || {};
  var ICS_URL = "data/edt.ics";
  var HOUR_START = 8;
  var HOUR_END = 21;
  var HOUR_PX = CFG.hourPx || 64;
  var DEFAULT_SCROLL_HOUR = (CFG.scrollHour != null) ? CFG.scrollHour : HOUR_START;
  var REFRESH_MS = 5 * 60 * 1000;

  var DOW_FULL = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
  var DOW_SHORT = ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
  var MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

  var PALETTE = [
    "#E15554","#F0A202","#7A8B4F","#2E8B84","#4B5A85",
    "#7C4A6E","#B5622B","#4066A3","#3E6A4B","#A6436B",
    "#C98A2B","#5C7A99"
  ];

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var state = {
    events: [],
    mode: CFG.mode || "day",       // "day" | "week"
    cursor: startOfDay(new Date()),
    colorMap: {},
    calMonth: startOfDay(new Date())
  };

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  var el = {
    statusPanel: document.getElementById("statusPanel"),
    board: document.getElementById("board"),
    hourRail: document.getElementById("hourRail"),
    hourRailBody: document.getElementById("hourRailBody"),
    colHeads: document.getElementById("colHeads"),
    dayColumns: document.getElementById("dayColumns"),
    boardScroll: document.getElementById("boardScroll"),
    datePill: document.getElementById("datePill"),
    dateMain: document.getElementById("dateMain"),
    dateSub: document.getElementById("dateSub"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    dayModeBtn: document.getElementById("dayModeBtn"),
    weekModeBtn: document.getElementById("weekModeBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    legend: document.getElementById("legend"),
    metaLine: document.getElementById("metaLine"),
    calPop: document.getElementById("calPop"),
    calGrid: document.getElementById("calGrid"),
    calMonthLabel: document.getElementById("calMonthLabel"),
    calPrevMonth: document.getElementById("calPrevMonth"),
    calNextMonth: document.getElementById("calNextMonth"),
    calTodayBtn: document.getElementById("calTodayBtn")
  };

  // ---------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------
  function startOfDay(d){ var r=new Date(d); r.setHours(0,0,0,0); return r; }
  function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function isToday(d){ return sameDay(d, new Date()); }
  function mondayOf(d){ var r=startOfDay(d); var wd=(r.getDay()+6)%7; return addDays(r,-wd); }

  // ---------------------------------------------------------------
  // ICS parsing
  // ---------------------------------------------------------------
  function unfoldLines(text){
    var raw = text.split(/\r\n|\n|\r/);
    var out = [];
    for (var i=0;i<raw.length;i++){
      var line = raw[i];
      if ((line[0]===" " || line[0]==="\t") && out.length){
        out[out.length-1] += line.slice(1);
      } else {
        out.push(line);
      }
    }
    return out;
  }

  function parseIcsDate(value){
    var m = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    var y=+m[1], mo=+m[2], da=+m[3];
    if (!m[4]){
      return { date: new Date(y, mo-1, da, 0,0,0), allDay:true };
    }
    var h=+m[5], mi=+m[6], se=+m[7];
    if (m[8]==="Z"){
      return { date: new Date(Date.UTC(y, mo-1, da, h, mi, se)), allDay:false };
    }
    return { date: new Date(y, mo-1, da, h, mi, se), allDay:false };
  }

  function parseIcsLine(line){
    var idx = line.indexOf(":");
    if (idx===-1) return null;
    var left = line.slice(0, idx);
    var value = line.slice(idx+1);
    var parts = left.split(";");
    var key = parts[0].toUpperCase();
    var params = {};
    for (var i=1;i<parts.length;i++){
      var kv = parts[i].split("=");
      if (kv.length===2) params[kv[0].toUpperCase()] = kv[1];
    }
    return { key:key, params:params, value:value };
  }

  function unescapeIcsText(s){
    return (s||"")
      .replace(/\\n/g,"\n")
      .replace(/\\,/g,",")
      .replace(/\\;/g,";")
      .replace(/\\\\/g,"\\");
  }

  function parseIcs(text){
    var lines = unfoldLines(text);
    var events = [];
    var cur = null;
    for (var i=0;i<lines.length;i++){
      var l = lines[i];
      if (!l) continue;
      if (l==="BEGIN:VEVENT"){ cur = {}; continue; }
      if (l==="END:VEVENT"){ if (cur) events.push(cur); cur=null; continue; }
      if (!cur) continue;
      var parsed = parseIcsLine(l);
      if (!parsed) continue;
      if (parsed.key==="DTSTART"){
        var ds = parseIcsDate(parsed.value);
        if (ds){ cur.start = ds.date; cur.allDay = ds.allDay; }
      } else if (parsed.key==="DTEND"){
        var de = parseIcsDate(parsed.value);
        if (de){ cur.end = de.date; }
      } else if (parsed.key==="SUMMARY"){
        cur.summary = unescapeIcsText(parsed.value);
      } else if (parsed.key==="LOCATION"){
        cur.location = unescapeIcsText(parsed.value);
      } else if (parsed.key==="DESCRIPTION"){
        cur.description = unescapeIcsText(parsed.value);
      } else if (parsed.key==="STATUS"){
        cur.status = parsed.value;
      } else if (parsed.key==="UID"){
        cur.uid = parsed.value;
      }
    }
    var out = [];
    for (var j=0;j<events.length;j++){
      var e = events[j];
      if (!e.start) continue;
      if (!e.end) e.end = new Date(e.start.getTime() + 60*60*1000);
      var blob = ((e.summary||"") + " " + (e.description||"") + " " + (e.status||"")).toLowerCase();
      e.cancelled = /annul|absent|supprim/.test(blob);
      e.subject = subjectFromSummary(e.summary||"Cours");
      out.push(e);
    }
    out.sort(function(a,b){ return a.start - b.start; });
    return out;
  }

  function subjectFromSummary(summary){
    var s = summary.split("\n")[0];
    s = s.split(" - ")[0];
    return s.trim() || "Cours";
  }

  // ---------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------
  function colorFor(subject){
    if (state.colorMap[subject]) return state.colorMap[subject];
    var keys = Object.keys(state.colorMap);
    var color = PALETTE[keys.length % PALETTE.length];
    state.colorMap[subject] = color;
    return color;
  }

  function hexToRgba(hex, a){
    var h = hex.replace("#","");
    var r = parseInt(h.substring(0,2),16);
    var g = parseInt(h.substring(2,4),16);
    var b = parseInt(h.substring(4,6),16);
    return "rgba("+r+","+g+","+b+","+a+")";
  }

  // ---------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------
  function fetchSchedule(showSpinner){
    if (showSpinner && el.refreshBtn) el.refreshBtn.classList.add("spinning");
    showStatus("loading");
    var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function(){ controller.abort(); }, 10000) : null;
    var fetchedUrl = ICS_URL + "?t=" + Date.now();
    fetch(fetchedUrl, { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function(res){
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok){
          var e = new Error("HTTP " + res.status);
          e.httpStatus = res.status;
          throw e;
        }
        return res.text();
      })
      .then(function(text){
        // Filet de sécurité : si le fichier récupéré n'est pas un vrai .ics
        // (ex: page 404 de GitHub Pages renvoyée avec un statut 200, fichier
        // vide, ou contenu corrompu), on le signale clairement au lieu
        // d'afficher un planning vide sans explication.
        if (!/BEGIN:VCALENDAR/i.test(text)){
          var e2 = new Error("Contenu invalide (pas de BEGIN:VCALENDAR)");
          e2.badContent = true;
          e2.snippet = text.slice(0, 160);
          throw e2;
        }
        state.events = parseIcs(text);
        assignColorsInOrder();
        hideStatus();
        renderLegend();
        render();
        el.metaLine.textContent = "Dernière synchro : " + new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) + " · " + state.events.length + " événement(s)";
      })
      .catch(function(err){
        if (timeoutId) clearTimeout(timeoutId);
        showStatus("error", err, fetchedUrl);
      })
      .finally(function(){
        if (el.refreshBtn) el.refreshBtn.classList.remove("spinning");
      });
  }

  function assignColorsInOrder(){
    state.colorMap = {};
    var seen = {};
    var order = [];
    state.events.forEach(function(e){
      if (!seen[e.subject]){ seen[e.subject]=true; order.push(e.subject); }
    });
    order.forEach(function(subj, i){
      state.colorMap[subj] = PALETTE[i % PALETTE.length];
    });
  }

  function showStatus(kind, err, url){
    el.board.style.display = "none";
    el.statusPanel.style.display = "block";
    if (kind==="loading"){
      el.statusPanel.innerHTML = "<strong>Récupération de l'emploi du temps…</strong>Lecture de data/edt.ics";
    } else if (kind==="error"){
      var diag = "";
      if (err && err.httpStatus === 404){
        diag = "Diagnostic : le fichier <code>data/edt.ics</code> répond en <strong>404</strong> — il n'existe donc pas encore à cet endroit du site. " +
               "Le plus souvent ça veut dire que le workflow GitHub Actions « Sync emploi du temps » n'a jamais tourné avec succès (secret manquant, permissions d'écriture désactivées, ou pas encore lancé une première fois manuellement).";
      } else if (err && err.httpStatus){
        diag = "Diagnostic : le serveur a répondu avec le code HTTP <strong>" + err.httpStatus + "</strong> pour <code>" + escapeHtml(url||ICS_URL) + "</code>.";
      } else if (err && err.badContent){
        diag = "Diagnostic : le fichier a bien été trouvé, mais son contenu ne ressemble pas à un vrai fichier .ics (il ne contient pas <code>BEGIN:VCALENDAR</code>). " +
               "Début du contenu reçu : <code>" + escapeHtml(err.snippet||"") + "</code>";
      } else if (err && err.name === "AbortError"){
        diag = "Diagnostic : la requête a expiré après 10 secondes sans réponse (problème réseau ou serveur trop lent).";
      } else if (err){
        diag = "Diagnostic : " + escapeHtml(err.message || String(err)) + ".";
      }
      el.statusPanel.innerHTML =
        "<strong>L'emploi du temps n'est pas encore disponible</strong>" +
        "Le fichier data/edt.ics est introuvable ou pas encore synchronisé (la synchro automatique tourne toutes les 10 minutes). " +
        "Tu peux réessayer, ou coller ci-dessous le contenu du fichier .ics téléchargé manuellement depuis Hyperplanning en attendant." +
        (diag ? "<p style='font-size:.72rem;text-align:left;background:var(--paper-dark);border-radius:8px;padding:8px 10px;margin-top:12px;'>" + diag + "</p>" : "") +
        "<div class='row-btns'><button class='btn' id='retryBtn'>Réessayer</button>" +
        "<a class='btn ghost' href='" + (url||ICS_URL) + "' target='_blank' rel='noopener'>Ouvrir data/edt.ics</a></div>" +
        "<textarea id='icsPaste' placeholder='Colle ici le contenu du fichier .ics…'></textarea>" +
        "<div class='row-btns'><button class='btn ghost' id='loadPasteBtn'>Charger ce texte</button></div>";
      document.getElementById("retryBtn").addEventListener("click", function(){ fetchSchedule(true); });
      document.getElementById("loadPasteBtn").addEventListener("click", function(){
        var txt = document.getElementById("icsPaste").value;
        if (!txt.trim()) return;
        state.events = parseIcs(txt);
        assignColorsInOrder();
        hideStatus();
        renderLegend();
        render();
        el.metaLine.textContent = "Chargé manuellement le " + new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      });
    }
  }
  function hideStatus(){
    el.statusPanel.style.display = "none";
    el.board.style.display = "block";
  }

  // ---------------------------------------------------------------
  // Rendering — hour rail
  // ---------------------------------------------------------------
  function buildHourRail(container){
    container.innerHTML = "";
    for (var h=HOUR_START; h<HOUR_END; h++){
      var slot = document.createElement("div");
      slot.className = "hour-slot";
      slot.style.height = HOUR_PX + "px";
      slot.textContent = (h<10?"0":"")+h+"h";
      container.appendChild(slot);
    }
  }

  function eventsForDay(day){
    return state.events.filter(function(e){ return !e.allDay && sameDay(e.start, day); });
  }

  function layoutDay(events){
    var sorted = events.slice().sort(function(a,b){ return a.start-b.start || a.end-b.end; });
    var clusters = [];
    var active = [];
    sorted.forEach(function(e){
      active = active.filter(function(a){ return a.end > e.start; });
      if (active.length===0){
        var cluster = { items: [] };
        clusters.push(cluster);
        e._cluster = cluster;
      } else {
        e._cluster = active[0]._cluster;
      }
      e._cluster.items.push(e);
      active.push(e);
    });
    clusters.forEach(function(cluster){
      var cols = [];
      cluster.items.sort(function(a,b){ return a.start-b.start; });
      cluster.items.forEach(function(e){
        var placed = false;
        for (var c=0;c<cols.length;c++){
          if (cols[c] <= e.start){ cols[c] = e.end; e._col = c; placed = true; break; }
        }
        if (!placed){ cols.push(e.end); e._col = cols.length-1; }
      });
      cluster.items.forEach(function(e){ e._colCount = cols.length; });
    });
    return sorted;
  }

  function minutesFromStart(d){
    return (d.getHours()-HOUR_START)*60 + d.getMinutes();
  }

  function buildEventNode(e){
    var gridHeight = (HOUR_END-HOUR_START) * HOUR_PX;
    var top = Math.max(0, (minutesFromStart(e.start)/60) * HOUR_PX);
    var rawEnd = Math.min(gridHeight, minutesFromStart(e.end)/60 * HOUR_PX);
    var height = Math.max(rawEnd - top, 24);
    var color = colorFor(e.subject);

    var node = document.createElement("div");
    node.className = "event" + (e.cancelled?" cancelled":"") + (height<40?" tiny":"");
    node.style.top = top+"px";
    node.style.height = height+"px";
    node.style.background = hexToRgba(color, e.cancelled?0.18:0.24);
    node.style.borderLeftColor = color;
    node.style.color = "var(--ink)";

    var colCount = e._colCount || 1;
    var col = e._col || 0;
    var widthPct = 100/colCount;
    node.style.left = "calc(" + (widthPct*col) + "% + 3px)";
    node.style.width = "calc(" + widthPct + "% - 6px)";

    var timeStr = pad2(e.start.getHours())+"h"+pad2(e.start.getMinutes()) + " – " + pad2(e.end.getHours())+"h"+pad2(e.end.getMinutes());
    var room = roomLabel(e);
    var roomHtml = room ? "<span class='t-room' title='"+escapeHtml(room.full)+"'>"+escapeHtml(room.short)+"</span>" : "";
    var html;
    if (height<40){
      // Petit créneau : salle sur la même ligne que l'heure
      html = "<span class='t-time'>"+timeStr+"</span>"+roomHtml+"<span class='t-name'>"+escapeHtml(e.summary)+"</span>";
    } else {
      html = "<span class='t-time'>"+timeStr+"</span><span class='t-name'>"+escapeHtml(e.summary)+"</span>"+roomHtml;
    }
    if (e.cancelled) html += "<span class='badge'>Prof./pers. absent</span>";
    node.innerHTML = html;
    return node;
  }

  // Salle(s) d'un événement : champ LOCATION, sinon ligne "Salle : ..." de la
  // description. Plusieurs salles → on en garde 2 et on résume le reste (+N).
  function roomLabel(e){
    var loc = (e.location || "").trim();
    if (!loc && e.description){
      var m = /Salle\s*:\s*([^\n]+)/i.exec(e.description);
      if (m) loc = m[1].trim();
    }
    if (!loc) return null;
    var rooms = loc.split(/\s*,\s*/).filter(Boolean);
    var short = rooms.length > 2 ? rooms.slice(0,2).join(", ") + " +" + (rooms.length-2) : rooms.join(", ");
    return { short: short, full: rooms.join(", ") };
  }

  function pad2(n){ return (n<10?"0":"")+n; }
  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; });
  }

  function addNowLine(container, day){
    if (!isToday(day)) return;
    var now = new Date();
    var top = (minutesFromStart(now)/60) * HOUR_PX;
    var line = document.createElement("div");
    line.className = "now-line";
    line.style.top = top+"px";
    container.appendChild(line);
  }

  // ---------------------------------------------------------------
  // Render: header labels
  // ---------------------------------------------------------------
  function updateDateLabel(){
    if (state.mode==="day"){
      var d = state.cursor;
      el.dateMain.textContent = capitalize(DOW_FULL[d.getDay()]) + " " + d.getDate() + " " + MONTHS[d.getMonth()];
      el.dateSub.textContent = isToday(d) ? "aujourd'hui" : d.getFullYear().toString();
    } else {
      var mon = mondayOf(state.cursor);
      var sat = addDays(mon,5);
      el.dateMain.textContent = mon.getDate() + " – " + sat.getDate() + " " + MONTHS[sat.getMonth()];
      el.dateSub.textContent = "semaine " + isoWeekNumber(mon);
    }
  }

  function isoWeekNumber(d){
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = (date.getUTCDay()+6)%7;
    date.setUTCDate(date.getUTCDate()-dayNum+3);
    var firstThursday = new Date(Date.UTC(date.getUTCFullYear(),0,4));
    var diff = date - firstThursday;
    return 1 + Math.round(diff/(7*86400000));
  }

  // ---------------------------------------------------------------
  // Render: main board
  // ---------------------------------------------------------------
  function render(){
    updateDateLabel();
    var days = state.mode==="day" ? [state.cursor] : weekDays(state.cursor);
    renderGrid(days);

    if (!render._scrolled){
      el.boardScroll.scrollTop = Math.max(0, (DEFAULT_SCROLL_HOUR - HOUR_START) * HOUR_PX - 20);
      render._scrolled = true;
    }
  }

  // Grille classique : un rail d'heures partagé + des colonnes côte à côte
  // (jour unique, ou semaine sur écran large).
  function renderGrid(days){
    el.hourRail.innerHTML = "";
    buildHourRail(el.hourRailBody);
    el.colHeads.innerHTML = "";
    el.colHeads.style.display = "";
    el.hourRailBody.style.display = "";
    el.dayColumns.innerHTML = "";
    el.dayColumns.className = "day-columns";

    days.forEach(function(day){
      var head = document.createElement("div");
      head.className = "col-head" + (isToday(day)?" is-today":"");
      head.innerHTML = "<div class='dname'>"+ (state.mode==="week" ? capitalize(DOW_SHORT[day.getDay()]) : capitalize(DOW_FULL[day.getDay()])) +"</div><div class='dnum'>"+day.getDate()+"</div>";
      el.colHeads.appendChild(head);

      var col = buildDayColumn(day);
      el.dayColumns.appendChild(col);
    });
  }

  // Construit une colonne de jour (créneaux vides + événements).
  function buildDayColumn(day){
    var col = document.createElement("div");
    col.className = "day-col" + (isToday(day)?" is-today":"");
    col.style.height = ((HOUR_END-HOUR_START)*HOUR_PX)+"px";

    for (var h=HOUR_START; h<HOUR_END; h++){
      var s = document.createElement("div");
      s.className = "hour-slot";
      s.style.height = HOUR_PX+"px";
      col.appendChild(s);
    }

    var dayEvents = layoutDay(eventsForDay(day));
    if (dayEvents.length===0){
      var empty = document.createElement("div");
      empty.className = "empty-day";
      empty.textContent = "Rien de prévu ce jour-là.";
      empty.style.position="absolute";empty.style.top="0";empty.style.left="0";empty.style.right="0";empty.style.bottom="0";
      col.appendChild(empty);
    }
    dayEvents.forEach(function(e){
      col.appendChild(buildEventNode(e));
    });
    addNowLine(col, day);
    return col;
  }

  function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function weekDays(anyDayInWeek){
    // Du lundi au samedi seulement : pas de cours le dimanche, inutile de
    // lui réserver une colonne vide.
    var mon = mondayOf(anyDayInWeek);
    var arr = [];
    for (var i=0;i<6;i++) arr.push(addDays(mon,i));
    return arr;
  }

  function renderLegend(){
    var subjects = Object.keys(state.colorMap);
    el.legend.innerHTML = "";
    subjects.forEach(function(s){
      var item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = "<span class='legend-dot' style='background:"+state.colorMap[s]+"'></span>"+escapeHtml(s);
      el.legend.appendChild(item);
    });
  }

  // ---------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------
  function goPrev(){
    state.cursor = addDays(state.cursor, state.mode==="day"?-1:-7);
    if (state.mode==="day" && state.cursor.getDay()===0) state.cursor = addDays(state.cursor, -1);
    render();
  }
  function goNext(){
    state.cursor = addDays(state.cursor, state.mode==="day"?1:7);
    if (state.mode==="day" && state.cursor.getDay()===0) state.cursor = addDays(state.cursor, 1);
    render();
  }
  function goToday(){
    state.cursor = startOfDay(new Date());
    render();
  }
  el.prevBtn.addEventListener("click", goPrev);
  el.nextBtn.addEventListener("click", goNext);
  el.dayModeBtn.addEventListener("click", function(){ setMode("day"); });
  el.weekModeBtn.addEventListener("click", function(){ setMode("week"); });
  function setMode(mode){
    state.mode = mode;
    el.dayModeBtn.classList.toggle("active", mode==="day");
    el.weekModeBtn.classList.toggle("active", mode==="week");
    render();
  }
  setMode(state.mode);
  if (el.refreshBtn) el.refreshBtn.addEventListener("click", function(){ fetchSchedule(true); });

  if (CFG.keyboardNav){
    document.addEventListener("keydown", function(ev){
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag==="TEXTAREA" || tag==="INPUT") return;
      if (ev.key==="ArrowLeft") goPrev();
      else if (ev.key==="ArrowRight") goNext();
      else if (ev.key==="t" || ev.key==="T") goToday();
    });
  }

  // ---------------------------------------------------------------
  // Calendar popover
  // ---------------------------------------------------------------
  el.datePill.addEventListener("click", function(){
    state.calMonth = startOfDay(state.cursor);
    buildCalPop();
    el.calPop.classList.add("open");
  });
  el.calPop.addEventListener("click", function(ev){
    if (ev.target===el.calPop) el.calPop.classList.remove("open");
  });
  el.calPrevMonth.addEventListener("click", function(){
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()-1, 1);
    buildCalPop();
  });
  el.calNextMonth.addEventListener("click", function(){
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()+1, 1);
    buildCalPop();
  });
  el.calTodayBtn.addEventListener("click", function(){
    goToday();
    el.calPop.classList.remove("open");
  });

  function buildCalPop(){
    var m = state.calMonth;
    el.calMonthLabel.textContent = MONTHS[m.getMonth()] + " " + m.getFullYear();
    el.calGrid.innerHTML = "";
    ["L","M","M","J","V","S","D"].forEach(function(d){
      var dow = document.createElement("div");
      dow.className="dow"; dow.textContent=d;
      el.calGrid.appendChild(dow);
    });
    var firstOfMonth = new Date(m.getFullYear(), m.getMonth(), 1);
    var startPad = (firstOfMonth.getDay()+6)%7;
    var gridStart = addDays(firstOfMonth, -startPad);
    for (var i=0;i<42;i++){
      var d = addDays(gridStart, i);
      var btn = document.createElement("button");
      btn.textContent = d.getDate();
      if (d.getMonth()!==m.getMonth()) btn.classList.add("muted");
      if (isToday(d)) btn.classList.add("is-today");
      if (sameDay(d, state.cursor)) btn.classList.add("is-selected");
      if (d.getDay()===0){
        btn.classList.add("muted");
        btn.disabled = true;
        btn.style.opacity = ".35";
        btn.style.cursor = "default";
      } else {
        (function(dd){
          btn.addEventListener("click", function(){
            state.cursor = dd;
            el.calPop.classList.remove("open");
            render();
          });
        })(d);
      }
      el.calGrid.appendChild(btn);
    }
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  fetchSchedule(false);
  setInterval(function(){ fetchSchedule(false); }, REFRESH_MS);
  setInterval(function(){
    if (document.querySelectorAll(".now-line").length){ render(); }
  }, 60*1000);

})();