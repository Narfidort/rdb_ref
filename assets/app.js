/* =========================================================
   リレーショナルデータベースと SQL — スクリプト
   - テーマ切り替え / 目次とスクロール追従
   - コードブロック: ハイライト、プロンプトと出力を除いたコピー
   - 図: ER 図・二部グラフ (SVG) / キーの判定
   - Playground: ブラウザ内 SQLite (sql.js, 補助用)
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  /* ---------------- toast / clipboard ---------------- */
  const toast = (() => {
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    let t;
    return (msg) => { el.textContent = msg; el.classList.add('show'); clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 1600); };
  })();
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }
  function flash(btn, label) {
    const orig = btn.innerHTML;
    btn.classList.add('ok');
    btn.innerHTML = ICON.check + (label ? `<span>${label}</span>` : '');
    setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = orig; }, 1400);
  }

  /* ---------------- theme / nav ---------------- */
  const root = document.documentElement;
  $('#themeBtn')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) root.dataset.theme = e.matches ? 'dark' : 'light';
  });
  $('#menuBtn')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('.sidebar')?.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });

  /* ---------------- syntax highlight ---------------- */
  const KW = 'SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|DROP|ALTER|ADD|COLUMN|RENAME|TO|PRIMARY|KEY|FOREIGN|REFERENCES|CHECK|NULL|DEFAULT|IF|AS|ON|USING|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|NATURAL|UNION|ALL|INTERSECT|EXCEPT|DISTINCT|ORDER|BY|GROUP|HAVING|ASC|DESC|LIMIT|OFFSET|LIKE|ANY|SOME|INT|INTEGER|CHAR|VARCHAR|TEXT|REAL|COUNT|SUM|AVG|MAX|MIN|ROUND|BEGIN|COMMIT|ROLLBACK|TRANSACTION|PRAGMA|TEMP|WITHOUT|ROWID|IS|BETWEEN|CASE|WHEN|THEN|ELSE|END|UNIQUE|STDDEV|VARIANCE|GROUP_CONCAT|JULIANDAY';
  const SQL_RE = new RegExp(`(--.*$)|('(?:[^']|'')*'?|"[^"]*"?)|(\\b\\d+(?:\\.\\d+)?\\b)|\\b(${KW})\\b`, 'gi');
  const hlPlaceholder = (s) => esc(s).replace(/(YYYYMMDD)/g, '<span class="t-ph">$1</span>');
  function hlSQL(s) {
    const dot = s.match(/^(\s*)(\.[a-z]+)(.*)$/i);
    if (dot) return esc(dot[1]) + `<span class="t-dot">${esc(dot[2])}</span>` + hlPlaceholder(dot[3]);
    let out = '', last = 0;
    s.replace(SQL_RE, (m, com, str, num, kw, idx) => {
      out += hlPlaceholder(s.slice(last, idx));
      out += `<span class="${com ? 't-com' : str ? 't-str' : num ? 't-num' : 't-kw'}">${esc(m)}</span>`;
      last = idx + m.length;
      return m;
    });
    return out + hlPlaceholder(s.slice(last));
  }
  function hlShell(s) {
    const c = s.indexOf(' #');
    let body = s, com = '';
    if (s.startsWith('#')) { body = ''; com = s; } else if (c >= 0) { body = s.slice(0, c); com = s.slice(c); }
    const m = body.match(/^(\s*)(\S+)(.*)$/);
    let h = m ? esc(m[1]) + `<span class="t-cmd">${esc(m[2])}</span>` + hlPlaceholder(m[3]) : hlPlaceholder(body);
    if (com) h += `<span class="t-com">${esc(com)}</span>`;
    return h;
  }

  /* ---------------- code blocks ----------------
     <pre class="term">: "% " シェル / "sqlite> " SQLite / "...> " 続き /
                         "#! " 注記 / "!! " エラー / "^^ " 列名 / その他 出力
     コピーされるのはコマンド（プロンプトを除く）だけ。
     <pre class="code" data-lang="sql|sh|text">: 全文をコピー
  ------------------------------------------------ */
  function parseTerm(text) {
    const lines = text.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
    const items = [];
    for (const raw of lines) {
      let m;
      if ((m = raw.match(/^% ?(.*)$/))) items.push({ type: 'cmd', lang: 'sh', prompt: '% ', text: m[1] });
      else if ((m = raw.match(/^sqlite> ?(.*)$/))) items.push({ type: 'cmd', lang: 'sql', prompt: 'sqlite> ', text: m[1] });
      else if ((m = raw.match(/^\s*\.\.\.> ?(.*)$/))) items.push({ type: 'cont', prompt: '   ...> ', text: m[1] });
      else if ((m = raw.match(/^#! ?(.*)$/))) items.push({ type: 'note', text: m[1] });
      else if ((m = raw.match(/^!! ?(.*)$/))) items.push({ type: 'err', text: m[1] });
      else if ((m = raw.match(/^\^\^ ?(.*)$/))) items.push({ type: 'hdr', text: m[1] });
      else items.push({ type: 'out', text: raw });
    }
    const stmts = [];
    let cur = null;
    items.forEach((it, i) => {
      if (it.type === 'cmd') { cur = { lang: it.lang, lines: [it.text], idx: [i] }; stmts.push(cur); it.stmt = cur; }
      else if (it.type === 'cont' && cur) { cur.lines.push(it.text); cur.idx.push(i); it.stmt = cur; it.lang = cur.lang; }
    });
    return { items, stmts };
  }

  function makeBar(label) {
    const bar = document.createElement('div');
    bar.className = 'cb-bar';
    bar.innerHTML = `<span class="label">${esc(label)}</span><span class="spacer"></span>`;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'cb-btn'; copyBtn.type = 'button';
    copyBtn.innerHTML = ICON.copy + '<span>コピー</span>';
    copyBtn.title = 'コマンドのみをコピー（プロンプトと出力は含まない）';
    bar.appendChild(copyBtn);
    return { bar, copyBtn };
  }

  function enhanceTerm(pre) {
    const { items, stmts } = parseTerm(pre.textContent);
    const hasSQL = stmts.some((s) => s.lang === 'sql');
    const hasSh = stmts.some((s) => s.lang === 'sh');
    const label = pre.dataset.label || (hasSQL && hasSh ? 'shell / sqlite3' : hasSQL ? 'sqlite3' : 'shell');
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';
    const { bar, copyBtn } = makeBar(label);
    const body = document.createElement('pre');
    const lineEls = [];
    items.forEach((it) => {
      const ln = document.createElement('div');
      ln.className = 'ln ' + it.type;
      if (it.type === 'cmd' || it.type === 'cont') {
        ln.innerHTML = `<span class="prompt">${esc(it.prompt)}</span>${it.lang === 'sh' ? hlShell(it.text) : hlSQL(it.text)}`;
        if (it.type === 'cmd') {
          const b = document.createElement('button');
          b.className = 'line-copy'; b.type = 'button'; b.title = 'この文をコピー';
          b.innerHTML = ICON.copy;
          b.addEventListener('click', async () => { if (await copyText(it.stmt.lines.join('\n'))) flash(b); });
          ln.appendChild(b);
        }
      } else {
        ln.textContent = it.text || '​';
      }
      lineEls.push(ln);
      body.appendChild(ln);
    });
    stmts.forEach((s) => {
      const els = s.idx.map((i) => lineEls[i]);
      els.forEach((el) => {
        el.addEventListener('mouseenter', () => els.forEach((x) => x.classList.add('hover')));
        el.addEventListener('mouseleave', () => els.forEach((x) => x.classList.remove('hover')));
      });
    });
    const allText = stmts.map((s) => s.lines.join('\n')).join('\n');
    copyBtn.addEventListener('click', async () => {
      if (await copyText(allText)) flash(copyBtn, 'コピーしました');
      else toast('コピーできませんでした');
    });
    wrap.append(bar, body);
    pre.replaceWith(wrap);
  }

  function enhanceCode(pre) {
    const lang = pre.dataset.lang || 'sql';
    const text = pre.textContent.replace(/^\n/, '').replace(/\s+$/, '');
    const wrap = document.createElement('div');
    wrap.className = 'codeblock syntax';
    const { bar, copyBtn } = makeBar(pre.dataset.label || (lang === 'sql' ? 'sql' : lang));
    const body = document.createElement('pre');
    text.split('\n').forEach((line) => {
      const ln = document.createElement('div');
      ln.className = 'ln';
      ln.innerHTML = (lang === 'sql' ? hlSQL(line) : lang === 'sh' ? hlShell(line) : esc(line)) || '​';
      body.appendChild(ln);
    });
    copyBtn.addEventListener('click', async () => { if (await copyText(text)) flash(copyBtn, 'コピーしました'); });
    wrap.append(bar, body);
    pre.replaceWith(wrap);
  }
  $$('pre.term').forEach(enhanceTerm);
  $$('pre.code').forEach(enhanceCode);

  /* ---------------- data tables ---------------- */
  $$('table.data td').forEach((td) => {
    const t = td.textContent.trim();
    if (t === 'NULL' || t === '') { td.classList.add('null'); if (!t) td.textContent = 'NULL'; }
    else if (/^-?\d+(\.\d+)?$/.test(t) && !td.classList.contains('id')) td.classList.add('num');
  });

  /* ---------------- tabs ---------------- */
  $$('.tabs').forEach((tabs) => {
    const btns = $$('.tab-list button', tabs);
    const panels = $$('.tab-panel', tabs);
    const select = (i) => {
      btns.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
      panels.forEach((p, j) => (p.hidden = i !== j));
    };
    btns.forEach((b, i) => b.addEventListener('click', () => select(i)));
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const pref = btns.findIndex((b) => (b.dataset.os === 'mac') === isMac);
    select(pref >= 0 ? pref : 0);
  });

  /* ---------------- TOC + scrollspy ---------------- */
  const toc = $('#toc');
  if (toc) {
    $$('main section.chapter').forEach((sec) => {
      const h2 = $('h2', sec);
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${sec.id}"><span class="ch-num">${esc(sec.dataset.num || '')}</span>${esc(sec.dataset.short || h2.textContent)}</a>`;
      const ul = document.createElement('ul');
      let n = 0;
      $$('h3', sec).forEach((h3) => {
        n++;
        if (!h3.id) h3.id = `${sec.id}-${n}`;
        const a = document.createElement('a');
        a.href = '#' + h3.id;
        a.textContent = h3.dataset.short || h3.textContent.replace(/^[\d.A-Z]+\s*/, '');
        h3.insertAdjacentHTML('beforeend', `<a class="anchor" href="#${h3.id}" aria-label="このセクションへのリンク">#</a>`);
        const l = document.createElement('li'); l.appendChild(a); ul.appendChild(l);
        if (h3.classList.contains('adv')) l.classList.add('adv');
      });
      if (ul.children.length) li.appendChild(ul);
      toc.appendChild(li);
    });
    const links = new Map($$('a', toc).map((a) => [a.getAttribute('href').slice(1), a]));
    const targets = $$('main section.chapter, main h3[id]');
    const update = () => {
      const y = window.scrollY + 120;
      let current = null;
      for (const t of targets) if (t.getBoundingClientRect().top + window.scrollY <= y) current = t;
      $$('a.active', toc).forEach((a) => a.classList.remove('active'));
      if (current) {
        const a = links.get(current.id);
        if (a) { a.classList.add('active'); const r = a.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 20) a.scrollIntoView({ block: 'nearest' }); }
        const ch = current.closest('section.chapter');
        if (ch && ch !== current) links.get(ch.id)?.classList.add('active');
      }
      const h = document.documentElement;
      $('#progress').style.width = (100 * h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) + '%';
    };
    let raf = 0;
    addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  /* ---------------- 畳まれた部分へのリンク: 開いてから移動 ---------------- */
  function openTo(hash) {
    const el = hash && hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!el) return;
    let d = el.closest('details');
    while (d) { d.open = true; d = d.parentElement.closest('details'); }
  }
  addEventListener('hashchange', () => openTo(location.hash));
  openTo(location.hash);

  /* =========================================================
     ER 図
     関係は「1 側の主キー」→「N 側の外部キー」で指定する。
     ========================================================= */
  const ENT = {
    students: { name: 'students', sub: '生徒', w: 210, attrs: [
      { n: 'sid', t: 'TEXT', pk: 1 }, { n: 'name', t: 'TEXT' }, { n: 'class', t: 'TEXT' }, { n: 'number', t: 'INTEGER' } ] },
    loans: { name: 'loans', sub: '貸出', w: 230, attrs: [
      { n: 'lid', t: 'INTEGER', pk: 1 }, { n: 'sid', t: 'TEXT', fk: 1 }, { n: 'bid', t: 'TEXT', fk: 1 }, { n: 'loan_date', t: 'TEXT' }, { n: 'return_date', t: 'TEXT' } ] },
    books: { name: 'books', sub: '本', w: 210, attrs: [
      { n: 'bid', t: 'TEXT', pk: 1 }, { n: 'title', t: 'TEXT' }, { n: 'year', t: 'INTEGER' }, { n: 'pages', t: 'INTEGER' } ] },
    book_authors: { name: 'book_authors', sub: '著者対応', w: 210, attrs: [
      { n: 'bid', t: 'TEXT', pk: 1, fk: 1 }, { n: 'aid', t: 'TEXT', pk: 1, fk: 1 } ] },
    authors: { name: 'authors', sub: '著者', w: 210, attrs: [
      { n: 'aid', t: 'TEXT', pk: 1 }, { n: 'name', t: 'TEXT' } ] },
  };
  const ER = {
    core: {
      at: { students: [0, 0], loans: [330, 0], books: [680, 0] },
      rels: [
        { one: ['students', 0], many: ['loans', 1], label: '借りる' },
        { one: ['books', 0], many: ['loans', 2], label: '貸し出される' },
      ],
    },
    nm: {
      at: { authors: [0, 0], book_authors: [300, 0], books: [600, 0] },
      rels: [
        { one: ['authors', 0], many: ['book_authors', 1] },
        { one: ['books', 0], many: ['book_authors', 0] },
      ],
    },
    library: {
      at: { students: [0, 0], loans: [300, 0], books: [620, 0], book_authors: [620, 200], authors: [300, 200] },
      rels: [
        { one: ['students', 0], many: ['loans', 1] },
        { one: ['books', 0], many: ['loans', 2] },
        { one: ['books', 0], many: ['book_authors', 0] },
        { one: ['authors', 0], many: ['book_authors', 1] },
      ],
    },
  };
  const HEAD = 34, ROW = 26;
  function drawER(fig) {
    const spec = ER[fig.dataset.er];
    if (!spec) return;
    const ents = {};
    for (const [id, [x, y]] of Object.entries(spec.at)) ents[id] = { ...ENT[id], x, y };
    const list = Object.values(ents);
    let maxX = Math.max(...list.map((e) => e.x + e.w));
    const H = Math.max(...list.map((e) => e.y + HEAD + e.attrs.length * ROW));
    let rels = '';
    const rowY = (e, i) => e.y + HEAD + i * ROW + ROW / 2;
    for (const r of spec.rels) {
      const a = ents[r.one[0]], b = ents[r.many[0]];
      const ya = rowY(a, r.one[1]), yb = rowY(b, r.many[1]);
      let pa, pb, da, db, d;
      if (Math.abs(a.x - b.x) < 5) {
        // 同じ列: 右側に回り込む
        pa = a.x + a.w; pb = b.x + b.w; da = 1; db = 1;
        const X = Math.max(pa, pb) + 34; maxX = Math.max(maxX, X + 10);
        d = `M${pa} ${ya} H${X} V${yb} H${pb}`;
        r._lx = X; r._ly = (ya + yb) / 2;
      } else {
        const aLeft = a.x < b.x;
        pa = aLeft ? a.x + a.w : a.x; da = aLeft ? 1 : -1;
        pb = aLeft ? b.x : b.x + b.w; db = -da;
        const mx = (pa + pb) / 2;
        d = `M${pa} ${ya} H${mx} V${yb} H${pb}`;
        r._lx = mx; r._ly = (ya + yb) / 2;
      }
      rels += `<path class="rel" d="${d}"/>`;
      // 1 側: 縦線 2 本
      rels += `<path class="rel" d="M${pa + da * 8} ${ya - 6} v12 M${pa + da * 13} ${ya - 6} v12"/>`;
      // N 側: 鳥の足 + 縦線
      rels += `<path class="rel" d="M${pb + db * 14} ${yb} L${pb} ${yb - 7} M${pb + db * 14} ${yb} L${pb} ${yb} M${pb + db * 14} ${yb} L${pb} ${yb + 7} M${pb + db * 18} ${yb - 6} v12"/>`;
      rels += `<text class="card-label" x="${pa + da * 18}" y="${ya - 9}" text-anchor="${da > 0 ? 'start' : 'end'}">1</text>`;
      rels += `<text class="card-label" x="${pb + db * 22}" y="${yb - 9}" text-anchor="${db > 0 ? 'start' : 'end'}">N</text>`;
      if (r.label) {
        const lw = r.label.length * 12 + 10;
        rels += `<rect class="rel-label-bg" x="${r._lx - lw / 2}" y="${r._ly - 9}" width="${lw}" height="18"/>`;
        rels += `<text class="rel-label" x="${r._lx}" y="${r._ly + 4}" text-anchor="middle">${esc(r.label)}</text>`;
      }
    }
    let boxes = '';
    for (const e of list) {
      const h = HEAD + e.attrs.length * ROW;
      boxes += `<g transform="translate(${e.x},${e.y})">`;
      boxes += `<rect class="ent-box" width="${e.w}" height="${h}" rx="2"/>`;
      boxes += `<rect class="ent-head" width="${e.w}" height="${HEAD}" rx="2"/>`;
      boxes += `<text class="ent-title" x="12" y="22">${esc(e.name)}<tspan class="ent-sub" dx="8">${esc(e.sub || '')}</tspan></text>`;
      e.attrs.forEach((at, i) => {
        const y = HEAD + i * ROW;
        let bx = 10;
        if (at.pk) { boxes += `<rect class="badge-pk" x="${bx}" y="${y + 6}" width="21" height="14" rx="2"/><text class="badge-pk-t" x="${bx + 10.5}" y="${y + 16.5}" text-anchor="middle">PK</text>`; }
        if (at.fk) { const fx = at.pk ? bx + 25 : bx; boxes += `<rect class="badge-fk" x="${fx + .5}" y="${y + 6.5}" width="20" height="13" rx="2"/><text class="badge-fk-t" x="${fx + 10.5}" y="${y + 16.5}" text-anchor="middle">FK</text>`; }
        boxes += `<text class="ent-attr" x="62" y="${y + 17.5}"${at.pk ? ' style="text-decoration:underline"' : ''}>${esc(at.n)}</text>`;
        if (at.t) boxes += `<text class="ent-type" x="${e.w - 10}" y="${y + 17}" text-anchor="end">${esc(at.t)}</text>`;
      });
      boxes += `</g>`;
    }
    const W = maxX + 4;
    fig.insertAdjacentHTML('afterbegin', `<svg class="er" viewBox="-4 -4 ${W + 8} ${H + 8}" width="${W + 8}" role="img" aria-label="ER図">${rels}${boxes}</svg>`);
  }
  $$('figure[data-er]').forEach(drawER);

  /* =========================================================
     二部グラフ: 著者—本 の対応（辺）と book_authors の行の 1 対 1 対応
     ========================================================= */
  function drawBip(fig) {
    const authors = [['A01', '夏目漱石'], ['A02', '宮沢賢治'], ['A03', '芥川龍之介'], ['A04', '山田 太郎'], ['A05', '川口 恵'], ['A06', '森鷗外']];
    const books = [['B01', '坊っちゃん'], ['B02', '吾輩は猫である'], ['B03', 'こころ'], ['B04', '銀河鉄道の夜'], ['B05', '羅生門'], ['B06', 'データベースの基礎']];
    const pairs = [['B01', 'A01'], ['B02', 'A01'], ['B03', 'A01'], ['B04', 'A02'], ['B05', 'A03'], ['B06', 'A04'], ['B06', 'A05']];
    const top = 30, gap = 38, nodeW = 150, nodeH = 26;
    const xA = 0, xB = 330, xT = 560;
    const yOf = (i) => top + i * gap;
    let s = '';
    s += `<text class="col-t" x="${xA}" y="14">authors</text><text class="col-t" x="${xB}" y="14">books</text><text class="col-t" x="${xT}" y="14">book_authors の行</text>`;
    pairs.forEach(([b, a], k) => {
      const ia = authors.findIndex((x) => x[0] === a), ib = books.findIndex((x) => x[0] === b);
      const x1 = xA + nodeW, y1 = yOf(ia) + nodeH / 2, x2 = xB, y2 = yOf(ib) + nodeH / 2;
      s += `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      const t = 0.5, cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
      s += `<circle class="edge-n" cx="${cx}" cy="${cy}" r="9"/><text class="edge-nt" x="${cx}" y="${cy + 3.8}" text-anchor="middle">${k + 1}</text>`;
    });
    authors.forEach(([id, n], i) => {
      s += `<rect class="node" x="${xA}" y="${yOf(i)}" width="${nodeW}" height="${nodeH}" rx="2"/>`;
      s += `<text class="node-id" x="${xA + 8}" y="${yOf(i) + 17.5}">${id}</text><text class="node-t" x="${xA + 44}" y="${yOf(i) + 17.5}">${esc(n)}</text>`;
    });
    books.forEach(([id, n], i) => {
      s += `<rect class="node" x="${xB}" y="${yOf(i)}" width="${nodeW + 30}" height="${nodeH}" rx="2"/>`;
      s += `<text class="node-id" x="${xB + 8}" y="${yOf(i) + 17.5}">${id}</text><text class="node-t" x="${xB + 44}" y="${yOf(i) + 17.5}">${esc(n)}</text>`;
    });
    const tw = 150, rh = 24, ty = top;
    s += `<rect class="tbl-h" x="${xT}" y="${ty}" width="${tw}" height="${rh}"/>`;
    s += `<text class="row-t" x="${xT + 34}" y="${ty + 16}" style="font-weight:700">bid</text><text class="row-t" x="${xT + 94}" y="${ty + 16}" style="font-weight:700">aid</text>`;
    pairs.forEach(([b, a], k) => {
      const y = ty + rh * (k + 1);
      s += `<rect class="tbl" x="${xT}" y="${y}" width="${tw}" height="${rh}"/>`;
      s += `<text class="row-n" x="${xT + 10}" y="${y + 16}">${k + 1}</text><text class="row-t" x="${xT + 34}" y="${y + 16}">${b}</text><text class="row-t" x="${xT + 94}" y="${y + 16}">${a}</text>`;
    });
    const H = Math.max(yOf(5) + nodeH, ty + rh * (pairs.length + 1)) + 6;
    fig.insertAdjacentHTML('afterbegin', `<svg class="bip" viewBox="-2 0 ${xT + tw + 6} ${H}" width="${xT + tw + 6}" role="img" aria-label="著者と本の対応">${s}</svg>`);
  }
  $$('figure[data-bip]').forEach(drawBip);

  /* =========================================================
     キーの判定
     ========================================================= */
  const keylab = $('#keylab');
  if (keylab) {
    const cols = ['学籍番号', '氏名', 'クラス', '出席番号', 'メール'];
    const rows = [
      ['S01', '佐藤 花子', '1-A', '12', 'hanako.s@example.jp'],
      ['S02', '鈴木 一郎', '1-A', '15', 'ichiro@example.jp'],
      ['S03', '佐藤 花子', '1-B', '12', 'sato.h@example.jp'],
      ['S04', '高橋 健', '1-B', '20', 'ken.t@example.jp'],
      ['S05', '田中 美咲', '2-A', '15', 'misaki@example.jp'],
      ['S06', '伊藤 翔', '2-A', '3', 'sho.ito@example.jp'],
    ];
    // 規則から定まる候補キー
    const CANDIDATES = [[0], [2, 3], [4]];
    const PK = [0];
    const sel = new Set();
    const chipsEl = $('.chips', keylab);
    const tbody = $('tbody', keylab);
    const thead = $('thead tr', keylab);
    thead.innerHTML = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    tbody.innerHTML = rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    cols.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = c; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { sel.has(i) ? sel.delete(i) : sel.add(i); render(); });
      chipsEl.appendChild(b);
    });
    $$('.presets button', keylab).forEach((b) => b.addEventListener('click', () => {
      sel.clear(); b.dataset.set.split(',').filter(Boolean).forEach((i) => sel.add(+i)); render();
    }));
    const contains = (set, cand) => cand.every((c) => set.has(c));
    const equals = (set, cand) => set.size === cand.length && contains(set, cand);
    const fmt = (idx) => '{' + idx.map((i) => cols[i]).join(', ') + '}';
    function render() {
      $$('.chip', chipsEl).forEach((b, i) => b.setAttribute('aria-pressed', String(sel.has(i))));
      const idx = [...sel].sort();
      const seen = new Map(), dup = new Set();
      rows.forEach((r, ri) => {
        const k = idx.map((i) => r[i]).join('\u0000');
        if (seen.has(k)) { dup.add(ri); dup.add(seen.get(k)); } else seen.set(k, ri);
      });
      $$('tr', tbody).forEach((tr, ri) => $$('td', tr).forEach((td, ci) => {
        td.classList.toggle('hl', sel.has(ci) && !dup.has(ri));
        td.classList.toggle('bad', sel.has(ci) && dup.has(ri));
      }));
      $$('th', thead).forEach((th, ci) => th.classList.toggle('hl', sel.has(ci)));
      const sk = idx.length > 0 && CANDIDATES.some((c) => contains(sel, c));
      const ck = CANDIDATES.some((c) => equals(sel, c));
      const pk = equals(sel, PK);
      const set = (id, ok) => { const el = $(id, keylab); el.classList.toggle('yes', ok); $('.v', el).textContent = ok ? 'YES' : 'NO'; };
      set('#v-sk', sk); set('#v-ck', ck); set('#v-pk', pk);
      const K = fmt(idx);
      let msg;
      if (!idx.length) msg = '列を選ぶと、その組み合わせがスーパーキー・候補キー・主キーかを判定する。';
      else if (dup.size && !sk) msg = `${K} は、赤い行どうしで値が同じになっている。これでは行が1つに決まらないので、スーパーキーではない。`;
      else if (!sk) msg = `${K} は、今の6行ではたまたま重複していない。しかし同じクラスに同姓同名の生徒が来ることは規則上ありうるので、スーパーキーではない（キーはデータではなく規則で決まる）。`;
      else if (pk) msg = `${K} は候補キーであり、この表の主キーとして選ばれている。`;
      else if (ck) msg = `${K} はスーパーキーで、どの列を1つ外しても行が決まらなくなる。ムダがないので候補キーである。ただし主キーには {学籍番号} が選ばれている（出席番号はクラス替えで、メールアドレスは変更で値が変わりうるため）。`;
      else {
        const inner = CANDIDATES.filter((c) => contains(sel, c)).map(fmt).join('、');
        msg = `${K} はスーパーキーだが、一部の ${inner} だけでも行が決まるので、ムダな列を含んでいる。よって候補キーではない。`;
      }
      $('.explain', keylab).textContent = msg;
    }
    render();
  }

  /* =========================================================
     Playground (sql.js) — 補助用
     ========================================================= */
  const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/';
  const SEEDS = { library: $('#seed-library')?.textContent || '', empty: '' };
  (() => {
    const panel = $('#pg');
    if (!panel) return;
    const ta = $('textarea', panel), out = $('.pg-out', panel), dbSel = $('#pgDb', panel), pipe = $('#pgPipe', panel);
    let SQL = null, loading = null;
    const dbs = {};
    const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed')); document.head.appendChild(s); });
    function ensure() {
      if (SQL) return Promise.resolve(SQL);
      if (!loading) {
        loading = (async () => {
          out.innerHTML = '<div class="msg">sql.js を読み込み中…</div>';
          await loadScript(SQLJS + 'sql-wasm.js');
          SQL = await window.initSqlJs({ locateFile: (f) => SQLJS + f });
          out.innerHTML = '';
          return SQL;
        })().catch((e) => { loading = null; throw e; });
      }
      return loading;
    }
    function db(name) {
      if (!dbs[name]) { dbs[name] = new SQL.Database(); if (SEEDS[name]) dbs[name].exec(SEEDS[name]); }
      return dbs[name];
    }
    const fail = (e) => { out.innerHTML = `<div class="msg err">sql.js を読み込めない（ネットワーク未接続など）。ターミナルの sqlite3 を使うこと。<br>${esc(e.message || e)}</div>`; };
    const open = () => { panel.classList.add('open'); ensure().catch(fail); };
    const close = () => panel.classList.remove('open');
    $('#pgOpen')?.addEventListener('click', () => (panel.classList.contains('open') ? close() : (open(), ta.focus())));
    $('#pgClose', panel).addEventListener('click', close);
    $('#pgRun', panel).addEventListener('click', run);
    $('#pgReset', panel).addEventListener('click', async () => {
      await ensure(); dbs[dbSel.value]?.close(); delete dbs[dbSel.value];
      out.innerHTML = `<div class="msg">${esc(dbSel.selectedOptions[0].textContent)} を初期状態に戻した。</div>`;
    });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      if (e.key === 'Escape') close();
    });
    function renderResult(columns, values) {
      if (pipe.checked) {
        const lines = [columns.join('|'), ...values.map((r) => r.map((v) => (v === null ? 'NULL' : String(v))).join('|'))];
        return `<pre class="pipe">${esc(lines.join('\n'))}</pre>`;
      }
      if (!values.length) return '<div class="msg">（0 行）</div>';
      return `<div class="table-wrap" style="margin:4px 0 0"><table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
        values.map((r) => `<tr>${r.map((v) => (v === null ? '<td class="null">NULL</td>' : `<td>${esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    function dotCommand(d, line) {
      const [cmd, arg] = line.trim().split(/\s+/);
      if (cmd === '.tables') {
        const r = d.exec("SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
        return `<pre class="pipe">${esc(r[0] ? r[0].values.map((v) => v[0]).join('   ') : '（なし）')}</pre>`;
      }
      if (cmd === '.schema') {
        const r = arg ? d.exec('SELECT sql FROM sqlite_schema WHERE name = ? AND sql IS NOT NULL', [arg])
          : d.exec("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'");
        return `<pre class="pipe">${esc(r[0] ? r[0].values.map((v) => v[0] + ';').join('\n') : '（なし）')}</pre>`;
      }
      return `<div class="msg">${esc(cmd)} は Playground では使えない（.tables と .schema のみ対応）。</div>`;
    }
    async function run() {
      try { await ensure(); } catch (e) { fail(e); return; }
      const d = db(dbSel.value);
      d.run('PRAGMA foreign_keys = ON');
      const chunks = []; let buf = [];
      for (const line of ta.value.split('\n')) {
        if (/^\s*\./.test(line)) { if (buf.join('').trim()) chunks.push({ sql: buf.join('\n') }); buf = []; chunks.push({ dot: line }); }
        else buf.push(line);
      }
      if (buf.join('').trim()) chunks.push({ sql: buf.join('\n') });
      let h = '';
      outer: for (const c of chunks) {
        if (c.dot) { h += `<div class="stmt">sqlite&gt; ${esc(c.dot.trim())}</div>` + dotCommand(d, c.dot); continue; }
        try {
          for (const stmt of d.iterateStatements(c.sql)) {
            h += `<div class="stmt">sqlite&gt; ${esc(stmt.getSQL().trim())}</div>`;
            const columns = stmt.getColumnNames(); const values = [];
            while (stmt.step()) values.push(stmt.get());
            stmt.free();
            h += columns.length ? renderResult(columns, values) : `<div class="msg">OK${d.getRowsModified() ? `（${d.getRowsModified()} 行に影響）` : ''}</div>`;
          }
        } catch (e) { h += `<div class="msg err">Error: ${esc(e.message || e)}</div>`; break outer; }
      }
      out.innerHTML = h || '<div class="msg">実行する文がない。</div>';
    }
  })();
})();
