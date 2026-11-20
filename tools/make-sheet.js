// 시험 결과의 "처리 뒤" 사진을 단계별로 한 장에 모은 그림(sheet-<단계>.jpg)을 만듦. 한눈에 훑어보는 용도.
// 실행: node make-sheet.js results/<시각>
const fs = require("fs");
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, ".browsers");
const { chromium } = require("playwright");
const { pathToFileURL } = require("url");

(async () => {
    const dir = path.resolve(process.argv[2] || "");
    const runs = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
    const browser = await chromium.launch();
    for (const run of runs) {
        const cells = run.rows.map((r, i) => {
            const name = String(i + 1).padStart(2, "0") + "-" + new URL(r.url).host.replace(/^www[.]/, "");
            return `<div><img src="shots-${run.level}/${name}-2.jpg"><b>${i + 1} ${r.host || ""} [${r.result}${r.engine ? " " + r.engine : ""}]</b></div>`;
        }).join("");
        const html = `<style>body{margin:0;background:#111;font:11px sans-serif;color:#fff}.g{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:4px}.g div{position:relative}img{width:100%;display:block}b{position:absolute;left:0;top:0;background:#000c;padding:1px 4px}</style><div class="g">${cells}</div>`;
        const file = path.join(dir, "_sheet.html");
        fs.writeFileSync(file, html);
        const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } });
        await page.goto(pathToFileURL(file).href);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: path.join(dir, "sheet-" + run.level + ".jpg"), type: "jpeg", quality: 70, fullPage: true });
        await page.close();
        fs.unlinkSync(file);
    }
    await browser.close();
    console.log("모음 그림 저장:", dir);
})();
