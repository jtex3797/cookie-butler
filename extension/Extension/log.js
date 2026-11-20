// 기록 화면. 저장 형식은 background.js의 logVisit, scheduleAfterSnapshot 참고
// visitLog: { h 사이트, t 시각, r 결과(ok|fail|none), c 동의 창 종류, e 처리 엔진(ac|com) }
// cookieLog: { h, t, c, lv 허용 단계, before 처리 전 쿠키, after 처리 후 새 쿠키 } / 쿠키: { n 이름, d 주소, x 외부 여부, e 남은 일수(0은 브라우저 닫을 때까지) }

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const RESULT = { ok: "처리 완료", fail: "처리 못 함", none: "쿠키 창 없음" };
const LEVEL = ["필수만 허용", "기능까지 허용", "통계까지 허용", "전부 허용"];
const hasStore = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

let data = { visitLog: [], cookieLog: [] };
let filter = "all";
const opened = new Set();

function sampleData() {
    const now = Date.now(), H = 3600e3;
    const ck = (n, d, x, e) => ({ n, d, x, e });
    return {
        visitLog: [
            { h: "news.example.kr", t: now - 0.2 * H, r: "ok", c: "cookiebot" },
            { h: "shop.example.com", t: now - 3 * H, r: "ok", c: "onetrust" },
            { h: "video.example.io", t: now - 5 * H, r: "fail", c: null },
            { h: "blog.example.net", t: now - 26 * H, r: "none", c: null }
        ],
        cookieLog: [
            { h: "news.example.kr", t: now - 0.2 * H, c: "cookiebot", lv: 0,
              before: [ck("session_id", "news.example.kr", false, 0), ck("_ga", "example.kr", false, 730), ck("IDE", "doubleclick.net", true, 390), ck("fr", "facebook.com", true, 90)],
              after: [ck("CookieConsent", "news.example.kr", false, 365)] },
            { h: "shop.example.com", t: now - 3 * H, c: "onetrust", lv: 0,
              before: [ck("cart", "shop.example.com", false, 30)],
              after: [ck("OptanonConsent", "shop.example.com", false, 365), ck("_gcl_au", "example.com", false, 90)] }
        ]
    };
}

