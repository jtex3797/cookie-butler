import GDPRConfig from './GDPRConfig.js';
import { filterCompactRules, evalSnippets } from "@duckduckgo/autoconsent";
import extraAutoconsentRules from "./extraAutoconsentRules.js";

const STATUS = {
    "INIT": 0,
    "NOTHING": 1,
    "SEARCHING": 2,
    "ERROR": 3,
    "HANDLED": 4,
    "WALL": 5 // 거부 선택지가 없는 창(동의 또는 유료 구독)이라 처리하지 않음
}

chrome.runtime.onMessage.addListener(function (message, sender, reply) {
    // autoconsent가 보내는 메시지는 객체 형태
    if (message && typeof message === "object" && typeof message.type === "string") {
        handleAutoconsent(message, sender).catch((e) => console.log("autoconsent 처리 실패:", e));
        return false;
    }
    try {
    switch (message.split("|")[0]) {
        case "GetTabUrl": {
            reply(sender.tab.url);
            return false;
        }

        case "GetRuleList": {
            // Consent-O-Matic 규칙은 묶음 안의 파일을 사용 (외부에서 받지 않음)
            loadRuleFile("consentomatic/rules.json").then((rules) => reply([rules])).catch(() => reply(null));
            //Return true to keep reply working after method has ended, async response
            return true;
        }

        case "CMPError": {
            scheduleVerify(sender.tab.id, 1500);
            if(tabStatusMap.get(sender.tab.id) !== STATUS.HANDLED && !wasJustOk(hostOf(sender.tab.url))) {
                logVisit(hostOf(sender.tab.url), "fail", null, "com");
                setBadgeCheckmark("\u2717", sender.tab.id);
                tabStatusMap.set(sender.tab.id, STATUS.ERROR);
            }
	    reply();
            return false;
        }

        case "NothingFound": {
            if(tabStatusMap.get(sender.tab.id) !== STATUS.HANDLED) {
                logVisit(hostOf(sender.tab.url), "none", null);
                setBadgeCheckmark("", sender.tab.id);
                tabStatusMap.set(sender.tab.id, STATUS.NOTHING);
            }
	    reply();
            return false;
        }

        case "Searching": {
            if(tabStatusMap.get(sender.tab.id) !== STATUS.HANDLED) {
                setBadgeCheckmark("\uD83D\uDD0E", sender.tab.id);
                tabStatusMap.set(sender.tab.id, STATUS.SEARCHING);
            }
	    reply();
            return false;
        }

        case "HandledCMP": {
            let json = JSON.parse(message.split("|")[1]);

            setBadgeCheckmark("\u2714", sender.tab.id);

            tabStatusMap.set(sender.tab.id, STATUS.HANDLED);


            markOk(json.url);
            logVisit(json.url, "ok", json.cmp, "com");
            scheduleVerify(sender.tab.id, 1500);
            scheduleAfterSnapshot(sender.tab, json.cmp);

            // 처리 시각만 저장 (오늘 처리 건수 표시에 사용, 사이트 주소는 넣지 않음)
            chrome.storage.local.get({ handledLog: [] }, ({ handledLog }) => {
                handledLog.push({ t: Date.now() });
                chrome.storage.local.set({ handledLog: handledLog.slice(-300) });
            });
	    reply();
            return false;
        }

        case "CMPShowing": {
            // 동의 창을 처리하기 직전의 쿠키 상태 기록
            const tab = sender.tab;
            popupSeenTabs.add(tab.id);
            comTabs.add(tab.id);
            scheduleVerify(tab.id, 12000); // 12초 안에 끝났다는 소식이 없으면 멈춘 것으로 보고 확인
            chrome.storage.local.get({ logEnabled: false }, ({ logEnabled }) => {
                // 기록을 켜지 않았으면 쿠키를 읽지 않음
                if (!logEnabled) return reply();
                snapshotCookies(tab).then((list) => {
                    pendingCookies.set(tab.id, { h: hostOf(tab.url), t: Date.now(), before: list });
                    reply();
                }).catch(() => reply());
            });
            return true;
        }

        case "ConsentWall": {
            // 두 엔진 모두 못 찾았고, 화면에 거부 선택지 없는 동의 창이 보이는 경우
            const tabId = sender.tab.id;
            // 같은 탭에서 이미 알렸으면(4초 뒤 먼저 알림, 엔진이 끝난 뒤 다시 확인) 한 번만 표시
            if (tabStatusMap.get(tabId) !== STATUS.HANDLED && tabStatusMap.get(tabId) !== STATUS.WALL) {
                setBadgeCheckmark("!", tabId);
                tabStatusMap.set(tabId, STATUS.WALL);
                logVisit(hostOf(sender.tab.url), "wall", null, null);
                notice(tabId, "info", "거부 선택지가 없는 창이라 처리하지 않음");
            }
            reply();
            return false;
        }

        case "PopupSeen": {
            reply(sender.tab ? popupSeenTabs.has(sender.tab.id) : false);
            return false;
        }

        case "GetStatus": {
            reply(tabStatusMap.get(Number(message.split("|")[1])));
            return false;
        }

        default:
            console.warn("Unhandled message:", message);
    }
    } catch (ex){
	console.log(ex);
    }
});

