(function () {
  "use strict";

  var SHEETS = ["Impostazioni", "Pranzo", "Pizze", "Bevande", "Dolci", "Allergeni"];
  var CACHE_KEY = "pf-menu-v1";
  var app = document.getElementById("app");
  var LOGO = document.getElementById("logo-src").innerHTML;
  var data = null;

  /* ---------------- dati ---------------- */

  function sheetId() {
    var v = ((window.MENU_CONFIG || {}).googleSheet || "").trim();
    if (!v) return "";
    var m = v.match(/\/d\/([a-zA-Z0-9-_]{20,})/);
    return m ? m[1] : v;
  }

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  }

  // Rende le righe indipendenti da maiuscole/accenti nelle intestazioni
  function prepare(raw) {
    var out = {};
    SHEETS.forEach(function (name) {
      out[name] = (raw[name] || []).map(function (row) {
        var r = {};
        Object.keys(row).forEach(function (k) { r[norm(k)] = String(row[k] == null ? "" : row[k]).trim(); });
        return r;
      });
    });
    var s = {};
    out.Impostazioni.forEach(function (r) { if (r.chiave) s[r.chiave.trim()] = r.valore || ""; });
    out.settings = s;
    var alg = {};
    out.Allergeni.forEach(function (r) { if (r.numero) alg[String(parseInt(r.numero, 10))] = r.allergene; });
    out.algMap = alg;
    return out;
  }

  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c !== "\r") f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    var head = rows.shift() || [];
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); })
      .map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] || ""; }); return o; });
  }

  function fetchSheet(id, name) {
    var url = "https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:csv&headers=1&sheet=" +
      encodeURIComponent(name) + "&t=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(parseCSV);
  }

  function loadRemote() {
    var id = sheetId();
    if (!id) return;
    Promise.all(SHEETS.map(function (n) { return fetchSheet(id, n); })).then(function (lists) {
      var raw = {};
      SHEETS.forEach(function (n, i) { raw[n] = lists[i]; });
      if (!raw.Impostazioni.length && !raw.Pizze.length) return; // foglio vuoto o non condiviso: resta il menù attuale
      var json = JSON.stringify(raw);
      try { localStorage.setItem(CACHE_KEY, json); } catch (e) {}
      if (json !== JSON.stringify(data.__raw)) { data = prepare(raw); data.__raw = raw; render(false); }
    }).catch(function () { /* offline o foglio non condiviso: si usa l'ultima versione */ });
  }

  function initData() {
    var raw = null;
    if (sheetId()) { try { raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {} }
    raw = raw || window.MENU_DEFAULT;
    data = prepare(raw); data.__raw = raw;
  }

  /* ---------------- utilità ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function visible(r) { var v = norm(r.visibile); return v !== "no" && v !== "n" && v !== "0" && v !== "false"; }
  function set(k, d) { var v = data.settings[k]; return v == null || v === "" ? (d || "") : v; }

  function price(p) {
    p = String(p || "").replace(/€|eur/gi, "").trim();
    if (!p) return "";
    var n = parseFloat(p.replace(/\./g, "").replace(",", "."));
    if (isNaN(n)) return esc(p);
    var s = n % 1 === 0 ? String(n) : n.toFixed(2).replace(".", ",");
    return "€\u00a0" + s;
  }

  // Accetta percorsi locali, indirizzi web e link di condivisione Google Drive
  function img(u, fallback) {
    u = String(u || "").trim();
    if (!u) return fallback || "";
    var m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([a-zA-Z0-9_-]{10,})/);
    if (m) return "https://lh3.googleusercontent.com/d/" + m[1] + "=w1400";
    return u;
  }

  function allergens(list) {
    var nums = String(list || "").split(/[^0-9]+/).filter(Boolean);
    if (!nums.length) return "";
    var names = nums.map(function (n) { return data.algMap[String(parseInt(n, 10))]; }).filter(Boolean);
    if (!names.length) return "";
    return '<p class="alg" aria-label="Allergeni: ' + esc(names.join(", ")) + '">' +
      names.map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("") + "</p>";
  }

  var ICON = {
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>'
  };

  /* ---------------- blocchi ---------------- */

  function tile(href, title, sub, photo) {
    return '<a class="tile" href="' + href + '">' +
      '<img src="' + esc(photo) + '" alt="" loading="eager" decoding="async">' +
      '<span class="label"><span class="t">' + esc(title) + (sub ? '<span class="s">' + esc(sub) + "</span>" : "") +
      '</span><span class="go">' + ICON.chev + "</span></span></a>";
  }

  function topbar(backHref) {
    return '<div class="topbar"><div class="in"><a class="back" href="' + backHref + '">' + ICON.back + 'Indietro</a>' +
      '<a class="mini" href="#/" aria-label="Pagina iniziale">' + LOGO + "</a><span></span></div></div>";
  }

  function hero(title, sub, photo) {
    return '<div class="hero"><img src="' + esc(photo) + '" alt=""><div class="cap"><h1>' + esc(title) + "</h1>" +
      (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div></div>";
  }

  function footer() {
    var h = '<footer class="foot">';
    if (set("nota_allergeni")) h += "<p>" + esc(set("nota_allergeni")) + ' <a href="#/allergeni">Elenco allergeni</a></p>';
    if (set("indirizzo")) h += '<p class="addr">' + esc(set("nome_locale", "Pizza & Fichi")) + " · " + esc(set("indirizzo")) + "</p>";
    var l = [];
    if (set("telefono")) l.push('<a href="tel:' + esc(set("telefono").replace(/\s+/g, "")) + '">' + esc(set("telefono")) + "</a>");
    if (set("link_instagram")) l.push('<a href="' + esc(set("link_instagram")) + '" target="_blank" rel="noopener">Instagram</a>');
    if (set("link_recensioni")) l.push('<a href="' + esc(set("link_recensioni")) + '" target="_blank" rel="noopener">Lascia una recensione</a>');
    if (l.length) h += "<p>" + l.join(" &nbsp;·&nbsp; ") + "</p>";
    return h + "</footer>";
  }

  function itemHTML(r, nameKey, descKey, opts) {
    opts = opts || {};
    var p = opts.noPrice ? "" : price(r.prezzo);
    var photo = r.foto ? img(r.foto) : "";
    if (opts.compact) {
      return '<li class="item compact"><div class="body"><div class="row"><span class="name">' + esc(r[nameKey]) +
        (r[descKey] ? ' <small>' + esc(r[descKey]) + "</small>" : "") + "</span>" +
        (p ? '<span class="dots"></span><span class="price">' + p + "</span>" : "") + "</div>" + allergens(r.allergeni) + "</div></li>";
    }
    return '<li class="item">' + (photo ? '<img class="thumb" src="' + esc(photo) + '" alt="" loading="lazy">' : "") +
      '<div class="body"><div class="row"><span class="name">' + esc(r[nameKey]) + "</span>" +
      (p ? '<span class="dots"></span><span class="price">' + p + "</span>" : "") + "</div>" +
      (r[descKey] ? '<p class="desc">' + esc(r[descKey]) + "</p>" : "") + allergens(r.allergeni) + "</div></li>";
  }

  // Raggruppa per colonna (Categoria) mantenendo l'ordine del foglio
  function grouped(rows, groupKey, nameKey, descKey, opts) {
    var order = [], g = {};
    rows.filter(visible).filter(function (r) { return r[nameKey]; }).forEach(function (r) {
      var k = r[groupKey] || "";
      if (!g[k]) { g[k] = []; order.push(k); }
      g[k].push(r);
    });
    if (!order.length) return '<p class="empty">Nessun piatto disponibile in questo momento.</p>';
    return order.map(function (k) {
      return (k && order.length > 1 ? '<h3 class="grp">' + esc(k) + "</h3>" : "") +
        '<ul class="items">' + g[k].map(function (r) { return itemHTML(r, nameKey, descKey, opts); }).join("") + "</ul>";
    }).join("");
  }

  function section(id, title, sub, inner) {
    return '<section class="sec" id="' + id + '"><div class="sec-h"><h2>' + esc(title) + "</h2></div>" +
      (sub ? '<p class="sec-sub">' + sub + "</p>" : "") + inner + "</section>";
  }

  function pizzeSection() { return section("pizze", "Pizze", "", grouped(data.Pizze, "categoria", "pizza", "ingredienti")); }
  function bevandeSection() { return section("bevande", "Bevande", "", grouped(data.Bevande, "categoria", "bevanda", "formato", { compact: true })); }

  function tabs(list) {
    return '<nav class="tabs" aria-label="Sezioni del menù"><div class="in">' +
      list.map(function (t, i) { return '<a href="#' + t[0] + '" data-sec="' + t[0] + '"' + (i === 0 ? ' class="on"' : "") + ">" + esc(t[1]) + "</a>"; }).join("") +
      "</div></nav>";
  }

  /* ---------------- pagine ---------------- */

  var pages = {
    home: function () {
      return '<div class="home"><header class="brand">' + LOGO + '<p class="slogan">' + esc(set("slogan")) + "</p></header>" +
        '<div class="wrap"><div class="choices">' +
        tile("#/ristorante", "Menù Ristorante", "Pranzo e cena", img(set("foto_home_ristorante"), "img/ristorante.jpg")) +
        tile("#/dolci", "Menù Dolci", "Per chiudere in dolcezza", img(set("foto_home_dolci"), "img/dolci.jpg")) +
        '</div><div class="links">' +
        (set("link_recensioni") ? '<a class="pill solid" href="' + esc(set("link_recensioni")) + '" target="_blank" rel="noopener">' + ICON.star + "Lascia una recensione</a>" : "") +
        '<a class="pill" href="#/allergeni">' + ICON.info + "Allergeni</a></div></div>" + footer() + "</div>";
    },

    ristorante: function () {
      return topbar("#/") + '<div class="wrap"><div class="choices two">' +
        tile("#/pranzo", "Menù Pranzo", set("pranzo_periodo"), img(set("foto_pranzo"), "img/pranzo.jpg")) +
        tile("#/cena", "Menù Cena", set("cena_sottotitolo", "Pizze e bevande"), img(set("foto_cena"), "img/cena.jpg")) +
        "</div></div>" + footer();
    },

    pranzo: function () {
      var secs = [["primi", "Primi", "prezzo_primi"], ["secondi", "Secondi", "prezzo_secondi"], ["contorni", "Contorni", "prezzo_contorni"]];
      var rows = data.Pranzo.filter(visible).filter(function (r) { return r.piatto; });
      var body = secs.map(function (s) {
        var list = rows.filter(function (r) { return norm(r.sezione) === s[0]; });
        if (!list.length) return "";
        var sp = price(set(s[2]));
        return section(s[0], s[1], sp ? "<b>" + sp + "</b> a piatto" : "",
          '<ul class="items">' + list.map(function (r) { return itemHTML(r, "piatto", "descrizione", { noPrice: !r.prezzo }); }).join("") + "</ul>");
      }).join("");
      var offer = set("speciale_prezzo") || set("speciale_contenuto") ?
        '<div class="offer" id="speciale"><h3>' + esc(set("speciale_titolo", "Speciale pranzo")) + "</h3>" +
        (set("speciale_contenuto") ? '<p class="inc">' + esc(set("speciale_contenuto")) + "</p>" : "") +
        (set("speciale_prezzo") ? '<p class="big">' + price(set("speciale_prezzo")) + "</p>" : "") +
        (set("speciale_note") ? '<p class="note">' + esc(set("speciale_note")) + "</p>" : "") + "</div>" : "";
      var t = secs.filter(function (s) { return rows.some(function (r) { return norm(r.sezione) === s[0]; }); }).map(function (s) { return [s[0], s[1]]; });
      t.push(["bevande", "Bevande"], ["pizze", "Pizze"]);
      return topbar("#/ristorante") + hero("Menù pranzo", set("pranzo_periodo"), img(set("foto_pranzo"), "img/pranzo.jpg")) +
        tabs(t) + '<div class="wrap menu">' + body + offer + bevandeSection() + pizzeSection() + "</div>" + footer();
    },

    cena: function () {
      return topbar("#/ristorante") + hero("Menù cena", set("cena_sottotitolo", "Pizze e bevande"), img(set("foto_cena"), "img/cena.jpg")) +
        tabs([["pizze", "Pizze"], ["bevande", "Bevande"]]) + '<div class="wrap menu">' + pizzeSection() + bevandeSection() + "</div>" + footer();
    },

    dolci: function () {
      var rows = data.Dolci.filter(visible).filter(function (r) { return r.dolce; });
      return topbar("#/") + hero("Menù dolci", "Fatti in casa", img(set("foto_home_dolci"), "img/dolci.jpg")) +
        '<div class="wrap menu">' + (rows.length ?
          '<section class="sec"><ul class="items">' + rows.map(function (r) { return itemHTML(r, "dolce", "descrizione"); }).join("") + "</ul></section>" :
          '<p class="empty">Nessun dolce disponibile in questo momento.</p>') + "</div>" + footer();
    },

    allergeni: function () {
      return topbar("#/") + '<div class="wrap"><header class="brand" style="padding-top:18px"><h1 style="margin:0;font-family:var(--display);font-size:46px;line-height:1">Allergeni</h1></header>' +
        '<p class="intro">Sotto ogni piatto trovi gli allergeni che contiene. Per dubbi o intolleranze chiedi al personale prima di ordinare.</p>' +
        '<ul class="algtable">' + data.Allergeni.filter(function (r) { return r.numero; }).map(function (r) {
          return '<li><span class="n">' + esc(r.numero) + "</span><div><b>" + esc(r.allergene) + "</b><span>" + esc(r.descrizione) + "</span></div></li>";
        }).join("") + "</ul></div>" + footer();
    }
  };

  /* ---------------- navigazione ---------------- */

  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    return pages[h] ? h : (h === "" ? "home" : null);
  }

  var current = null;
  function render(scrollTop) {
    var r = route();
    if (!r) return; // ancora interna (es. #pizze): non cambia pagina
    var y = window.scrollY;
    app.innerHTML = pages[r]();
    document.title = (r === "home" ? "" : app.querySelector("h1") ? app.querySelector("h1").textContent + " · " : "") + "Pizza & Fichi";
    if (scrollTop !== false && r !== current) window.scrollTo(0, 0); else window.scrollTo(0, y);
    current = r;
    wireTabs();
  }

  function wireTabs() {
    var links = [].slice.call(app.querySelectorAll(".tabs a"));
    if (!links.length) return;
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var t = document.getElementById(a.getAttribute("data-sec"));
        if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 118, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    });
  }

  function onScroll() {
    var bar = app.querySelector(".topbar");
    if (bar) bar.classList.toggle("scrolled", window.scrollY > 4);
    var links = [].slice.call(app.querySelectorAll(".tabs a"));
    if (!links.length) return;
    var on = links[0];
    links.forEach(function (a) {
      var s = document.getElementById(a.getAttribute("data-sec"));
      if (s && s.getBoundingClientRect().top < 140) on = a;
    });
    links.forEach(function (a) { a.classList.toggle("on", a === on); });
    if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth) {
      var p = on.parentNode, l = on.offsetLeft - 18;
      if (l < p.scrollLeft || on.offsetLeft + on.offsetWidth > p.scrollLeft + p.clientWidth) p.scrollLeft = l;
    }
  }

  window.addEventListener("hashchange", function () { render(true); });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loadRemote(); });

  initData();
  render(true);
  loadRemote();
})();
