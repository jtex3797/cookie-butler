// 스토어 등록용 화면 사진(1280x800)을 store/ 폴더에 만듦. 시험용 브라우저에 확장 프로그램을 넣어 실제 화면을 찍음.
// 실행: node make-store-shots.js
//  screenshot-1.png  사이트 위에 작은 창이 열린 모습
//  screenshot-2.png  쿠키 창을 처리한 직후의 좌하단 알림
//  screenshot-3.png  기록 화면
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, ".browsers");
const { chromium } = require("playwright");

const EXTENSION = path.join(__dirname, "..", "extension", "build");
const OUT = path.join(__dirname, "..", "store");
const MAIN = "https://www.gov.uk/";
const MORE = ["https://stackoverflow.com/", "https://www.ikea.com/de/de/", "https://www.cookieyes.com/", "https://www.corriere.it/"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const profile = path.join(__dirname, ".profile-shots");
    const tmp = path.join(__dirname, ".shots-tmp");
    fs.mkdirSync(tmp, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
        channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, locale: "ko-KR",
        args: ["--disable-extensions-except=" + EXTENSION, "--load-extension=" + EXTENSION]
    });
    try {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
        const extId = new URL(worker.url()).host;
        await worker.evaluate(() => chrome.storage.local.set({ logEnabled: true }));

        // 2번 사진: 처리 직후 알림이 떠 있는 순간
        const page = await context.newPage();
        await page.goto(MAIN, { waitUntil: "domcontentloaded", timeout: 45000 });
        let caught = false;
        for (let i = 0; i < 150 && !caught; i++) {
            const text = await page.evaluate(() => {
                const n = document.querySelector(".ConsentOMatic-Progress-Dialog-Modal.CookieHelper-Done");
                return n ? n.innerText : "";
            }).catch(() => "");
            if (text.includes("닫음")) {
                await sleep(450); // 올라오는 움직임이 끝난 뒤
                await page.screenshot({ path: path.join(OUT, "screenshot-2.png") });
                caught = true;
            } else {
                await sleep(100);
            }
        }
        if (!caught) throw new Error("처리 완료 알림을 잡지 못함");
        await sleep(4500); // 알림이 내려간 뒤의 깨끗한 화면
        await page.screenshot({ path: path.join(tmp, "site.png") });

        // 기록 화면에 보일 자료를 쌓기 위해 몇 곳 더 방문
        for (const url of MORE) {
            const p = await context.newPage();
            await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
            await sleep(11000);
            await p.close();
        }

        // 작은 창: 확장 프로그램의 popup.html을 탭으로 열되, "지금 보는 탭"을 MAIN 탭으로 알려 줌
        const tabId = await worker.evaluate(async (u) => (await chrome.tabs.query({ url: u + "*" }))[0].id, MAIN);
        const popup = await context.newPage();
        await popup.setViewportSize({ width: 290, height: 100 }); // 높이는 내용만큼만 찍히도록 작게
        await popup.addInitScript(([id, url]) => {
            chrome.tabs.query = (q, cb) => cb([{ id: id, url: url }]);
        }, [tabId, MAIN]);
        await popup.goto(`chrome-extension://${extId}/popup.html`);
        await sleep(800);
        await popup.screenshot({ path: path.join(tmp, "popup.png"), fullPage: true });
        await popup.close();

        // 1번 사진: 사이트 화면 오른쪽 위에 작은 창을 겹침
        const compose = path.join(tmp, "compose.html");
        fs.writeFileSync(compose, `<style>body{margin:0;width:1280px;height:800px;overflow:hidden;position:relative;background:#121418}
.site{position:absolute;inset:0;width:1280px;height:800px}
.pop{position:absolute;top:14px;right:28px;width:290px;border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,.55)}</style>
<img class="site" src="site.png"><img class="pop" src="popup.png">`);
        const c = await context.newPage();
        await c.goto(pathToFileURL(compose).href);
        await c.waitForLoadState("networkidle");
        await c.screenshot({ path: path.join(OUT, "screenshot-1.png") });
        await c.close();

        // 3번 사진: 기록 화면 (첫 줄을 펼친 모습)
        const log = await context.newPage();
        await log.goto(`chrome-extension://${extId}/log.html`);
        await sleep(800);
        const rows = log.locator(".row .head");
        const n = await rows.count();
        for (let i = 0; i < n; i++) {
            // 쿠키 기록이 있는 첫 사이트를 펼침
            if (!(await rows.nth(i).innerText()).includes("쿠키 기록 없음")) { await rows.nth(i).click(); break; }
        }
        await sleep(400);
        await log.screenshot({ path: path.join(OUT, "screenshot-3.png") });
        console.log("기록 화면 사이트 수:", n);
    } finally {
        await context.close().catch(() => {});
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log("저장:", OUT);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
