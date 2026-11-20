// DuckDuckGo autoconsent(MPL-2.0)를 페이지 쪽에서 시작하는 부분.
// 설정과 규칙은 배경(background.js)이 내려 주고, 거부/허용 지시도 배경이 보냄.
import AutoConsent from "@duckduckgo/autoconsent";

// 배경에서 autoconsent로 오는 메시지 종류
const FROM_BACKGROUND = new Set(["initResp", "evalResp", "optOut", "optIn", "selfTest", "measurePerformance"]);
// 아직 찾는 중인 상태
const SEARCHING = new Set(["loading", "initialized", "waitingForInitResponse", "started"]);

let instance = null;
let gaveUp = false; // 못 찾은 것으로 보고 다른 엔진에 넘긴 뒤
let acted = false;  // 거부/허용 지시를 이미 한 번 넘긴 뒤

// onNothing: 쿠키 창을 못 찾았을 때 1번 호출
export function startAutoconsent(onNothing) {
    if (instance != null) return;

    instance = new AutoConsent((message) => {
        // 포기한 뒤 늦게 찾은 창은 알리지 않음 (다른 엔진과 같은 창을 동시에 누르지 않게)
        if (gaveUp) return;
        try {
            return chrome.runtime.sendMessage(message).catch(() => { /* 배경이 잠든 경우 */ });
        } catch (e) { /* 확장 프로그램이 새로 고침된 경우 */ }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message && FROM_BACKGROUND.has(message.type)) {
            if (message.type === "optOut" || message.type === "optIn") {
                // 규칙 여러 개가 같은 창을 찾으면 지시가 여러 번 올 수 있음. 처리는 1번만
                if (gaveUp || acted) return;
                acted = true;
            }
            instance.receiveMessageCallback(message);
        }
    });

    // 찾기가 끝났는지 0.2초마다 확인 (최대 20초)
    // "cmpDetected"는 동의 창 업체의 흔적은 있지만 창이 아직 안 보이는 상태.
    // autoconsent는 창이 뜨기를 약 5초(0.5초 x 10회) 기다린 뒤 상태를 바꾸지 않고 끝내므로,
    // 7초 넘게 이 상태면 창이 없는 것으로 봄 (이미 동의한 사이트가 흔한 경우)
    let tries = 0;
    let waitingForPopup = 0;
    const timer = setInterval(() => {
        const life = instance.state && instance.state.lifecycle;
        tries++;
        if (life === "cmpDetected") waitingForPopup++;
        if (life === "nothingDetected" || tries > 100 || waitingForPopup > 35) {
            clearInterval(timer);
            gaveUp = true;
            onNothing();
        } else if (life === "cmpDetected") {
            // 계속 기다림
        } else if (life && !SEARCHING.has(life)) {
            clearInterval(timer); // 창을 찾아서 처리로 넘어감
        }
    }, 200);
}
