import GDPRConfig from "./GDPRConfig.js";
import ConsentEngine from "./ConsentEngine.js";
import extraRules, { patchRules } from "./extraRules.js";

async function contentScriptRunner() {
    if (document.contentType!=="text/html") return;

    // Figure out the URL
    let url = location.href;
    let insideIframe = window !== window.parent;
    if(insideIframe) {
        //We are inside an iframe, request the actual tab url to check if we are active
        url = await new Promise((resolve, reject)=>{
            chrome.runtime.sendMessage("GetTabUrl", (response)=>{
                resolve(response);
            });
        });
    }
    const urlObj = new URL(url);
    url = urlObj.host;

    GDPRConfig.isActive(url).then(async (active) => {
        if (active) {
            chrome.runtime.sendMessage("GetRuleList", (fetchedRules)=>{
                if (!fetchedRules) {
                    console.log("Failed to connect with service worker for getRuleList msg", fetchedRules);
                } else {
                    GDPRConfig.getCustomRuleLists().then((customRules)=>{
                        fetchedRules.forEach((ruleObj)=>{
                            delete ruleObj["$schema"];
                        });
                        delete customRules["$schema"];
        
                        // Concat rule-lists to engine config in order
                        let config = patchRules(Object.assign({}, ...fetchedRules, extraRules, customRules));
        
                        GDPRConfig.getConsentValues().then((consentTypes)=>{
                            GDPRConfig.getDebugValues().then((debugValues)=>{
                                GDPRConfig.getGeneralSettings().then((generalSettings)=>{
                                    if(debugValues.debugLog) {
                                        console.log("FetchedRules:", fetchedRules);
                                        console.log("CustomRules:", customRules);
                                    }
                    
                                    ConsentEngine.debugValues = debugValues;
                                    ConsentEngine.generalSettings = generalSettings;
                                    ConsentEngine.topFrameUrl = url;
            
                                    chrome.runtime.sendMessage("Searching");
                                    let engine = new ConsentEngine(config, consentTypes, (evt)=>{
                                        let result = {
                                            "handled": evt.handled
                                        };
    
                                        if(evt.handled) {
                                            result.cmp = evt.cmpName;
                                            result.clicks = evt.clicks;
                                            result.url = url;
        
                                            chrome.runtime.sendMessage("HandledCMP|"+JSON.stringify(result));
                                        } else if(evt.error) {
                                            chrome.runtime.sendMessage("CMPError");
                                        } else {
                                            chrome.runtime.sendMessage("NothingFound");
                                        }
                                    });
            
                                    ConsentEngine.singleton = engine;
            
                                    if(debugValues.debugLog) {
                                        console.log("ConsentEngine loaded " + engine.cmps.length + " of " + Object.keys(config).length + " rules");
                                    }
                                });
                            });
                        });
                    });
                }
            });
        }
    });
}

// 맨 위 페이지만: 이 페이지가 불러온 주소 목록을 알려 줌 (쿠키 기록용)
if (window === window.parent) {
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
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
