// DuckDuckGo autoconsent(MPL-2.0)를 페이지 쪽에서 시작하는 부분.
// 설정과 규칙은 배경(background.js)이 내려 주고, 거부/허용 지시도 배경이 보냄.
import AutoConsent from "@duckduckgo/autoconsent";

// 배경에서 autoconsent로 오는 메시지 종류
const FROM_BACKGROUND = new Set(["initResp", "evalResp", "optOut", "optIn", "selfTest", "measurePerformance"]);
// 아직 찾는 중인 상태
const SEARCHING = new Set(["loading", "initialized", "waitingForInitResponse", "started"]);

let instance = null;

// onNothing: 쿠키 창을 못 찾았을 때 1번 호출
export function startAutoconsent(onNothing) {
    if (instance != null) return;

    instance = new AutoConsent((message) => {
        try {
            return chrome.runtime.sendMessage(message).catch(() => { /* 배경이 잠든 경우 */ });
        } catch (e) { /* 확장 프로그램이 새로 고침된 경우 */ }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message && FROM_BACKGROUND.has(message.type)) {
            instance.receiveMessageCallback(message);
        }
    });

    // 찾기가 끝났는지 0.2초마다 확인 (최대 20초)
    let tries = 0;
    const timer = setInterval(() => {
        const life = instance.state && instance.state.lifecycle;
        tries++;
        if (life === "nothingDetected" || tries > 100) {
            clearInterval(timer);
            onNothing();
        } else if (life && !SEARCHING.has(life)) {
            clearInterval(timer); // 창을 찾아서 처리로 넘어감
        }
    }, 200);
}
