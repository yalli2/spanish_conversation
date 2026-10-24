/* Conversación I — interactive engine (vanilla JS, no deps) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const nl = s => esc(s).replace(/\n/g, '<br>');

  /* ---------- storage (safe) ---------- */
  const mem = {};
  const S = {
    get(k) { try { const v = localStorage.getItem('esp1:' + k); return v ? JSON.parse(v) : (mem[k] || null); } catch (e) { return mem[k] || null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('esp1:' + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { delete mem[k]; try { localStorage.removeItem('esp1:' + k); } catch (e) { } }
  };

  /* ---------- text matching ---------- */
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clean = s => s.toLowerCase().replace(/[¿?¡!.,;:"“”'’]/g, '').replace(/\s+/g, ' ').trim();
  function judge(user, answers) {
    const u = clean(user);
    if (!u) return { ok: false, acc: false };
    if (answers.some(a => clean(a) === u)) return { ok: true, acc: false };
    if (answers.some(a => strip(clean(a)) === strip(u))) return { ok: true, acc: true };
    return { ok: false, acc: false };
  }

  /* ---------- TTS ---------- */
  const TTS = {
    ok: 'speechSynthesis' in window, voice: null, token: 0, timer: null, audio: null,
    pick() {
      if (!this.ok) return;
      const v = speechSynthesis.getVoices();
      this.voice = v.find(x => /^es[-_]ES/i.test(x.lang)) || v.find(x => /^es/i.test(x.lang)) || null;
    },
    stop() {
      this.token++;
      clearTimeout(this.timer);
      if (this.ok) speechSynthesis.cancel();
      if (this.audio) { this.audio.pause(); this.audio = null; }
      $$('.playing').forEach(n => n.classList.remove('playing'));
    },
    say(list, opt = {}) {
      this.stop();
      const MAP = window.TTS_MAP || {};
      if (!this.ok && !Object.keys(MAP).length) { warn(); return; }
      const my = this.token;
      const base = document.body.dataset.lesson ? '../' : '';
      const arr = Array.isArray(list) ? list : [list];
      let i = 0;
      const next = () => {
        if (my !== this.token) return;
        if (i >= arr.length) { opt.done && opt.done(); return; }
        const idx = i++;
        const f = MAP[String(arr[idx]).trim()];
        if (f) {
          const a = new Audio(base + f); this.audio = a;
          a.onplay = () => opt.each && opt.each(idx);
          a.onended = () => { this.timer = setTimeout(next, opt.gap == null ? 450 : opt.gap); };
          a.onerror = () => { this.timer = setTimeout(next, 100); };
          a.play().catch(() => { this.timer = setTimeout(next, 100); });
          return;
        }
        if (!this.ok) { next(); return; }
        const u = new SpeechSynthesisUtterance(arr[idx]);
        u.lang = 'es-ES'; if (this.voice) u.voice = this.voice;
        u.rate = opt.rate || 0.88; u.pitch = opt.pitchOf ? opt.pitchOf(idx) : 1;
        u.onstart = () => opt.each && opt.each(idx);
        u.onend = () => { this.timer = setTimeout(next, opt.gap == null ? 650 : opt.gap); };
        u.onerror = () => { this.timer = setTimeout(next, 100); };
        speechSynthesis.speak(u);
      };
      next();
    },
    file(url, done) {
      this.stop();
      const a = new Audio(url); this.audio = a;
      a.onended = () => done && done();
      a.play().catch(() => { });
    }
  };
  if (TTS.ok) { TTS.pick(); speechSynthesis.onvoiceschanged = () => TTS.pick(); }
  function warn() {
    let w = $('#warnbar');
    if (!w) { w = el('<div class="warnbar" id="warnbar" role="alert"></div>'); const m = $('main') || document.body; m.prepend(w); }
    w.style.display = 'block';
    w.textContent = '이 브라우저는 음성 읽기를 지원하지 않습니다. 최신 Chrome · Edge · Safari로 열어 주세요.';
  }
  const AUDIO_MAP = window.AUDIO_MAP || {};

  /* ---------- helpers: totals ---------- */
  const countBlanks = t => (t.match(/\{\{[^}]*\}\}/g) || []).length;
  function partTotal(p) {
    switch (p.type) {
      case 'fill': return countBlanks(p.text);
      case 'choice': case 'tf': return p.items.length;
      case 'match': return p.ans.length;
      case 'seq': return p.ans.length;
      case 'mark': return p.ans.length;
      case 'ws': return p.words.length;
      default: return 0;
    }
  }
  function blockParts(b) { return b.parts || (b.type ? [b] : []); }
  function blockTotal(b) { return blockParts(b).reduce((n, p) => n + partTotal(p), 0); }
  window.CX = { S, blockTotal, blockParts };

  /* ---------- part renderers ---------- */
  function makeFill(p, uid) {
    let n = 0;
    const re = /\{\{([^}]*)\}\}|\[\[([^\]]*)\]\]/g;
    let out = '', last = 0, m;
    const t = p.text;
    while ((m = re.exec(t))) {
      out += nl(t.slice(last, m.index));
      if (m[1] !== undefined) {
        const ans = m[1]; const len = Math.max(...ans.split('|').map(x => x.length));
        out += `<input class="f" data-a="${esc(ans)}" style="width:${Math.max(4, len + 2)}ch" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="빈칸 ${++n}"><span class="ans"></span>`;
      } else {
        const [e, c] = m[2].split('*'); out += `<span aria-hidden="true">${esc(e.repeat(+c || 1))}</span>`;
      }
      last = m.index + m[0].length;
    }
    out += nl(t.slice(last));
    const root = el(`<div class="fill" style="line-height:2.2">${p.bank ? `<div class="bank" aria-label="보기">${p.bank.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}${out}</div>`);
    return {
      root,
      check() {
        let s = 0, t2 = 0;
        $$('input.f', root).forEach(i => {
          t2++;
          const ans = i.dataset.a.split('|');
          const r = judge(i.value, ans);
          i.classList.remove('ok', 'bad', 'acc');
          const a = i.nextElementSibling; a.textContent = ''; a.className = 'ans';
          if (r.ok) { s++; i.classList.add(r.acc ? 'acc' : 'ok'); if (r.acc) { a.className = 'accnote'; a.textContent = '악센트·철자 부호 확인: ' + ans[0]; } }
          else { i.classList.add('bad'); a.textContent = '→ ' + ans[0]; }
        });
        return { s, t: t2 };
      },
      reset() { $$('input.f', root).forEach(i => { i.value = ''; i.classList.remove('ok', 'bad', 'acc'); i.nextElementSibling.textContent = ''; }); }
    };
  }

  function makeChoice(p, uid, tf) {
    const items = tf ? p.items.map(it => ({ q: it.q, o: ['Verdadero (V)', 'Falso (F)'], a: it.a ? 0 : 1 })) : p.items;
    const root = el(`<div>${items.map((it, i) => `
      <div class="item"><div class="q"><span class="lab">${i + 1})</span>${nl(it.q || '')}</div>
      <div class="opts" role="radiogroup" aria-label="문항 ${i + 1}">${it.o.map((o, j) => `
        <label class="opt"><input type="radio" name="${uid}-${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}</div></div>`).join('')}</div>`);
    return {
      root,
      check() {
        let s = 0;
        items.forEach((it, i) => {
          const labs = $$(`input[name="${uid}-${i}"]`, root);
          labs.forEach(l => l.parentElement.classList.remove('ok', 'bad'));
          const sel = labs.find(l => l.checked);
          if (sel && +sel.value === it.a) { s++; sel.parentElement.classList.add('ok'); }
          else { if (sel) sel.parentElement.classList.add('bad'); labs[it.a].parentElement.classList.add('ok'); }
        });
        return { s, t: items.length };
      },
      reset() { $$('input', root).forEach(i => i.checked = false); $$('.opt', root).forEach(o => o.classList.remove('ok', 'bad')); }
    };
  }

  function makeMatch(p, uid) {
    const L = 'abcdefghijklmnopqrstuvwxyz';
    const root = el(`<div class="two"><div>${p.left.map((x, i) => `
      <div class="item"><span class="lab">${i + 1})</span>${esc(x)} → <select class="f" data-i="${i}" aria-label="${esc(x)}"><option value="">?</option>${p.right.map((r, j) => `<option value="${j}">${L[j]}. ${esc(r)}</option>`).join('')}</select><span class="ans"></span></div>`).join('')}</div>
      <ol class="rlist" type="a">${p.right.map((r, j) => `<li><b>${L[j]}.</b>${esc(r)}</li>`).join('')}</ol></div>`);
    return {
      root,
      check() {
        let s = 0;
        $$('select', root).forEach(sel => {
          const i = +sel.dataset.i; const a = sel.nextElementSibling; a.textContent = ''; sel.classList.remove('ok', 'bad');
          if (sel.value !== '' && +sel.value === p.ans[i]) { s++; sel.classList.add('ok'); }
          else { sel.classList.add('bad'); a.textContent = '→ ' + L[p.ans[i]] + '. ' + p.right[p.ans[i]]; }
        });
        return { s, t: p.ans.length };
      },
      reset() { $$('select', root).forEach(x => { x.value = ''; x.classList.remove('ok', 'bad'); x.nextElementSibling.textContent = ''; }); }
    };
  }

  function makeSeq(p) {
    let picked = [];
    const root = el(`<div><div class="tiles">${p.tiles.map((t, i) => `<button type="button" class="tl" data-i="${i}">${esc(t)}</button>`).join('')}</div>
      <div class="seqout" aria-live="polite" aria-label="내가 고른 순서"></div>
      <button type="button" class="btn sm line undo">한 칸 지우기</button></div>`);
    const out = $('.seqout', root);
    const draw = (mark) => {
      out.innerHTML = picked.map((v, i) => `<span class="${mark ? (v === String(p.ans[i]) ? 'ok' : 'bad') : ''}">${esc(v)}</span>`).join('');
    };
    root.addEventListener('click', e => {
      const b = e.target.closest('.tl'); if (b) { picked.push(b.textContent); draw(); }
      if (e.target.closest('.undo')) { picked.pop(); draw(); }
    });
    return {
      root,
      check() {
        let s = 0; p.ans.forEach((a, i) => { if (picked[i] === String(a)) s++; });
        draw(true);
        if (s < p.ans.length) out.insertAdjacentHTML('beforeend', `<span class="ans" style="align-self:center">정답: ${esc(p.ans.join(', '))}</span>`);
        return { s, t: p.ans.length };
      },
      reset() { picked = []; draw(); }
    };
  }

  function makeMark(p) {
    const root = el(`<div class="tiles">${p.tiles.map(t => `<button type="button" class="tl sm" aria-pressed="false" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>`);
    root.addEventListener('click', e => {
      const b = e.target.closest('.tl'); if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on); b.classList.toggle('sel', on);
    });
    return {
      root,
      check() {
        const ans = p.ans.map(String); let s = 0, wrong = 0;
        $$('.tl', root).forEach(b => {
          const on = b.getAttribute('aria-pressed') === 'true'; const inA = ans.includes(b.dataset.v);
          b.classList.remove('ok', 'bad');
          if (on && inA) { s++; b.classList.add('ok'); b.style.background = 'var(--ok-bg)'; b.style.borderColor = 'var(--ok)'; }
          else if (on) { wrong++; b.style.background = 'var(--bad-bg)'; b.style.borderColor = 'var(--bad)'; }
          else if (inA) { b.style.background = 'var(--warn-bg)'; b.style.borderColor = 'var(--saffron-d)'; }
          else { b.style.background = ''; b.style.borderColor = ''; }
        });
        return { s: Math.max(0, s - wrong), t: ans.length };
      },
      reset() { $$('.tl', root).forEach(b => { b.setAttribute('aria-pressed', 'false'); b.classList.remove('sel'); b.style.background = ''; b.style.borderColor = ''; }); }
    };
  }

  function findWord(grid, w) {
    const R = grid.length, C = grid[0].length, W = strip(w.toLowerCase()).replace(/\s/g, '');
    const g = grid.map(r => strip(r.toLowerCase()));
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]) {
        let k = 0; while (k < W.length) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || cc < 0 || rr >= R || cc >= C || g[rr][cc] !== W[k]) break; k++; }
        if (k === W.length) return { r, c, dr, dc, len: W.length };
      }
    return null;
  }
  function makeWS(p) {
    const grid = p.grid.map(r => r.replace(/\s/g, ''));
    const C = grid[0].length; const found = new Set(); let start = null;
    const root = el(`<div><div class="wl">${p.words.map(w => `<span data-w="${esc(w)}">${esc(w)}</span>`).join('')}</div>
      <div class="ws" style="grid-template-columns:repeat(${C},30px)">${grid.map((row, r) => [...row].map((ch, c) => `<button type="button" data-r="${r}" data-c="${c}" aria-label="${ch}">${esc(ch)}</button>`).join('')).join('')}</div>
      <p class="hint">시작 글자와 끝 글자를 차례로 눌러 단어를 찾으세요. (가로·세로·대각선, 거꾸로도 가능)</p></div>`);
    const cell = (r, c) => $(`.ws button[data-r="${r}"][data-c="${c}"]`, root);
    const mark = (f, w) => { for (let k = 0; k < f.len; k++) cell(f.r + f.dr * k, f.c + f.dc * k).classList.add('f'); const sp = $(`.wl span[data-w="${w}"]`, root); sp && sp.classList.add('f'); found.add(w); };
    root.addEventListener('click', e => {
      const b = e.target.closest('.ws button'); if (!b) return;
      const r = +b.dataset.r, c = +b.dataset.c;
      if (!start) { start = { r, c }; b.classList.add('s'); return; }
      $$('.ws button.s', root).forEach(x => x.classList.remove('s'));
      const dr = Math.sign(r - start.r), dc = Math.sign(c - start.c), len = Math.max(Math.abs(r - start.r), Math.abs(c - start.c)) + 1;
      const straight = r === start.r || c === start.c || Math.abs(r - start.r) === Math.abs(c - start.c);
      if (straight && len > 1) {
        let s = ''; for (let k = 0; k < len; k++) s += grid[start.r + dr * k][start.c + dc * k];
        const ns = strip(s.toLowerCase()), rs = [...ns].reverse().join('');
        const w = p.words.find(x => { const y = strip(x.toLowerCase()).replace(/\s/g, ''); return y === ns || y === rs; });
        if (w && !found.has(w)) mark({ r: start.r, c: start.c, dr, dc, len }, w);
      }
      start = null;
    });
    return {
      root,
      check() {
        p.words.forEach(w => { if (!found.has(w)) { const f = findWord(grid, w); if (f) { mark(f, w); const sp = $(`.wl span[data-w="${w}"]`, root); sp.classList.remove('f'); sp.style.color = 'var(--bad)'; } } });
        return { s: [...found].filter(w => !($(`.wl span[data-w="${w}"]`, root).style.color)).length, t: p.words.length };
      },
      reset() { found.clear(); start = null; $$('.ws button', root).forEach(b => b.classList.remove('f', 's')); $$('.wl span', root).forEach(s => { s.classList.remove('f'); s.style.color = ''; }); }
    };
  }

  function makeOpen(p, uid, key) {
    const rows = p.rows || 0;
    const root = el(`<div class="open">${p.prompt ? `<p>${nl(p.prompt)}</p>` : ''}
      ${rows ? Array.from({ length: rows }, (_, i) => `<textarea class="f" rows="2" aria-label="답안 ${i + 1}" placeholder="${esc(p.ph || '여기에 써 보세요')}"></textarea>`).join('') : ''}
      ${p.sample ? `<button type="button" class="btn sm line showsample">예시 답안 보기</button><div class="sample">${nl(p.sample)}</div>` : ''}</div>`);
    const sv = S.get('open:' + key) || [];
    $$('textarea', root).forEach((t, i) => { t.value = sv[i] || ''; t.addEventListener('input', () => { S.set('open:' + key, $$('textarea', root).map(x => x.value)); }); });
    root.addEventListener('click', e => { if (e.target.closest('.showsample')) $('.sample', root).classList.toggle('on'); });
    return { root, check() { return { s: 0, t: 0 }; }, reset() { } };
  }

  function makeSay(p) {
    const root = el(`<div class="exprs">${p.words.map(x => { const [d, v] = Array.isArray(x) ? x : [x, x]; return `<button type="button" class="expr es" data-say="${esc(v)}">${esc(d)}</button>`; }).join('')}</div>`);
    root.addEventListener('click', e => { const t = e.target.closest('.expr'); if (t) TTS.say(t.dataset.say); });
    return { root, check() { return { s: 0, t: 0 }; }, reset() { } };
  }
  function numES(n) {
    const u = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    if (n < 30) return u[n]; if (n === 100) return 'cien';
    const t = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']; const d = Math.floor(n / 10), r = n % 10;
    return t[d] + (r ? ' y ' + u[r] : '');
  }
  function makeBingo(p) {
    const root = el(`<div><div class="bingo">${Array.from({ length: 16 }, (_, i) => `<input inputmode="numeric" maxlength="3" aria-label="빙고 칸 ${i + 1}">`).join('')}</div>
      <div class="tools"><button type="button" class="btn sm gold go">▶ 번호 부르기 시작</button><button type="button" class="btn sm line halt">■ 멈춤</button></div><p class="hint stat" aria-live="polite">0~100 사이 숫자 16개를 칸마다 하나씩 쓰고 시작하세요.</p></div>`);
    const stat = $('.stat', root);
    const cells = () => $$('.bingo input', root);
    root.addEventListener('click', e => {
      if (e.target.closest('.halt')) { TTS.stop(); return; }
      if (!e.target.closest('.go')) return;
      const vals = cells().map(i => i.value.trim());
      if (vals.some(v => !/^\d{1,3}$/.test(v) || +v > 100) || new Set(vals).size < 16) { stat.textContent = '0~100 사이의 서로 다른 숫자 16개를 모두 써 주세요.'; return; }
      cells().forEach(i => { i.readOnly = true; i.classList.remove('x'); i.style.textDecoration = ''; i.style.background = ''; });
      const order = Array.from({ length: 101 }, (_, i) => i).sort(() => Math.random() - 0.5);
      stat.textContent = '잘 들으세요…';
      TTS.say(order.map(numES), { gap: 1100, each: idx => {
        const n = String(order[idx]);
        cells().forEach(i => { if (i.value.trim() === n) { i.style.textDecoration = 'line-through'; i.style.background = 'var(--saffron)'; i.dataset.x = 1; } });
        const left = cells().filter(i => !i.dataset.x).length;
        stat.textContent = `${numES(order[idx])} (${order[idx]}) — 남은 칸 ${left}개`;
        if (!left) { TTS.stop(); stat.textContent = '¡Bingo! 🎉 모든 숫자를 지웠어요.'; }
      } });
    });
    return { root, check() { return { s: 0, t: 0 }; }, reset() { TTS.stop(); cells().forEach(i => { i.value = ''; i.readOnly = false; i.style.textDecoration = ''; i.style.background = ''; delete i.dataset.x; }); stat.textContent = '0~100 사이 숫자 16개를 칸마다 하나씩 쓰고 시작하세요.'; } };
  }
  function makeTable(p) {
    const root = el(`<div style="overflow:auto"><table class="sumtable"><thead><tr>${p.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${p.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    return { root, check() { return { s: 0, t: 0 }; }, reset() { } };
  }
  const MAKERS = { table: makeTable, bingo: makeBingo, say: makeSay, fill: makeFill, choice: (p, u) => makeChoice(p, u, false), tf: (p, u) => makeChoice(p, u, true), match: makeMatch, seq: makeSeq, mark: makeMark, ws: makeWS, open: makeOpen };

  /* ---------- audio bar ---------- */
  function audioBar(lessonNo, b) {
    const segs = b.audio; if (!segs || !segs.length) return null;
    const key = lessonNo + '.' + b.id;
    const ext = AUDIO_MAP[key];
    const root = el(`<div class="tools audio"><button type="button" class="btn sm gold play" aria-label="전체 듣기">▶ 듣기</button>
      <button type="button" class="btn sm line stop">■ 정지</button>
      ${segs.length > 1 ? segs.map((_, i) => `<button type="button" class="btn sm line seg" data-i="${i}" aria-label="${i + 1}번 듣기">${i + 1}</button>`).join('') : ''}
      <button type="button" class="btn sm line scr">대본 보기</button></div>`);
    const script = el(`<div class="script">${nl(segs.join('\n'))}</div>`);
    root.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('.play')) { t.closest('.play').classList.add('playing'); ext ? TTS.file(ext, () => t.classList.remove('playing')) : TTS.say(segs, { done: () => $('.play', root).classList.remove('playing') }); }
      else if (t.closest('.stop')) TTS.stop();
      else if (t.closest('.seg')) TTS.say(segs[+t.closest('.seg').dataset.i]);
      else if (t.closest('.scr')) { script.classList.toggle('on'); t.closest('.scr').textContent = script.classList.contains('on') ? '대본 숨기기' : '대본 보기'; }
    });
    const wrap = document.createElement('div'); wrap.append(root, script); return wrap;
  }

  /* ---------- block rendering ---------- */
  const pageData = {};
  function renderBlock(L, b, ctx) {
    const sec = el(`<section class="blk" id="${b.id}"></section>`);
    const tagCls = b.kind === 'dialogue' ? 'dlg' : (b.kind === 'check' || b.kind === 'useful' ? 'chk' : '');
    sec.innerHTML = `<h2><span class="tag ${tagCls}">${esc(b.tag || '')}</span>${esc(b.title || '')}</h2>`;

    if (b.kind === 'text') {
      sec.append(el(`<div class="intro">${b.paras.map(([es, ko]) => `<p class="es">${esc(es)}</p>${ko ? `<p class="kr">${esc(ko)}</p>` : ''}`).join('')}</div>`));
      return { sec };
    }
    if (b.kind === 'dialogue') {
      if (b.instr) sec.append(el(`<p class="instr"><span class="es">${esc(b.instr)}</span><span class="kr">${esc(b.instrKo || '')}</span></p>`));
      if (b.ctx) sec.append(el(`<p class="ctx">${esc(b.ctx)}${b.ctxKo ? ` <span class="hint">(${esc(b.ctxKo)})</span>` : ''}</p>`));
      const who = [...new Set(b.lines.map(l => l[0]).filter(Boolean))];
      const d = el(`<div class="dlg"><div class="tools"><button type="button" class="btn sm gold playall">▶ 전체 듣기</button><button type="button" class="btn sm line stop">■ 정지</button><button type="button" class="btn sm line ko">한국어 번역 보기</button></div>
        <div>${b.lines.map((l, i) => `<div class="dlg-line" data-i="${i}" tabindex="0" role="button" aria-label="${esc(l[1])} 듣기"><span class="who">${esc(l[0] || '')}</span><span class="t"><span class="es">${esc(l[1])}</span><span class="ko">${esc(l[2] || '')}</span></span></div>`).join('')}</div></div>`);
      const speak = idx => TTS.say(b.lines[idx][1], { pitchOf: () => (who.indexOf(b.lines[idx][0]) % 2 ? 1.18 : 0.95) });
      d.addEventListener('click', e => {
        const ln = e.target.closest('.dlg-line');
        if (ln) { speak(+ln.dataset.i); return; }
        if (e.target.closest('.playall')) {
          const key = L.n + '.' + b.id;
          if (AUDIO_MAP[key]) { TTS.file(AUDIO_MAP[key]); return; }
          TTS.say(b.lines.map(l => l[1]), { gap: 500, pitchOf: i => (who.indexOf(b.lines[i][0]) % 2 ? 1.18 : 0.95), each: i => { $$('.dlg-line', d).forEach(x => x.classList.remove('on')); $$('.dlg-line', d)[i].classList.add('on'); }, done: () => $$('.dlg-line', d).forEach(x => x.classList.remove('on')) });
        }
        if (e.target.closest('.stop')) { TTS.stop(); $$('.dlg-line', d).forEach(x => x.classList.remove('on')); }
        if (e.target.closest('.ko')) { d.classList.toggle('showko'); e.target.closest('.ko').textContent = d.classList.contains('showko') ? '한국어 번역 숨기기' : '한국어 번역 보기'; }
      });
      d.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dlg-line')) { e.preventDefault(); speak(+e.target.dataset.i); } });
      sec.append(d);
      if (b.exprs) {
        sec.append(el(`<p class="instr" style="margin-top:16px"><span class="es">b) Practica con tus compañeros utilizando las siguientes expresiones.</span><span class="kr">아래 표현을 눌러 발음을 듣고, 짝과 함께 연습하세요.</span></p>`));
        const ex = el(`<div class="exprs">${b.exprs.map(x => `<button type="button" class="expr es">${esc(x)}</button>`).join('')}</div>`);
        ex.addEventListener('click', e => { const t = e.target.closest('.expr'); if (t) TTS.say(t.textContent); });
        sec.append(ex);
      }
      return { sec };
    }
    if (b.kind === 'useful') {
      const ex = el(`<div class="exprs">${b.exprs.map(x => `<button type="button" class="expr es">${esc(x)}</button>`).join('')}</div>`);
      ex.addEventListener('click', e => { const t = e.target.closest('.expr'); if (t) TTS.say(t.textContent); });
      sec.append(ex);
      if (b.proverb) sec.append(el(`<div class="note" style="margin-top:16px"><b>Proverbio</b> — <span class="es">${esc(b.proverb)}</span>${b.proverbKo ? `<br><span class="hint">${esc(b.proverbKo)}</span>` : ''}<br><span class="hint">${esc(b.proverbQ || '¿Hay algún proverbio semejante en tu lengua? (우리말에도 비슷한 속담이 있나요?)')}</span></div>`));
      return { sec };
    }

    // activity / check
    sec.append(el(`<p class="instr"><span class="es">${nl(b.instr || '')}</span>${b.ko ? `<span class="kr">${nl(b.ko)}</span>` : ''}</p>`));
    if (b.note) sec.append(el(`<p class="hint">${nl(b.note)}</p>`));
    const ab = audioBar(L.n, b); if (ab) sec.append(ab);
    const parts = blockParts(b).map((p, i) => {
      const uid = `${L.n}-${b.id}-${i}`;
      const mk = p.type === 'open' ? makeOpen(p, uid, `${L.n}.${b.id}.${i}`) : MAKERS[p.type](p, uid);
      const wrap = el(`<div class="part">${p.label ? `<h3 style="font-size:1.02rem;margin:14px 0 6px">${esc(p.label)}</h3>` : ''}</div>`);
      wrap.append(mk.root); sec.append(wrap); return mk;
    });
    const total = blockTotal(b);
    const acts = el(`<div class="acts"></div>`);
    const key = `${L.n}.${b.id}`;
    if (total > 0) {
      const saved = S.get('sc:' + key);
      acts.innerHTML = `<button type="button" class="btn chk">채점하기</button><button type="button" class="btn line rst">다시 풀기</button><span class="score" aria-live="polite">${saved ? `${saved.s} / ${saved.t}` : `0 / ${total}`}</span>${saved && saved.s === saved.t ? '' : ''}`;
      const sc = $('.score', acts); if (saved && saved.s === saved.t && saved.t) sc.classList.add('full');
      acts.addEventListener('click', e => {
        if (e.target.closest('.chk')) {
          let s = 0, t = 0; parts.forEach(m => { const r = m.check(); s += r.s; t += r.t; });
          sc.textContent = `${s} / ${t}`; sc.classList.toggle('full', s === t);
          S.set('sc:' + key, { s, t }); ctx.refresh();
        }
        if (e.target.closest('.rst')) { parts.forEach(m => m.reset()); S.del('sc:' + key); sc.textContent = `0 / ${total}`; sc.classList.remove('full'); ctx.refresh(); }
      });
    } else {
      const done = S.get('done:' + key);
      acts.innerHTML = `<label class="opt"><input type="checkbox" ${done ? 'checked' : ''}><span>연습했어요 (채점 없는 말하기·쓰기 활동)</span></label>`;
      acts.addEventListener('change', e => { if (e.target.checked) S.set('done:' + key, 1); else S.del('done:' + key); ctx.refresh(); });
    }
    sec.append(acts);
    return { sec, total };
  }

  /* ---------- lesson page ---------- */
  function lessonPage() {
    const n = +document.body.dataset.lesson;
    const L = window.LESSONS[n]; if (!L) return;
    const meta = window.META;
    document.title = `Lección ${n} · ${L.es} — Conversación I`;
    const lessonOpts = meta.map(m => `<option value="${String(m.n).padStart(2, '0')}.html" ${m.n === n ? 'selected' : ''}>Lección ${m.n} · ${m.es}</option>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `
      <header class="bar"><div class="wrap">
        <a class="brand" href="../index.html"><i>¡</i>Conversación I</a>
        <select aria-label="과 이동" id="jump">${lessonOpts}</select>
        <span class="sp"></span>
        <span class="nav"><a href="../resources.html">음원 자료실</a></span>
        <span class="pill" id="tot" title="이 과의 총점">0 / 0</span>
      </div></header>
      <div class="lhead"><div class="wrap"><div class="num">${String(n).padStart(2, '0')}</div><div><h1 class="es">${esc(L.es)}</h1><div class="ko">${esc(L.ko)}</div></div></div></div>
      <main class="wrap"><div class="goals">
        <div class="goal"><b>Tema y vocabulario</b>${L.topics.map(esc).join('<br>')}</div>
        <div class="goal"><b>Comunicación</b>${L.comm.map(esc).join('<br>')}</div>
        <div class="goal"><b>Gramática</b>${L.gram.map(esc).join('<br>')}</div></div>
        <div class="layout"><nav class="toc" aria-label="목차"></nav><div id="blocks"></div></div>
        <div class="pager"></div></main>
      <footer><div class="wrap">교재: 『스페인어 회화 I / Conversación I』 (전라남도교육청). 듣기는 교재 대본을 브라우저 음성으로 읽어 줍니다. 점수는 이 기기의 브라우저에만 저장됩니다.</div></footer>`);
    $('#jump').addEventListener('change', e => { location.href = e.target.value; });

    const blocks = $('#blocks'), toc = $('.toc');
    const ctx = { refresh };
    const infos = [];
    L.blocks.forEach(b => {
      const r = renderBlock(L, b, ctx);
      blocks.append(r.sec);
      infos.push({ b, total: r.total || 0 });
      toc.append(el(`<a href="#${b.id}" data-id="${b.id}"><span>${esc(b.short || b.tag || b.title || '')}</span><span class="s"></span></a>`));
    });
    // summary block
    const sum = el(`<section class="blk" id="resumen"><h2><span class="tag chk">Resumen</span>결과 요약</h2>
      <p class="hint">각 연습문제에서 「채점하기」를 누르면 점수가 기록됩니다.</p><table class="sumtable"><thead><tr><th>활동</th><th>점수</th></tr></thead><tbody></tbody></table>
      <div class="acts"><span class="score" id="grand">0 / 0</span><button type="button" class="btn line" id="resetall">이 과 점수 모두 지우기</button><button type="button" class="btn line" id="print">인쇄 / PDF 저장</button></div></section>`);
    blocks.append(sum);
    toc.append(el(`<a href="#resumen"><span>결과 요약</span><span class="s"></span></a>`));
    $('#resetall').addEventListener('click', () => { if (confirm('이 과의 점수 기록을 모두 지울까요?')) { L.blocks.forEach(b => { S.del('sc:' + n + '.' + b.id); S.del('done:' + n + '.' + b.id); }); location.reload(); } });
    $('#print').addEventListener('click', () => window.print());

    function refresh() {
      let gs = 0, gt = 0; const rows = [];
      infos.forEach(({ b, total }) => {
        const a = $(`.toc a[data-id="${b.id}"]`);
        if (total > 0) {
          const sv = S.get('sc:' + n + '.' + b.id); gt += total; if (sv) gs += sv.s;
          a.classList.toggle('done', !!sv); $('.s', a).textContent = sv ? `${sv.s}/${sv.t}` : '';
          rows.push(`<tr><td>${esc((b.tag ? b.tag + ' ' : '') + (b.title || ''))}</td><td>${sv ? sv.s + ' / ' + sv.t : `— / ${total}`}</td></tr>`);
        } else if (b.instr) {
          const d = S.get('done:' + n + '.' + b.id); a.classList.toggle('done', !!d); $('.s', a).textContent = d ? '✓' : '';
          rows.push(`<tr><td>${esc((b.tag ? b.tag + ' ' : '') + (b.title || ''))}</td><td>${d ? '연습 완료' : '말하기·쓰기 (채점 없음)'}</td></tr>`);
        }
      });
      $('#tot').textContent = `${gs} / ${gt}`; $('#grand').textContent = `총점 ${gs} / ${gt}` + (gt ? ` (${Math.round(gs / gt * 100)}%)` : '');
      $('.sumtable tbody', sum).innerHTML = rows.join('');
      const pr = S.get('lesson:' + n) || {}; S.set('lesson:' + n, { s: gs, t: gt });
    }
    refresh();
    const prev = meta.find(m => m.n === n - 1), nxt = meta.find(m => m.n === n + 1);
    $('.pager').innerHTML = `${prev ? `<a class="btn line" href="${String(prev.n).padStart(2, '0')}.html">← Lección ${prev.n}</a>` : '<span></span>'}<a class="btn line" href="../index.html">전체 목차</a>${nxt ? `<a class="btn gold" href="${String(nxt.n).padStart(2, '0')}.html">Lección ${nxt.n} →</a>` : '<span></span>'}`;
    window.addEventListener('pagehide', () => TTS.stop());
  }

  /* ---------- index page ---------- */
  function indexPage() {
    const meta = window.META; const grid = $('#grid');
    const nm = $('#who'); const saved = S.get('name'); if (saved) nm.value = saved;
    nm.addEventListener('input', () => S.set('name', nm.value));
    let GS = 0, GT = 0, done = 0;
    meta.forEach(m => {
      const L = (window.LESSONS || {})[m.n]; let total = 0, got = 0, nAct = 0, nDone = 0;
      if (L) L.blocks.forEach(b => { const t = blockTotal(b); if (t > 0) { total += t; nAct++; const sv = S.get('sc:' + m.n + '.' + b.id); if (sv) { got += sv.s; nDone++; } } });
      GS += got; GT += total; done += nDone;
      const pct = nAct ? Math.round(nDone / nAct * 100) : 0;
      grid.append(el(`<a class="tile" href="lessons/${String(m.n).padStart(2, '0')}.html">
        <div class="top"><div class="num">${String(m.n).padStart(2, '0')}</div><div><h3 class="es">${esc(m.es)}</h3><div class="ko">${esc(m.ko)}</div></div></div>
        <div class="body"><b>${esc(L ? L.topics.join(' · ') : '')}</b><br>${esc(L ? L.comm.join(' · ') : '')}</div>
        <div class="foot"><div class="meter" aria-label="진행률 ${pct}%"><i style="width:${pct}%"></i></div><span>${got} / ${total}점</span></div></a>`));
    });
    $('#gsum').textContent = `전체 ${GS} / ${GT}점 · 채점한 활동 ${done}개`;
    window.addEventListener('pagehide', () => TTS.stop());
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.lesson) lessonPage();
    else if (document.body.dataset.page === 'index') indexPage();
  });
  window.CX.TTS = TTS;
})();
