import GDPRConfig from './GDPRConfig.js';
import { t, applyI18n } from './i18n.js';

applyI18n();

const $ = (s) => document.querySelector(s);

// 드래그바 단계별 허용 범위. 값은 원본 동작 부분의 쿠키 분류 기호
// A 기능, B 통계, D 정보 저장, E 콘텐츠 맞춤, F 광고, X 기타
const LEVELS = [
    { name: t("level0"), desc: t("level0Desc"), allow: [] },
    { name: t("level1"), desc: t("level1Desc"), allow: ["A"] },
    { name: t("level2"), desc: t("level2Desc"), allow: ["A", "B"] },
    { name: t("level3"), desc: t("level3Desc"), allow: ["A", "B", "D", "E", "F", "X"] }
];
const STATUS_TEXT = { 2: t("status2"), 3: t("status3"), 4: t("status4"), 5: t("status5") };

function levelFromValues(v) {
    if (v.D || v.E || v.F || v.X) return 3;
    if (v.B) return 2;
    if (v.A) return 1;
    return 0;
}

function drawLevel(level) {
    document.querySelectorAll("#tiles .tile").forEach((t, i) => t.classList.toggle("on", i <= level));
    $("#lv").textContent = LEVELS[level].name;
    const small = document.createElement("small");
    small.textContent = LEVELS[level].desc;
    $("#lv").appendChild(small);
}

// 허용 범위
GDPRConfig.getConsentValues().then((values) => {
    const range = $("#level");
    range.value = levelFromValues(values);
    drawLevel(+range.value);
    const setLevel = (level) => {
        range.value = level;
        const next = {};
        for (const key of Object.keys(GDPRConfig.defaultValues)) next[key] = LEVELS[level].allow.includes(key);
        GDPRConfig.setConsentValues(next);
        drawLevel(level);
        $("#note").classList.add("show");
    };
    range.addEventListener("input", () => setLevel(+range.value));
    // 쿠키 종류 칸을 눌러도 그 단계까지 허용
    document.querySelectorAll("#tiles .tile").forEach((t, i) => t.addEventListener("click", () => setLevel(i)));
});

// 기록 화면 열기
$("#openLog").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
    window.close();
});

// 오늘 처리 건수
chrome.storage.local.get({ handledLog: [] }, ({ handledLog }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    $("#cnt").textContent = handledLog.filter((e) => e.t >= start.getTime()).length;
});

// 지금 보고 있는 사이트
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const sw = $("#siteSw");
    let host = "";
    try {
        const u = new URL(tab.url);
        if (u.protocol === "http:" || u.protocol === "https:") host = u.host;
    } catch (e) { /* 주소 없는 탭 */ }

    if (!host) {
        $("#host").textContent = t("thisPage");
        $("#hostSub").textContent = t("notHere");
        sw.disabled = true;
        $("#clearSite").disabled = true;
        return;
    }

    // 이 사이트 쿠키 지우기: 첫 번째 누름은 확인, 두 번째 누름에 삭제 후 새로 고침
    const clearButton = $("#clearSite");
    clearButton.addEventListener("click", async () => {
        if (!clearButton.classList.contains("ask")) {
            clearButton.classList.add("ask");
            clearButton.textContent = t("clearAsk");
            return;
        }
        clearButton.disabled = true;
        clearButton.textContent = t("clearing");
        try {
            // 이 주소로 보내지는 쿠키 전부 (상위 주소에 심긴 것 포함)
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            await Promise.all(cookies.map((c) => chrome.cookies.remove({
                url: (c.secure ? "https://" : "http://") + c.domain.replace(/^\./, "") + c.path,
                name: c.name,
                storeId: c.storeId
            }).catch(() => null)));
            // 동의 선택을 쿠키 대신 브라우저 저장 공간에 두는 사이트도 있어서 같이 비움
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try { localStorage.clear(); } catch (e) { /* 접근 불가 */ }
                    try { sessionStorage.clear(); } catch (e) { /* 접근 불가 */ }
                }
            }).catch(() => null);
        } finally {
            chrome.tabs.reload(tab.id);
            window.close();
        }
    });

    $("#host").textContent = host;
    GDPRConfig.isActive(host).then((active) => sw.classList.toggle("on", active));
    sw.addEventListener("click", () => {
        const active = !sw.classList.contains("on");
        sw.classList.toggle("on", active);
        GDPRConfig.setPageActive(host, active);
        $("#note").classList.add("show");
    });

    chrome.runtime.sendMessage("GetStatus|" + tab.id, (status) => {
        if (chrome.runtime.lastError) return;
        const el = $("#status");
        el.textContent = STATUS_TEXT[status] || "";
        el.classList.toggle("done", status === 4);
    });
});
