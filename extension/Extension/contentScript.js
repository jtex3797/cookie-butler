import GDPRConfig from "./GDPRConfig.js";
import ConsentEngine from "./ConsentEngine.js";
import extraRules, { patchRules } from "./extraRules.js";
import { startAutoconsent } from "./autoconsentBridge.js";
import { startNotice, endNotice } from "./notice.js";

// 허용 단계: 0 필수만, 1 기능까지, 2 통계까지, 3 전부 허용
function levelOf(v) {
    return (v.D || v.E || v.F || v.X) ? 3 : v.B ? 2 : v.A ? 1 : 0;
}

// 배경에 묻고 답을 기다림 (배경이 응답하지 않으면 undefined)
function ask(message) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                void chrome.runtime.lastError;
                resolve(response);
            });
        } catch (e) {
            resolve(undefined);
        }
    });
}

async function contentScriptRunner() {
    if (document.contentType!=="text/html") return;

    // 사이트 주소 확인 (iframe 안이면 탭의 주소를 배경에 물어봄)
    let url = location.href;
    if (window !== window.parent) {
        url = await ask("GetTabUrl");
    }
    let host;
    try {
        host = new URL(url).host;
    } catch (e) {
        return;
    }

    if (!(await GDPRConfig.isActive(host))) return;

    const consentTypes = await GDPRConfig.getConsentValues();
    const level = levelOf(consentTypes);
    // 탭 상태 표시는 맨 위 페이지만 보냄 (늦게 열리는 iframe이 처리 완료 표시를 지우지 않게)
    const isTop = window === window.parent;
    if (isTop) chrome.runtime.sendMessage("Searching");

    // 엔진 2개를 차례로 사용.
    // - autoconsent(DuckDuckGo): 규칙이 많지만 "전부 거부"와 "전부 허용"만 가능
    // - Consent-O-Matic: 규칙은 적지만 쿠키 종류별 선택 가능
    // 필수만/전부 허용이면 autoconsent 먼저, 기능까지/통계까지면 Consent-O-Matic 먼저.
    // 먼저 쓴 엔진이 쿠키 창을 못 찾으면 다른 엔진으로 한 번 더 찾음.
    const runAutoconsent = (onNothing) => startAutoconsent(onNothing);
    const runConsentOMatic = (onNothing) => startConsentOMatic(host, consentTypes, onNothing);
    const [first, second] = (level === 0 || level === 3)
        ? [runAutoconsent, runConsentOMatic]
        : [runConsentOMatic, runAutoconsent];

    first(async () => {
        // 같은 탭의 다른 프레임이 이미 쿠키 창을 찾았으면 여기서는 더 찾지 않음 (두 엔진이 같은 창을 동시에 누르는 일 방지)
        if (await ask("PopupSeen")) return;
        second(() => {
            if (isTop) chrome.runtime.sendMessage("NothingFound");
        });
    });
}

async function startConsentOMatic(host, consentTypes, onNothing) {
    const fetchedRules = await ask("GetRuleList");
    if (!fetchedRules) {
        console.log("Failed to connect with service worker for getRuleList msg", fetchedRules);
        onNothing();
        return;
    }

    fetchedRules.forEach((ruleObj)=>{
        delete ruleObj["$schema"];
    });

    // 묶음 안의 원본 규칙 + 직접 추가한 규칙
    let config = patchRules(Object.assign({}, ...fetchedRules, extraRules));

    const debugValues = await GDPRConfig.getDebugValues();
    const generalSettings = await GDPRConfig.getGeneralSettings();
    if(debugValues.debugLog) {
        console.log("FetchedRules:", fetchedRules);
    }

    ConsentEngine.debugValues = debugValues;
    ConsentEngine.generalSettings = generalSettings;
    ConsentEngine.topFrameUrl = host;

    let engine = new ConsentEngine(config, consentTypes, (evt)=>{
        if(evt.handled) {
            let result = {
                "handled": true,
                "cmp": evt.cmpName,
                "clicks": evt.clicks,
                "url": host
            };
            chrome.runtime.sendMessage("HandledCMP|"+JSON.stringify(result));
        } else if(evt.error) {
            chrome.runtime.sendMessage("CMPError");
        } else {
            onNothing();
        }
    });

    ConsentEngine.singleton = engine;

    if(debugValues.debugLog) {
        console.log("ConsentEngine loaded " + engine.cmps.length + " of " + Object.keys(config).length + " rules");
    }
}