// 사이트별 처리 결과 기록. r: "ok" 처리 완료, "fail" 처리 못 함, "none" 쿠키 창 못 찾음
// engine: 처리한 엔진. "ac" autoconsent, "com" Consent-O-Matic, 못 찾은 경우는 없음
// 같은 사이트의 같은 결과는 6시간 안에 1번만 기록 (쓰기는 차례대로 처리)
// 방금(2분 안에) 처리에 성공한 사이트. 동의를 저장하면서 페이지를 새로 고치는 사이트는
// 새로 뜬 페이지의 "저장했습니다" 안내를 쿠키 창으로 다시 알아보고 실패로 알리는 일이 있어, 그 실패는 무시함
// (확인: gov.uk, termly.io, 2026-11-21 시험)
const recentOk = new Map();
function markOk(host) {
    if (host) recentOk.set(host, Date.now());
}
function wasJustOk(host) {
    const t = recentOk.get(host);
    return t != null && Date.now() - t < 120000;
}

let visitQueue = Promise.resolve();
function logVisit(host, r, cmp, engine) {
    if (!host) return;
    visitQueue = visitQueue.then(() => new Promise((resolve) => {
        chrome.storage.local.get({ visitLog: [], logEnabled: false }, ({ visitLog, logEnabled }) => {
            // 기록은 사용자가 기록 화면에서 켰을 때만 남김
            if (!logEnabled) return resolve();
            const now = Date.now();
            const dup = visitLog.find((e) => e.h === host && e.r === r && now - e.t < 6 * 3600 * 1000);
            if (dup) {
                // 같은 결과를 다른 엔진이 다시 낸 경우(확인 뒤 넘겨받음) 엔진 표시만 갱신
                if (engine && dup.e !== engine) {
                    dup.e = engine;
                    dup.c = cmp;
                    chrome.storage.local.set({ visitLog: visitLog }, resolve);
                    return;
                }
                return resolve();
            }
            visitLog.push({ h: host, t: now, r: r, c: cmp, e: engine || null });
            chrome.storage.local.set({ visitLog: visitLog.slice(-2000) }, resolve);
        });
    }));
}

// ---- 처리 전후 쿠키 기록 ----
// 쿠키 값은 저장하지 않고 이름, 주소, 유효 기간만 저장
let pendingCookies = new Map();

// 페이지가 불러온 주소 목록을 페이지 쪽에 물어봄
function askHosts(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, "GetHosts", { frameId: 0 }, (hosts) => {
                if (chrome.runtime.lastError || !Array.isArray(hosts)) resolve([]);
                else resolve(hosts);
            });
        } catch (e) {
            resolve([]);
        }
    });
}

