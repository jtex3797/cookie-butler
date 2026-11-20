import GDPRConfig from './GDPRConfig.js';
import { filterCompactRules, evalSnippets } from "@duckduckgo/autoconsent";

const STATUS = {
    "INIT": 0,
    "NOTHING": 1,
    "SEARCHING": 2,
    "ERROR": 3,
    "HANDLED": 4
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
            logVisit(hostOf(sender.tab.url), "fail", null);
            if(tabStatusMap.get(sender.tab.id) !== STATUS.HANDLED) {
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

            GDPRConfig.getStatistics().then((entries)=>{
                entries.clicks += json.clicks;
                
                if (!entries.cmps.hasOwnProperty(json.cmp)){
                    entries.cmps[json.cmp] = {
                        filledForms: 0,
                        clicks: 0
                    }
                }
                entries.cmps[json.cmp].filledForms ++;
                entries.cmps[json.cmp].clicks += json.clicks;

                GDPRConfig.setStatistics(entries);
            });

            logVisit(json.url, "ok", json.cmp);
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
// 같은 사이트의 같은 결과는 6시간 안에 1번만 기록 (쓰기는 차례대로 처리)
let visitQueue = Promise.resolve();
function logVisit(host, r, cmp) {
    if (!host) return;
    visitQueue = visitQueue.then(() => new Promise((resolve) => {
        chrome.storage.local.get({ visitLog: [], logEnabled: false }, ({ visitLog, logEnabled }) => {
            // 기록은 사용자가 기록 화면에서 켰을 때만 남김
            if (!logEnabled) return resolve();
            const now = Date.now();
            const dup = visitLog.some((e) => e.h === host && e.r === r && now - e.t < 6 * 3600 * 1000);
            if (dup) return resolve();
            visitLog.push({ h: host, t: now, r: r, c: cmp });
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

// 전부 허용 단계면 optIn, 그 밖에는 optOut
async function autoconsentAction() {
    const v = await GDPRConfig.getConsentValues();
    return (v.D || v.E || v.F || v.X) ? "optIn" : "optOut";
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
                rules = { autoconsent: (await loadRuleFile("autoconsent/rules.json")).autoconsent };
            } else {
                rules = {
                    autoconsent: [],
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
            notice(tabId, "start", "쿠키 창 처리 중");
            const { logEnabled } = await chrome.storage.local.get({ logEnabled: false });
            if (logEnabled) {
                try {
                    const list = await snapshotCookies(sender.tab);
                    pendingCookies.set(tabId, { h: site, t: Date.now(), before: list });
                } catch (e) { /* 쿠키를 읽을 수 없는 경우 기록만 건너뜀 */ }
            }
            sendToFrame(tabId, frameId, { type: await autoconsentAction() });
            break;
        }

        case "optOutResult":
        case "optInResult": {
            if (!message.result) {
                logVisit(site, "fail", message.cmp);
                notice(tabId, "cancel");
                if (tabStatusMap.get(tabId) !== STATUS.HANDLED) {
                    setBadgeCheckmark("✗", tabId);
                    tabStatusMap.set(tabId, STATUS.ERROR);
                }
            }
            break;
        }

        case "autoconsentDone": {
            setBadgeCheckmark("✔", tabId);
            tabStatusMap.set(tabId, STATUS.HANDLED);
            logVisit(site, "ok", message.cmp);
            chrome.storage.local.get({ handledLog: [] }, ({ handledLog }) => {
                handledLog.push({ t: Date.now() });
                chrome.storage.local.set({ handledLog: handledLog.slice(-300) });
            });
            scheduleAfterSnapshot(sender.tab, message.cmp);
            const action = await autoconsentAction();
            notice(tabId, "done", message.isCosmetic
                ? "쿠키 창 가림 (거부 버튼 없는 창)"
                : action === "optIn" ? "쿠키 창 닫음, 전부 허용" : "쿠키 창 닫음, 필수만 허용");
            break;
        }
    }
}
