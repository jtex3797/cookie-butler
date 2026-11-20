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
const STATUS_TEXT = { 2: "이 페이지: 쿠키 창 찾는 중", 3: "이 페이지: 처리 못 함", 4: "이 페이지: 쿠키 창 처리 완료" };

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
        return;
    }

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
