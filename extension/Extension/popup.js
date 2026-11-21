import GDPRConfig from './GDPRConfig.js';

const $ = (s) => document.querySelector(s);

// 드래그바 단계별 허용 범위. 값은 원본 동작 부분의 쿠키 분류 기호
// A 기능, B 통계, D 정보 저장, E 콘텐츠 맞춤, F 광고, X 기타
const LEVELS = [
    { name: "필수만 허용", desc: "사이트가 돌아가는 데 필요한 것만", allow: [] },
    { name: "기능까지 허용", desc: "언어, 화면 설정 기억", allow: ["A"] },
    { name: "통계까지 허용", desc: "방문 집계에 협조", allow: ["A", "B"] },
    { name: "전부 허용", desc: "맞춤 광고 포함", allow: ["A", "B", "D", "E", "F", "X"] }
];
const STATUS_TEXT = { 2: "이 페이지: 쿠키 창 찾는 중", 3: "이 페이지: 처리 못 함", 4: "이 페이지: 쿠키 창 처리 완료", 5: "이 페이지: 거부 선택지가 없는 창이라 처리 안 함" };

function levelFromValues(v) {
    if (v.D || v.E || v.F || v.X) return 3;
    if (v.B) return 2;
    if (v.A) return 1;
    return 0;
}

function drawLevel(level) {
    document.querySelectorAll("#tiles .tile").forEach((t, i) => t.classList.toggle("on", i <= level));
    $("#lv").innerHTML = LEVELS[level].name + "<small>" + LEVELS[level].desc + "</small>";
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
        $("#host").textContent = "이 페이지";
        $("#hostSub").textContent = "여기서는 동작하지 않음";
        sw.disabled = true;
        $("#clearSite").disabled = true;
        return;
    }

    // 이 사이트 쿠키 지우기: 첫 번째 누름은 확인, 두 번째 누름에 삭제 후 새로 고침
    const clearButton = $("#clearSite");
    clearButton.addEventListener("click", async () => {
        if (!clearButton.classList.contains("ask")) {
            clearButton.classList.add("ask");
            clearButton.textContent = "한 번 더 누르면 삭제 (이 사이트에서 로그아웃됨)";
            return;
        }
        clearButton.disabled = true;
        clearButton.textContent = "지우는 중";
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