function when(t) {
    return new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function period(e) {
    if (!e) return "닫을 때까지";
    if (e >= 365) return Math.round(e / 365) + "년";
    if (e >= 30) return Math.round(e / 30) + "개월";
    return e + "일";
}

// 사이트별로 가장 최근 결과와 가장 최근 쿠키 기록을 묶음
function sites() {
    const map = new Map();
    for (const v of data.visitLog) {
        const s = map.get(v.h);
        if (!s || v.t > s.t) map.set(v.h, { h: v.h, t: v.t, r: v.r, c: v.c, ck: s ? s.ck : null });
    }
    for (const c of data.cookieLog) {
        const s = map.get(c.h) || { h: c.h, t: c.t, r: "ok", c: c.c, ck: null };
        if (!s.ck || c.t > s.ck.t) s.ck = c;
        map.set(c.h, s);
    }
    return [...map.values()].sort((a, b) => b.t - a.t);
}

function cookieList(list) {
    if (!list.length) return '<div class="empty">없음</div>';
    return list.map((c) => `<div class="ckrow"><span class="n">${c.x ? '<span class="ext">외부</span>' : ""}${esc(c.n)}</span><span class="d">${esc(c.d)}</span><span class="e">${period(c.e)}</span></div>`).join("");
}

function draw() {
    const all = sites();
    const count = (r) => all.filter((s) => s.r === r).length;
    const withCk = all.filter((s) => s.ck);
    const early = withCk.reduce((n, s) => n + s.ck.before.length, 0);
    const earlyExt = withCk.reduce((n, s) => n + s.ck.before.filter((c) => c.x).length, 0);
    $("#stats").innerHTML = `
        <div class="stat"><b>${count("ok")}</b><small>처리 완료한 사이트</small></div>
        <div class="stat hot"><b>${count("fail")}</b><small>처리 못 한 사이트</small></div>
        <div class="stat"><b>${count("none")}</b><small>쿠키 창 없음 또는 못 찾음</small></div>
        <div class="stat"><b>${early}</b><small>동의 전에 이미 심긴 쿠키 (외부 ${earlyExt}개)</small></div>`;

    const q = $("#q").value.trim().toLowerCase();
    const shown = all.filter((s) => (filter === "all" || s.r === filter) && (!q || s.h.toLowerCase().includes(q)));
    if (!shown.length) {
        $("#list").innerHTML = `<div class="none">${all.length ? "조건에 맞는 사이트 없음" : "기록 없음. 위의 기록 남기기를 켠 뒤 쿠키 창이 뜨는 사이트를 방문하면 여기에 쌓임"}</div>`;
        return;
    }
    $("#list").innerHTML = shown.map((s) => {
        const ck = s.ck;
        const sum = ck
            ? `동의 전 <b>${ck.before.length}개</b> (외부 ${ck.before.filter((c) => c.x).length}) | 처리 후 <span class="add">+${ck.after.length}개</span>`
            : "쿠키 기록 없음";
        const body = ck
            ? `<div class="meta">동의 창 종류: ${esc(ck.c || "알 수 없음")} | 적용한 범위: ${LEVEL[ck.lv] || LEVEL[0]} | 기록 시각: ${when(ck.t)}</div>
               <div class="cols">
                 <div class="box"><h3>동의 전에 이미 있던 쿠키 <span>${ck.before.length}개</span></h3>${cookieList(ck.before)}</div>
                 <div class="box"><h3>처리 후 새로 생긴 쿠키 <span>${ck.after.length}개</span></h3>${cookieList(ck.after)}</div>
               </div>`
            : `<div class="empty">${s.r === "ok" ? "이 사이트는 쿠키 기록 기능을 넣기 전에 처리됨" : "동의 창을 처리하지 못해 쿠키 전후 기록 없음"}</div>`;
        return `<div class="row${opened.has(s.h) ? " open" : ""}" data-h="${esc(s.h)}">
            <button class="head"><span class="h">${esc(s.h)}</span><span><span class="res ${s.r}">${RESULT[s.r] || s.r}</span></span><span class="ck">${sum}</span><time>${when(s.t)}</time><i></i></button>
            <div class="body">${body}</div></div>`;
    }).join("");
}

$("#list").addEventListener("click", (e) => {
    const head = e.target.closest(".head");
    if (!head) return;
    const row = head.parentElement;
    const h = row.dataset.h;
    if (opened.has(h)) opened.delete(h); else opened.add(h);
    row.classList.toggle("open");
});
$("#bar").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    filter = chip.dataset.f;
    document.querySelectorAll("#bar .chip").forEach((c) => c.classList.toggle("on", c === chip));
    draw();
});
$("#q").addEventListener("input", draw);

$("#export").addEventListener("click", () => {
    const out = { app: "cookie-helper", exported: new Date().toISOString(), visitLog: data.visitLog, cookieLog: data.cookieLog };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cookie-helper-log-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("#clear").addEventListener("click", () => {
    if (!confirm("기록을 모두 삭제할까요? 되돌릴 수 없음. 필요하면 먼저 파일로 내보내기.")) return;
    data = { visitLog: [], cookieLog: [] };
    if (hasStore) chrome.storage.local.set({ visitLog: [], cookieLog: [], handledLog: [] });
    draw();
});

// 기록 남기기 스위치 (기본은 꺼짐)
function drawSwitch(on) {
    $("#logSw").classList.toggle("on", on);
    $("#logState").textContent = on ? "켜짐" : "꺼짐";
    $("#logState").classList.toggle("on", on);
}
$("#logSw").addEventListener("click", () => {
    const on = !$("#logSw").classList.contains("on");
    drawSwitch(on);
    if (hasStore) chrome.storage.local.set({ logEnabled: on });
});

if (hasStore) {
    chrome.storage.local.get({ visitLog: [], cookieLog: [], logEnabled: false }, (stored) => {
        data = { visitLog: stored.visitLog, cookieLog: stored.cookieLog };
        drawSwitch(stored.logEnabled);
        draw();
    });
} else {
    drawSwitch(true);
    $("#sample").hidden = false;
    data = sampleData();
    opened.add("news.example.kr");
    draw();
}