// 사이트 자신의 쿠키인지 외부 업체 쿠키인지 (주소 끝부분 비교, 대략적인 판정)
function isExternal(site, domain) {
    const s = site.replace(/^www\./, "");
    return !(s === domain || s.endsWith("." + domain) || domain.endsWith("." + s));
}

async function snapshotCookies(tab) {
    const site = hostOf(tab.url);
    if (!site || !chrome.cookies) return [];
    const hosts = new Set([site, ...(await askHosts(tab.id))]);
    const seen = new Map();
    for (const host of [...hosts].slice(0, 80)) {
        let cookies = [];
        try {
            cookies = await chrome.cookies.getAll({ url: "https://" + host + "/" });
        } catch (e) { /* 읽을 수 없는 주소는 건너뜀 */ }
        for (const c of cookies) {
            const d = c.domain.replace(/^\./, "");
            const key = c.name + "|" + d + "|" + c.path;
            if (seen.has(key)) continue;
            seen.set(key, {
                n: c.name,
                d: d,
                x: isExternal(site, d),
                // 남은 유효 기간(일). 0은 브라우저를 닫으면 사라지는 쿠키
                e: c.session ? 0 : Math.max(1, Math.round((c.expirationDate - Date.now() / 1000) / 86400))
            });
        }
    }
    return [...seen.values()].slice(0, 200);
}

// 처리 4초 뒤 다시 읽어서 새로 생긴 쿠키만 골라 저장
function scheduleAfterSnapshot(tab, cmp) {
    const pending = pendingCookies.get(tab.id);
    if (!pending) return;
    pendingCookies.delete(tab.id);
    setTimeout(async () => {
        let after = [];
        try {
            after = await snapshotCookies(tab);
        } catch (e) { /* 탭이 닫힌 경우 */ }
        const key = (c) => c.n + "|" + c.d;
        const had = new Set(pending.before.map(key));
        const added = after.filter((c) => !had.has(key(c)));
        const v = await GDPRConfig.getConsentValues();
        const level = (v.D || v.E || v.F || v.X) ? 3 : v.B ? 2 : v.A ? 1 : 0;
        chrome.storage.local.get({ cookieLog: [] }, ({ cookieLog }) => {
            cookieLog.push({ h: pending.h, t: pending.t, c: cmp, lv: level, before: pending.before, after: added });
            chrome.storage.local.set({ cookieLog: cookieLog.slice(-150) });
        });
    }, 4000);
}

function hostOf(url) {
    try {
        return new URL(url).host;
    } catch (e) {
        return "";
    }
}

function setBadgeCheckmark(text, id) {
    const api = chrome.action || chrome.browserAction;
    if (!api) return;
    api.setBadgeText({ text: text, tabId: id });
    api.setBadgeBackgroundColor({ color: "#e8500a", tabId: id });
}

let tabStatusMap = new Map();

chrome.tabs.onUpdated.addListener((tabId, info, tab)=>{
    // 원본은 "Loading"과 비교해 한 번도 맞지 않았음. Chrome이 주는 값은 소문자 "loading"
    if(info.status != null && info.status === "loading") {
        popupSeenTabs.delete(tabId);
        comTabs.delete(tabId);
        waitingPopups.delete(tabId);
        setBadgeCheckmark("", tabId);
        tabStatusMap.set(tabId, STATUS.INIT);
    }
});

// ---- DuckDuckGo autoconsent 연결 ----
// 이 탭에서 쿠키 창을 찾은 적이 있는지 (두 엔진이 같은 창을 동시에 다루지 않게 하는 데 사용)
const popupSeenTabs = new Set();

// 추정으로 버튼을 고르는 기능(heuristic)은 엉뚱한 버튼을 누를 위험이 있어 끔.
// autoAction을 비워 두면 창을 찾은 뒤 배경의 지시를 기다림 (그 사이에 처리 전 쿠키를 기록)
const AUTOCONSENT_CONFIG = {
    enabled: true,
    autoAction: null,
    disabledCmps: [],
    enablePrehide: true,
    enableCosmeticRules: true,
    enableGeneratedRules: true,
    detectRetries: 20,
    isMainWorld: false,
    prehideTimeout: 2000,
    enableHeuristicDetection: false,
    enablePopupMutationObserver: false,
    visualTest: false,
    logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false },
    performanceLoggingEnabled: false,
    heuristicMode: "off"
};

