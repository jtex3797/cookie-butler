// 쿠키 도우미 시험 도구.
// 분리된 시험용 Chromium을 빈 임시 프로필로 띄우고, 확장 프로그램을 넣은 뒤 사이트 목록을 자동 방문.
// 결과는 tools/results/<시각>/ 에 표(report.md), 원자료(results.json), 화면 사진으로 저장. 끝나면 프로필 삭제.
//
// 실행: node run-sites.js            (필수만, 통계까지 2회)
//       node run-sites.js 0          (필수만 1회)   단계: 0 필수만, 1 기능까지, 2 통계까지, 3 전부 허용
//       node run-sites.js 0 3        (앞에서 3곳만, 동작 확인용)
const fs = require("fs");
const path = require("path");

// 시험용 브라우저는 이 폴더 안의 것만 사용 (C 드라이브의 기본 위치를 쓰지 않음)
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, ".browsers");
const { chromium } = require("playwright");

const EXTENSION = path.join(__dirname, "..", "extension", "build");
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, "sites.json"), "utf8"));
const LEVELS = {
    0: { name: "필수만", allow: [] },
    1: { name: "기능까지", allow: ["A"] },
    2: { name: "통계까지", allow: ["A", "B"] },
    3: { name: "전부 허용", allow: ["A", "B", "D", "E", "F", "X"] }
};
const RESULT = { ok: "처리 완료", fail: "처리 못 함", none: "쿠키 창 없음", wall: "처리 불가(거부 없는 창)", timeout: "응답 없음", error: "열기 실패" };
const ENGINE = { ac: "autoconsent", com: "Consent-O-Matic" };
const PARALLEL = 4;        // 동시에 여는 탭 수
const WAIT_RESULT = 30000; // 처리 결과를 기다리는 최대 시간
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-").slice(0, 16);

// 화면에 쿠키 창처럼 보이는 것이 남았는지 대략 판정 (사람이 사진으로 다시 확인하는 용도)
function leftoverBanner() {
    const words = /cookie|consent|privacy|datenschutz|akzept|accept|zustimm|쿠키|동의/i;
    for (const el of document.querySelectorAll("div, section, aside, dialog, form")) {
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        if (style.display === "none" || style.visibility === "hidden" || +style.opacity < 0.1) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 60) continue;
        if (rect.bottom < 0 || rect.top > innerHeight) continue;
        const text = (el.innerText || "").slice(0, 600);
        if (words.test(text) && el.querySelector("button, a, [role=button]")) return text.replace(/\s+/g, " ").slice(0, 80);
    }
    return "";
}

async function runLevel(level, sites, outDir) {
    const profile = path.join(__dirname, ".profile-" + Date.now());
    const context = await chromium.launchPersistentContext(profile, {
        channel: "chromium", // 화면에 창을 띄우지 않고도 확장 프로그램을 쓸 수 있는 방식
        headless: true,
        viewport: { width: 1280, height: 800 },
        locale: "en-GB",
        args: ["--disable-extensions-except=" + EXTENSION, "--load-extension=" + EXTENSION]
    });
    const shots = path.join(outDir, "shots-" + level);
    fs.mkdirSync(shots, { recursive: true });
    const rows = [];
    try {
        let worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
        const liveWorker = async () => {
            // 배경이 잠들었다 깨면 새 객체가 됨
            const now = context.serviceWorkers()[0];
            if (now) worker = now;
            return worker;
        };
        // 허용 단계와 기록 켜기 설정
        const values = {};
        for (const key of ["A", "B", "D", "E", "F", "X"]) values[key] = LEVELS[level].allow.includes(key);
        await worker.evaluate(async (v) => {
            await chrome.storage.sync.set({ consentValues: v });
            await chrome.storage.local.set({ logEnabled: true });
        }, values);

        const readLog = async () => (await liveWorker()).evaluate(() => chrome.storage.local.get({ visitLog: [], cookieLog: [] }));

        const visit = async (url, index) => {
            const row = { url, host: "", result: "timeout", cmp: "", engine: "", seconds: 0, leftover: "", cookiesBefore: null, cookiesAfter: null, externalBefore: null, note: "" };
            const page = await context.newPage();
            const started = Date.now();
            const name = String(index + 1).padStart(2, "0") + "-" + new URL(url).host.replace(/^www\./, "");
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
                row.host = new URL(page.url()).host;
                await sleep(1200);
                await page.screenshot({ path: path.join(shots, name + "-1.jpg"), type: "jpeg", quality: 60 }).catch(() => {});
                // 확장 프로그램이 이 사이트의 결과를 기록할 때까지 대기
                while (Date.now() - started < WAIT_RESULT) {
                    row.host = new URL(page.url()).host;
                    const { visitLog } = await readLog();
                    const hit = visitLog.filter((e) => e.h === row.host).pop();
                    if (hit) {
                        row.result = hit.r;
                        row.cmp = hit.c || "";
                        row.engine = hit.e || "";
                        break;
                    }
                    await sleep(700);
                }
                row.seconds = Math.round((Date.now() - started) / 100) / 10;
                // 처리 뒤 쿠키 기록(4초 뒤 저장)과 화면이 안정되기를 기다림
                // 종류별 선택 단계(1, 2)는 처리 뒤 확인과 넘겨받기가 이어지므로 접속 후 24초까지는 지켜봄
                const settle = (level === 1 || level === 2)
                    ? Math.max(9000, 24000 - (Date.now() - started))
                    : (row.result === "ok" ? 5500 : 1500);
                await sleep(settle);
                {
                    // 기다리는 동안 결과나 엔진이 바뀌었으면 마지막 기록으로 갱신
                    const { visitLog } = await readLog();
                    const last = visitLog.filter((e) => e.h === row.host).pop();
                    if (last) {
                        row.result = last.r;
                        row.cmp = last.c || "";
                        row.engine = last.e || "";
                    }
                }
                row.leftover = await page.evaluate(leftoverBanner).catch(() => "");
                await page.screenshot({ path: path.join(shots, name + "-2.jpg"), type: "jpeg", quality: 60 }).catch(() => {});
                const { cookieLog } = await readLog();
                const ck = cookieLog.filter((e) => e.h === row.host).pop();
                if (ck) {
                    row.cookiesBefore = ck.before.length;
                    row.externalBefore = ck.before.filter((c) => c.x).length;
                    row.cookiesAfter = ck.after.length;
                }
            } catch (e) {
                row.result = "error";
                row.note = String(e.message || e).split("\n")[0].slice(0, 120);
                row.seconds = Math.round((Date.now() - started) / 100) / 10;
            } finally {
                await page.close().catch(() => {});
            }
            rows[index] = row;
            console.log(`[${LEVELS[level].name}] ${String(index + 1).padStart(2)}/${sites.length} ${RESULT[row.result] || row.result}  ${row.host || url}  ${row.cmp} ${row.engine}`);
        };

        // 정해진 수만큼 동시에 진행
        let next = 0;
        await Promise.all(Array.from({ length: PARALLEL }, async () => {
            while (next < sites.length) {
                const index = next++;
                await visit(sites[index], index);
            }
        }));
        const logs = await readLog();
        return { level, rows, logs };
    } finally {
        await context.close().catch(() => {});
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
}

