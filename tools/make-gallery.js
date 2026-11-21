// 시험 결과 폴더의 results.json과 화면 사진으로 모아 보기 페이지(index.html)를 만듦.
// 실행: node make-gallery.js results/<시각>     (run-sites.js가 끝날 때 자동으로도 부름)
const fs = require("fs");
const path = require("path");

const LEVEL = { 0: "필수만", 1: "기능까지", 2: "통계까지", 3: "전부 허용" };
const RESULT = { ok: "처리 완료", fail: "처리 못 함", none: "쿠키 창 없음", wall: "처리 불가(거부 없는 창)", timeout: "응답 없음", error: "열기 실패" };
const ENGINE = { ac: "autoconsent", com: "Consent-O-Matic" };
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function makeGallery(dir) {
    const runs = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
    const count = runs[0].rows.length;
    const cards = [];
    for (let i = 0; i < count; i++) {
        const first = runs[0].rows[i];
        const name = String(i + 1).padStart(2, "0") + "-" + new URL(first.url).host.replace(/^www\./, "");
        const tags = new Set();
        const rows = runs.map((run) => {
            const r = run.rows[i];
            tags.add(r.result);
            if (r.leftover) tags.add("left");
            const shot = (n) => {
                const file = `shots-${run.level}/${name}-${n}.jpg`;
                return fs.existsSync(path.join(dir, file))
                    ? `<a href="${file}" target="_blank"><img loading="lazy" src="${file}" alt=""><span>${n === 1 ? "접속 직후" : "처리 뒤"}</span></a>`
                    : `<div class="noimg">사진 없음</div>`;
            };
            const cookies = r.cookiesBefore == null ? "" : `<span>동의 전 쿠키 ${r.cookiesBefore}개(외부 ${r.externalBefore})</span><span>처리 후 +${r.cookiesAfter}개</span>`;
            return `<div class="run">
  <div class="meta"><b class="lv">${LEVEL[run.level]}</b><span class="res ${r.result}">${RESULT[r.result] || r.result}</span>
    ${r.cmp ? `<span>${esc(r.cmp)}</span>` : ""}${r.engine ? `<span>${ENGINE[r.engine]}</span>` : ""}<span>${r.seconds}초</span>${cookies}
    ${r.leftover ? `<span class="warn">남은 창 의심</span>` : ""}${r.note ? `<span class="warn">${esc(r.note)}</span>` : ""}</div>
  <div class="shots">${shot(1)}${shot(2)}</div>
</div>`;
        }).join("");
        cards.push(`<section class="card" data-tags="${[...tags].join(" ")}"><h2><span class="no">${i + 1}</span>${esc(first.host || first.url)}</h2>${rows}</section>`);
    }
    const summary = runs.map((run) => {
        const n = (r) => run.rows.filter((x) => x.result === r).length;
        return `<div class="stat"><b>${LEVEL[run.level]}</b><span>처리 완료 ${n("ok")}</span><span>쿠키 창 없음 ${n("none")}</span><span>처리 불가 ${n("wall")}</span><span>처리 못 함 ${n("fail")}</span><span>열기 실패 ${n("error") + n("timeout")}</span><span>남은 창 의심 ${run.rows.filter((x) => x.leftover).length}</span></div>`;
    }).join("");
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cookie Butler 시험 결과</title>
<style>
:root{--bg:#121418;--panel:#1c2026;--raise:#282d35;--raise2:#343a44;--text:#ece8df;--mute:#9299a3;--acc:#e8500a;--acc2:#ff6a1f}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:14px;line-height:1.5;padding:24px 16px 80px}
main{max-width:1280px;margin:0 auto}
h1{font-size:22px}
.lead{color:var(--mute);font-size:13px;margin:2px 0 14px}
.stats{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.stat{background:var(--panel);border-radius:10px;padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px}
.stat b{min-width:70px}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
button{font:inherit;color:inherit;border:0;cursor:pointer}
.chip{background:var(--raise);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600}
.chip.on{background:var(--acc);color:#fff}
.card{background:var(--panel);border-radius:12px;padding:14px;margin-bottom:12px}
.card h2{font-size:17px;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.no{background:var(--raise2);border-radius:6px;font-size:12px;padding:1px 8px}
.run{background:var(--raise);border-radius:10px;padding:10px;margin-top:8px}
.meta{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:12px;color:var(--mute);margin-bottom:8px}
.lv{color:var(--text);font-size:13px}
.res{font-weight:700;border-radius:6px;padding:2px 9px;background:var(--raise2);color:var(--text)}
.res.ok{background:var(--acc);color:#fff}
.res.fail,.res.wall,.res.error,.res.timeout{background:#3a2218;color:var(--acc2)}
.warn{color:var(--acc2);font-weight:700}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.shots a{position:relative;display:block;border-radius:8px;overflow:hidden;background:#000}
.shots img{display:block;width:100%;height:auto;transition:transform .2s}
.shots a:hover img{transform:scale(1.03)}
.shots span{position:absolute;left:8px;top:8px;background:#0c0d10;color:var(--text);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600}
.noimg{display:grid;place-items:center;min-height:120px;background:var(--raise2);border-radius:8px;color:var(--mute)}
@media(max-width:700px){.shots{grid-template-columns:1fr}}
</style></head>
<body><main>
<h1>Cookie Butler 시험 결과</h1>
<p class="lead">사이트 ${count}곳. 사진을 누르면 원래 크기로 열림. 왼쪽은 접속 약 1초 뒤, 오른쪽은 처리 뒤.</p>
<div class="stats">${summary}</div>
<div class="bar" id="bar">
  <button class="chip on" data-f="">전체</button><button class="chip" data-f="ok">처리 완료</button><button class="chip" data-f="none">쿠키 창 없음</button>
  <button class="chip" data-f="left">남은 창 의심</button><button class="chip" data-f="fail error timeout">못 함, 실패</button>
</div>
${cards.join("\n")}
</main>
<script>
document.getElementById("bar").addEventListener("click", function (e) {
  var chip = e.target.closest(".chip"); if (!chip) return;
  var want = chip.dataset.f ? chip.dataset.f.split(" ") : [];
  document.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c === chip); });
  document.querySelectorAll(".card").forEach(function (card) {
    var tags = card.dataset.tags.split(" ");
    card.style.display = (!want.length || want.some(function (w) { return tags.indexOf(w) >= 0; })) ? "" : "none";
  });
});
</script>
</body></html>`;
    const out = path.join(dir, "index.html");
    fs.writeFileSync(out, html);
    return out;
}

module.exports = makeGallery;
if (require.main === module) {
    const dir = path.resolve(process.argv[2] || "");
    if (!fs.existsSync(path.join(dir, "results.json"))) {
        console.error("results.json이 있는 결과 폴더를 지정. 예: node make-gallery.js results/2026-11-21-01-58");
        process.exit(1);
    }
    console.log("모아 보기 페이지:", makeGallery(dir));
}