// 묶음에 들어 있는 규칙 파일. 배경이 깨어 있는 동안만 기억
const ruleFiles = {};
function loadRuleFile(name) {
    if (!ruleFiles[name]) {
        ruleFiles[name] = fetch(chrome.runtime.getURL(name)).then((res) => res.json());
    }
    return ruleFiles[name];
}

// 허용 단계: 0 필수만, 1 기능까지, 2 통계까지, 3 전부 허용
async function currentLevel() {
    const v = await GDPRConfig.getConsentValues();
    return (v.D || v.E || v.F || v.X) ? 3 : v.B ? 2 : v.A ? 1 : 0;
}

// 전부 허용 단계면 optIn, 그 밖에는 optOut
async function autoconsentAction() {
    return (await currentLevel()) === 3 ? "optIn" : "optOut";
}

// 종류별 선택(기능까지, 통계까지)은 Consent-O-Matic이 먼저 처리함.
// 이 엔진은 설정 창을 열어 놓고 멈추거나, 창이 남았는데 끝났다고 알리는 경우가 있어서,
// 처리가 끝난 뒤(또는 멈춘 것으로 보일 때) 탭의 모든 프레임에 "찾아 둔 창이 아직 떠 있는지" 물어봄.
// 떠 있다고 답한 프레임이 있으면 autoconsent가 이어받고, 잘 끝난 사이트에서는 아무 일도 하지 않음
const verifyTimers = new Map();
function scheduleVerify(tabId, delay) {
    clearTimeout(verifyTimers.get(tabId));
    verifyTimers.set(tabId, setTimeout(async () => {
        verifyTimers.delete(tabId);
        const level = await currentLevel();
        if (level !== 1 && level !== 2) return;
        try {
            chrome.tabs.sendMessage(tabId, { type: "cookieHelperRecheck" }, () => void chrome.runtime.lastError);
        } catch (e) { /* 탭이 닫힌 경우 */ }
    }, delay));
}

function sendToFrame(tabId, frameId, message) {
    try {
        chrome.tabs.sendMessage(tabId, message, { frameId: frameId }, () => void chrome.runtime.lastError);
    } catch (e) { /* 탭이 닫힌 경우 */ }
}

// 작은 알림은 맨 위 페이지에 표시
function notice(tabId, phase, text) {
    sendToFrame(tabId, 0, { type: "cookieHelperNotice", phase: phase, text: text });
}

// Consent-O-Matic이 처리를 시작한 탭, autoconsent가 창을 찾아 두고 지시를 기다리는 프레임(탭 -> 프레임)
const comTabs = new Set();
const waitingPopups = new Map();

// autoconsent에 처리를 맡김: Consent-O-Matic을 멈추고, 알림을 띄우고, 처리 전 쿠키를 기록한 뒤 지시를 보냄
async function goAutoconsent(tab, frameId) {
    const tabId = tab.id;
    waitingPopups.delete(tabId);
    try {
        chrome.tabs.sendMessage(tabId, { type: "cookieHelperStopCom" }, () => void chrome.runtime.lastError);
    } catch (e) { /* 탭이 닫힌 경우 */ }
    notice(tabId, "start", "쿠키 창 처리 중");
    const { logEnabled } = await chrome.storage.local.get({ logEnabled: false });
    if (logEnabled) {
        try {
            const list = await snapshotCookies(tab);
            pendingCookies.set(tabId, { h: hostOf(tab.url), t: Date.now(), before: list });
        } catch (e) { /* 쿠키를 읽을 수 없는 경우 기록만 건너뜀 */ }
    }
    sendToFrame(tabId, frameId, { type: await autoconsentAction() });
}

