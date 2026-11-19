window.DAIN_HIDE_CFG={"ko": ".dlg-line .ko"};
/* 다인에듀 학습 사이트 공통 — 뜻 가리기 · 해석 가리기
 * 단어의 뜻(mn)과 문장의 해석(ko)을 버튼 한 번으로 흐리게 가리고, 가려진 부분을 누르면 하나씩 확인합니다.
 * 설정은 브라우저에 저장되어 같은 사이트의 다른 페이지에서도 유지됩니다.
 * 이 사이트에서 가릴 대상은 위의 CFG(선택자)에 정의되어 있습니다.
 */
(function () {
  "use strict";
  if (window.__dainHide) return; window.__dainHide = true;
  var C = window.DAIN_HIDE_CFG || {};
  var SEL = { mn: C.mn || "", ko: C.ko || "" };
  var ANY = C.any || "";
  if (!SEL.mn && !SEL.ko && !ANY) return;
  var EXCL = ".dh-bar" + (C.exclude ? "," + C.exclude : "");
  var KEY = "dain-hide:" + (location.pathname.split("/")[1] || "root");
  var st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  st = { mn: !!st.mn, ko: !!st.ko };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var css = document.createElement("style");
  css.textContent =
    "html.dh-hide-mn .dh-mn,html.dh-hide-ko .dh-ko{filter:blur(6px)!important;cursor:pointer;user-select:none;-webkit-user-select:none;transition:filter .15s}" +
    "html.dh-hide-mn .dh-mn.dh-peek,html.dh-hide-ko .dh-ko.dh-peek{filter:none!important}" +
    ".dh-bar{position:fixed;left:14px;bottom:14px;z-index:2147483000;display:none;align-items:center;gap:6px;background:rgba(255,255,255,.96);border:1px solid #dfe3eb;border-radius:14px;padding:6px;box-shadow:0 8px 24px rgba(20,30,60,.16);font:600 13px/1.2 system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}" +
    ".dh-bar.show{display:flex}" +
    ".dh-bar button{all:unset;box-sizing:border-box;border:1px solid #dfe3eb;background:#fff;border-radius:10px;padding:7px 12px;color:#4b5565;cursor:pointer;white-space:nowrap;font:inherit}" +
    ".dh-bar button:hover{border-color:#9aa3b2}" +
    ".dh-bar button.on{background:#1d2433;color:#fff;border-color:#1d2433}" +
    ".dh-bar button[hidden]{display:none}" +
    ".dh-bar .dh-x{padding:7px 9px;color:#8a93a3}" +
    ".dh-bar.min .dh-k{display:none}" +
    "@media (max-width:640px){.dh-bar{left:8px;bottom:8px}.dh-bar button{padding:6px 9px;font-size:12px}}" +
    "@media print{.dh-bar{display:none!important}.dh-mn,.dh-ko{filter:none!important}}";
  (document.head || document.documentElement).appendChild(css);

  var L = {
    ko: { mn: "뜻 가리기", ko: "해석 가리기", tmn: "단어의 한국어 뜻을 가립니다", tko: "문장의 한국어 해석을 가립니다", min: "접기", open: "뜻·해석 가리기 펼치기" },
    en: { mn: "Hide meanings", ko: "Hide translations", tmn: "Blur word meanings", tko: "Blur sentence translations", min: "Collapse", open: "Show hide tools" }
  };
  function lang() {
    var l = (document.documentElement.lang || "ko").toLowerCase();
    return (C.i18n && l && l.indexOf("ko") !== 0) ? "en" : "ko";
  }

  var bar;
  function build() {
    bar = document.createElement("div");
    bar.className = "dh-bar"; bar.setAttribute("role", "toolbar");
    bar.innerHTML = '<button type="button" class="dh-k" data-k="mn"></button><button type="button" class="dh-k" data-k="ko"></button><button type="button" class="dh-x">⇤</button>';
    document.body.appendChild(bar);
    Array.prototype.forEach.call(bar.querySelectorAll(".dh-k"), function (b) {
      b.addEventListener("click", function () { st[b.dataset.k] = !st[b.dataset.k]; save(); apply(); });
    });
    var x = bar.querySelector(".dh-x");
    try { if (localStorage.getItem(KEY + ":min") === "1") bar.classList.add("min"); } catch (e) {}
    x.addEventListener("click", function () {
      bar.classList.toggle("min");
      try { localStorage.setItem(KEY + ":min", bar.classList.contains("min") ? "1" : "0"); } catch (e) {}
      label();
    });
    label();
  }
  function label() {
    var t = L[lang()];
    bar.setAttribute("aria-label", t.mn + " / " + t.ko);
    var bm = bar.querySelector('[data-k="mn"]'), bk = bar.querySelector('[data-k="ko"]'), x = bar.querySelector(".dh-x");
    bm.textContent = t.mn; bm.title = t.tmn; bk.textContent = t.ko; bk.title = t.tko;
    var min = bar.classList.contains("min");
    x.textContent = min ? "👁" : "⇤"; x.title = min ? t.open : t.min;
  }
  function apply() {
    document.documentElement.classList.toggle("dh-hide-mn", st.mn);
    document.documentElement.classList.toggle("dh-hide-ko", st.ko);
    Array.prototype.forEach.call(bar.querySelectorAll(".dh-k"), function (b) {
      b.classList.toggle("on", st[b.dataset.k]); b.setAttribute("aria-pressed", st[b.dataset.k] ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".dh-peek"), function (e) { e.classList.remove("dh-peek"); });
  }
  function mark(k) {
    if (!SEL[k]) return;
    var list; try { list = document.querySelectorAll(SEL[k]); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.classList.contains("dh-mn") || el.classList.contains("dh-ko") || el.closest(EXCL)) return;
      if (!/\S/.test(el.textContent || "")) return;
      el.classList.add("dh-" + k);
    });
  }
  // 같은 클래스로 뜻과 해석이 함께 쓰이는 사이트: 글의 길이·문장부호로 구분
  function kindOf(el) {
    var t = (el.textContent || "").replace(/\s+/g, " ").trim().replace(/\s*[(（][^()（）]*[)）]$/, "");
    if (/[.?!。…？！]["'”’)]*$/.test(t)) return "ko";
    if (/(니다|어요|아요|해요|세요|이에요|예요|군요|네요|지요|죠|까요?|다)$/.test(t) && t.length > 6) return "ko";
    if (t.length > 22 || t.split(" ").length > 4) return "ko";
    return "mn";
  }
  function markAny() {
    if (!ANY) return;
    var list; try { list = document.querySelectorAll(ANY); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.classList.contains("dh-mn") || el.classList.contains("dh-ko") || el.closest(EXCL)) return;
      if (!/\S/.test(el.textContent || "")) return;
      el.classList.add("dh-" + kindOf(el));
    });
  }
  function scan() {
    if (!bar.isConnected) { document.body.appendChild(bar); apply(); }
    mark("mn"); mark("ko"); markAny();
    var hm = !!document.querySelector(".dh-mn"), hk = !!document.querySelector(".dh-ko");
    bar.querySelector('[data-k="mn"]').hidden = !hm;
    bar.querySelector('[data-k="ko"]').hidden = !hk;
    bar.classList.toggle("show", hm || hk);
    label();
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".dh-mn,.dh-ko");
    if (!t) return;
    var hidden = (st.mn && t.classList.contains("dh-mn")) || (st.ko && t.classList.contains("dh-ko"));
    if (!hidden) return;
    if (t.classList.contains("dh-peek")) { t.classList.remove("dh-peek"); }
    else { t.classList.add("dh-peek"); }
    e.preventDefault(); e.stopPropagation();
  }, true);

  function start() {
    build(); apply(); scan();
    var timer = null;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes" || (m.target.closest && m.target.closest(".dh-bar"))) continue;
        if (!bar.isConnected) { scan(); return; }
        clearTimeout(timer); timer = setTimeout(scan, 150); return;
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["lang"] });
    new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(scan, 150); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