function report(runs) {
    const out = ["# 쿠키 도우미 사이트 시험 결과", "", "실행 시각: " + new Date().toLocaleString("ko-KR"), "사이트 수: " + runs[0].rows.length, ""];
    for (const run of runs) {
        const count = (r) => run.rows.filter((x) => x.result === r).length;
        const left = run.rows.filter((x) => x.leftover).length;
        out.push(`## 허용 단계: ${LEVELS[run.level].name}`, "");
        out.push(`처리 완료 ${count("ok")}, 처리 못 함 ${count("fail")}, 쿠키 창 없음 ${count("none")}, 처리 불가 ${count("wall")}, 응답 없음 ${count("timeout")}, 열기 실패 ${count("error")} / 화면에 쿠키 창이 남은 것으로 보이는 곳 ${left}`, "");
        out.push("| # | 사이트 | 결과 | 동의 창 종류 | 엔진 | 걸린 시간(초) | 동의 전 쿠키(외부) | 처리 후 새 쿠키 | 남은 창 의심 | 비고 |");
        out.push("|---|---|---|---|---|---|---|---|---|---|");
        run.rows.forEach((r, i) => {
            const before = r.cookiesBefore == null ? "-" : `${r.cookiesBefore} (${r.externalBefore})`;
            out.push(`| ${i + 1} | ${r.host || r.url} | ${RESULT[r.result] || r.result} | ${r.cmp || "-"} | ${ENGINE[r.engine] || "-"} | ${r.seconds} | ${before} | ${r.cookiesAfter == null ? "-" : r.cookiesAfter} | ${r.leftover ? "있음" : "-"} | ${r.note || ""} |`);
        });
        out.push("");
    }
    out.push("화면 사진: `shots-<단계>/번호-사이트-1.jpg`(접속 직후), `-2.jpg`(처리 뒤)", "");
    return out.join("\n");
}

(async () => {
    const levels = process.argv[2] != null ? [Number(process.argv[2])] : [0, 2];
    // 셋째 값: 숫자면 앞에서 그만큼만, 글자면 주소에 그 글자가 들어간 사이트만(쉼표로 여러 개)
    const pick = process.argv[3];
    const sites = pick == null ? SITES
        : /^[0-9]+$/.test(pick) ? SITES.slice(0, Number(pick))
        : SITES.filter((url) => pick.split(",").some((key) => url.includes(key)));
    if (!fs.existsSync(path.join(EXTENSION, "manifest.json"))) {
        console.error("확장 프로그램 빌드가 없음. extension 폴더에서 npm run build 먼저 실행");
        process.exit(1);
    }
    const outDir = path.join(__dirname, "results", stamp());
    fs.mkdirSync(outDir, { recursive: true });
    const runs = [];
    for (const level of levels) {
        runs.push(await runLevel(level, sites, outDir));
    }
    fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(runs, null, 1));
    fs.writeFileSync(path.join(outDir, "report.md"), report(runs));
    require("./make-gallery.js")(outDir); // 사진 모아 보기 페이지
    console.log("결과 저장:", outDir);
})().catch((e) => {
    console.error("시험 실패:", e);
    process.exit(1);
});