async function handleAutoconsent(message, sender) {
    if (!sender.tab) return;
    const tabId = sender.tab.id;
    const frameId = sender.frameId;
    const site = hostOf(sender.tab.url);

    switch (message.type) {
        case "init": {
            let rules;
            if ((await autoconsentAction()) === "optIn") {
                // 허용 쪽 규칙은 전체 규칙 파일에만 있음
                rules = { autoconsent: [...(await loadRuleFile("autoconsent/rules.json")).autoconsent, ...extraAutoconsentRules] };
            } else {
                rules = {
                    autoconsent: extraAutoconsentRules,
                    compact: filterCompactRules(await loadRuleFile("autoconsent/compact-rules.json"), {
                        url: sender.url || sender.tab.url,
                        mainFrame: frameId === 0
                    })
                };
            }
            sendToFrame(tabId, frameId, { type: "initResp", rules: rules, config: AUTOCONSENT_CONFIG });
            break;
        }

        case "eval": {
            // 일부 규칙은 페이지 쪽 코드 실행이 필요. 묶음 안에 미리 들어 있는 함수만 실행
            let result = false;
            try {
                const snippet = message.snippetId && evalSnippets[message.snippetId];
                if (snippet) {
                    const [res] = await chrome.scripting.executeScript({
                        target: { tabId: tabId, frameIds: [frameId] },
                        world: "MAIN",
                        func: snippet
                    });
                    result = res ? res.result : false;
                }
            } catch (e) { /* 실행할 수 없는 페이지 */ }
            sendToFrame(tabId, frameId, { type: "evalResp", id: message.id, result: result });
            break;
        }

        case "popupFound": {
            popupSeenTabs.add(tabId);
            const level = await currentLevel();
            if (level === 1 || level === 2) {
                // 종류별 선택 단계: Consent-O-Matic이 이 창을 맡는지 1.2초 지켜봄.
                // 맡으면 끝난 뒤 다시 확인하고, 안 맡으면 autoconsent가 전부 거부로 처리
                waitingPopups.set(tabId, frameId);
                if (!comTabs.has(tabId)) {
                    setTimeout(() => {
                        if (!comTabs.has(tabId) && waitingPopups.get(tabId) === frameId) goAutoconsent(sender.tab, frameId);
                    }, 1200);
                }
                break;
            }
            await goAutoconsent(sender.tab, frameId);
            break;
        }

        case "cookieHelperRecheckResult": {
            // Consent-O-Matic 처리 뒤에도 창이 떠 있으면 autoconsent가 이어받음
            if (message.open) await goAutoconsent(sender.tab, frameId);
            else waitingPopups.delete(tabId);
            break;
        }

        case "optOutResult":
        case "optInResult": {
            if (!message.result) {
                notice(tabId, "cancel");
                // 다른 엔진이 이미 처리를 끝낸 탭에서 확인만 하다 실패한 경우는 실패로 기록하지 않음
                if (tabStatusMap.get(tabId) !== STATUS.HANDLED && !wasJustOk(site)) {
                    logVisit(site, "fail", message.cmp, "ac");
                    setBadgeCheckmark("✗", tabId);
                    tabStatusMap.set(tabId, STATUS.ERROR);
                }
            }
            break;
        }

        case "autoconsentDone": {
            setBadgeCheckmark("✔", tabId);
            tabStatusMap.set(tabId, STATUS.HANDLED);
            markOk(site);
            logVisit(site, "ok", message.cmp, "ac");
            chrome.storage.local.get({ handledLog: [] }, ({ handledLog }) => {
                handledLog.push({ t: Date.now() });
                chrome.storage.local.set({ handledLog: handledLog.slice(-300) });
            });
            scheduleAfterSnapshot(sender.tab, message.cmp);
            const level = await currentLevel();
            notice(tabId, "done", message.isCosmetic
                ? "쿠키 창 가림 (거부 버튼 없는 창)"
                : level === 3 ? "쿠키 창 닫음, 전부 허용"
                : level === 0 ? "쿠키 창 닫음, 필수만 허용"
                : "쿠키 창 닫음, 필수만 허용 (종류별 선택이 안 되는 창)");
            break;
        }
    }
}
