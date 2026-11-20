import GDPRConfig from './GDPRConfig.js';

const STATUS = {
    "INIT": 0,
    "NOTHING": 1,
    "SEARCHING": 2,
    "ERROR": 3,
    "HANDLED": 4
}

chrome.runtime.onMessage.addListener(function (message, sender, reply) {
    console.log("Got msg", message);
    try {
    switch (message.split("|")[0]) {
        case "GetTabUrl": {
            reply(sender.tab.url);
            return false;
        }

        case "GetRuleList": {
            GDPRConfig.getDebugValues().then((debugValues)=>{
                fetchRules(debugValues.alwaysForceRulesUpdate).then((rules)=>{
                    reply(rules);
                });
            });
            //Return true to keep reply working after method has ended, async response
            return true;
        }

        case "GetCustomRuleList": {
            GDPRConfig.getCustomRuleLists().then((customRules)=>{
                reply(customRules);
            });
            //Return true to keep reply working after method has ended, async response
            return true;
        }

        case "AddCustomRule": {
            let newRule = JSON.parse(message.substring(message.indexOf("|")+1));

            GDPRConfig.getCustomRuleLists().then((customRules)=>{
                let combinedCustomRules = Object.assign({}, customRules, newRule);

                GDPRConfig.setCustomRuleLists(combinedCustomRules);
            });

            return false;
        }

        case "DeleteCustomRule": {
            let deleteRule = message.split("|")[1];

            GDPRConfig.getCustomRuleLists().then((customRules)=>{
                delete customRules[deleteRule];

                GDPRConfig.setCustomRuleLists(customRules).then(()=>{
                    reply();
                });
            });

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

            // 처리 기록 저장 (오늘 처리 건수 표시에 사용)
            chrome.storage.local.get({ handledLog: [] }, ({ handledLog }) => {
                handledLog.push({ h: json.url, t: Date.now(), c: json.cmp });
                chrome.storage.local.set({ handledLog: handledLog.slice(-300) });
            });
	    reply();
            return false;
        }

        case "CMPShowing": {
            // 동의 창을 처리하기 직전의 쿠키 상태 기록
            const tab = sender.tab;
            snapshotCookies(tab).then((list) => {
                pendingCookies.set(tab.id, { h: hostOf(tab.url), t: Date.now(), before: list });
                reply();
            }).catch(() => reply());
            return true;
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
        chrome.storage.local.get({ visitLog: [] }, ({ visitLog }) => {
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

function fetchRules(forceUpdate) {
    // Make sure the cached rule-lists are up-to-date, fetch updates if needed
    let maxStaleness = 22 * 3600 + (Math.random()*26*3600);  // Fetch frequency in seconds
    let rulePromise = new Promise((resolve, reject) => {
        GDPRConfig.getRuleLists().then((ruleLists) => {

            let oldDefaultListIndex = ruleLists.indexOf("https://raw.githubusercontent.com/cavi-au/Consent-O-Matic/master/Rules.json");

            if(oldDefaultListIndex !== -1) {
                console.log("Cleaning old rule list, and replacing with new reference based list...");
                ruleLists[oldDefaultListIndex] = "https://raw.githubusercontent.com/cavi-au/Consent-O-Matic/master/rules-list.json"
                GDPRConfig.setRuleLists(ruleLists);
            }

            chrome.storage.local.get({ cachedEntries: {} }, async function ({ cachedEntries: cachedEntries }) {
                let rules = [];
                for (let ruleList of ruleLists) {
                    let entry = cachedEntries[ruleList];

                    // Check for cache
                    if (!forceUpdate && (entry != null && 'timestamp' in entry && ((Date.now() / 1000) - entry.timestamp) < maxStaleness && 'rules' in entry)) {
                        rules.push(entry.rules);
                    } else {
                        // No cache, or to old, try to fetch
                        let theList = await fetchRulesList(ruleList);

                        if(theList != null) {
                            let storedEntry = {};
                            rules.push(theList);
                            cachedEntries[ruleList] = {
                                timestamp: Date.now() / 1000,
                                rules: theList
                            };
                        } else {
                            //Reuse cached entry even though its out of date at this point
                            console.log("Failed to fetch CoM rule list, check the URL", ruleList);
                            if(entry != null) {
                                rules.push(entry.rules);
                            } else {
                        	console.log("Giving up entirely on rule list, no cache available either",ruleList);
                            }
                        }
                    }
                }

                chrome.storage.local.set({
                    cachedEntries: cachedEntries
                }, () => {
                    resolve(rules);
                });
            });
        });
    });

    return rulePromise;

}

let tabStatusMap = new Map();

chrome.tabs.onUpdated.addListener((tabId, info, tab)=>{
    if(info.status != null && info.status === "Loading") {
        setBadgeCheckmark("", tabId);
        tabStatusMap.set(tabId, STATUS.INIT);
    }
});

async function fetchRulesList(ruleList) {
    try {

        let response = await fetch(ruleList, { cache: "no-store" });
        let theList = await response.json();

        let theMergedList = Object.assign({}, theList);
        delete theMergedList.references;

        //If references is present, fetch those and merge into big json object
        if(theList.references != null) {
            let promises = [];
            for(let ref of theList.references) {
                promises.push(fetchRulesList(ref));
            }

            let lists = await Promise.all(promises);

            lists.forEach((list) => {
                Object.assign(theMergedList, list);
            });
        }

        return theMergedList;

    } catch (e) {
        console.warn("Error fetching rulelist: ", ruleList, e.message);
    }

    return null;
}