// 모든 프레임: 배경이 "다시 확인"을 지시하면 Consent-O-Matic을 멈추고 autoconsent로 남은 창을 확인
chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "cookieHelperVerify") return;
    stopConsentOMatic();
    startAutoconsent(() => { /* 남은 창 없음 */ });
});

// 멈춰 있을 수 있는 Consent-O-Matic 엔진을 정리. 가려 둔 요소는 되돌려야 autoconsent가 창을 볼 수 있음
function stopConsentOMatic() {
    const engine = ConsentEngine.singleton;
    if (engine == null) return;
    try {
        engine.handledCallback = () => {};
        clearTimeout(engine.stopEngineId);
        clearInterval(engine.domScannerIntervalID);
        if (engine.queueId != null) clearTimeout(engine.queueId);
        engine.stopObserver();
        if (engine.currentCMP != null) {
            engine.currentCMP.stopObservers();
            engine.currentCMP.unHideAll();
        }
        // "처리 중"에 멈춘 알림은 내림. 결과 문구를 보여 주는 중이면 스스로 내려가게 둠
        if (engine.modal != null && !engine.modal.classList.contains("CookieHelper-Done")) {
            engine.hideProgressDialog();
        }
    } catch (e) { /* 정리 실패는 무시하고 확인을 계속함 */ }
}

// 맨 위 페이지만: 이 페이지가 불러온 주소 목록을 알려 줌 (쿠키 기록용)
if (window === window.parent) {
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
        // 배경이 보낸 작은 알림 지시 (autoconsent가 처리한 경우)
        if (message && message.type === "cookieHelperNotice") {
            if (message.phase === "start") startNotice(message.text);
            else endNotice(message.phase === "done" ? message.text : null);
            return;
        }
        if (message !== "GetHosts") return;
        const hosts = new Set([location.host]);
        try {
            for (const entry of performance.getEntriesByType("resource")) {
                try {
                    hosts.add(new URL(entry.name).host);
                } catch (e) { /* 주소가 아닌 항목 */ }
            }
        } catch (e) { /* 측정 기록을 못 읽는 페이지 */ }
        reply([...hosts].filter(Boolean).slice(0, 80));
    });
}

window.consentScrollBehaviours = {};
function getCalculatedStyles() {
    ["html","html body"].forEach(element=>{
        let node = document.querySelector(element);
        if (node) {
            let styles = window.getComputedStyle(node);
            window.consentScrollBehaviours[element+".consent-scrollbehaviour-override"] = ["position","overflow","overflow-y"].map(property=>{
                return {property:property, value:styles[property]}
            });
        }
    });
}

// Observe styles in order to temporarily restore them if a popup kills them
let topContentTag = document.querySelector("html");
if (topContentTag){
    let observer = new MutationObserver((mutations)=>{
        mutations.forEach((mutation)=>{
            mutation.addedNodes.forEach((node)=>{
                if(node.matches != null && node.matches("body")) {
                    getCalculatedStyles();
                    observer.disconnect();
                }
            })
        });
    });

    observer.observe(topContentTag, {
        childList: true
    });
}
window.addEventListener("message", (event)=>{
    try {
        if(event.data?.enforceScrollBehaviours != null) {
            ConsentEngine.enforceScrollBehaviours(event.data.enforceScrollBehaviours);
        }
    }catch(e) {
        console.error("Error inside message listener:", e);
    }
});

contentScriptRunner().catch((e)=>{
    console.error(e);
});
