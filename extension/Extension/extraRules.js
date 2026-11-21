// Cookie Butler가 직접 추가한 규칙. 원본(Consent-O-Matic) 규칙 목록에 없는 동의 창을 여기에 넣음.
// 형식은 원본 규칙과 같음. 같은 이름이 원본에 생기면 여기 것이 우선.

// usercentrics 새 버전(v3): 창이 <aside id="usercentrics-cmp-ui"> 안쪽의 분리된 영역에 들어 있음
// 확인: usercentrics.com (2026-11-21)
const UC = { selector: "#usercentrics-cmp-ui" };
const ucClick = (selector) => ({ type: "click", parent: UC, target: { selector } });
const ucSwitch = (category, type) => ({
    type,
    matcher: { type: "css", parent: UC, target: { selector: `#uc-category-${category}-toggle[aria-checked='true']` } },
    toggleAction: ucClick(`#uc-category-${category}-toggle`)
});

const usercentricsV3 = {
    detectors: [{
        presentMatcher: [{ type: "css", parent: UC, target: { selector: "#uc-main-dialog" } }],
        showingMatcher: [{ type: "css", parent: UC, target: { selector: "#uc-main-dialog", displayFilter: true } }]
    }],
    methods: [
        { name: "HIDE_CMP", action: { type: "hide", target: UC } },
        { name: "OPEN_OPTIONS" },
        {
            name: "DO_CONSENT",
            action: {
                // 전부 거부면 "거절", 전부 허용이면 "모두 수락", 그 사이면 설정을 열어 종류별로 맞춘 뒤 "저장"
                type: "ifallownone",
                trueAction: ucClick("#deny"),
                falseAction: {
                    type: "ifallowall",
                    trueAction: ucClick("#accept"),
                    falseAction: {
                        type: "list",
                        actions: [
                            ucClick("#uc-more-link"),
                            { type: "waitcss", parent: UC, target: { selector: "#uc-category-essential-toggle" }, retries: 40, waitTime: 50 },
                            { type: "consent", consents: [ucSwitch("functional", "A"), ucSwitch("marketing", "F")] },
                            ucClick("#save")
                        ]
                    }
                }
            }
        },
        { name: "SAVE_CONSENT" }
    ]
};

// cookieyes: 원본 규칙 목록에 없음
// 확인: cookieyes.com (2026-11-21)
const click = (selector) => ({ type: "click", target: { selector } });
const ckySwitch = (name, type) => ({
    type,
    matcher: { type: "checkbox", target: { selector: `#ckySwitch${name}` } },
    toggleAction: click(`#ckySwitch${name}`)
});

const cookieyes = {
    detectors: [{
        presentMatcher: [{ type: "css", target: { selector: ".cky-consent-container" } }],
        showingMatcher: [{ type: "css", target: { selector: ".cky-consent-container", displayFilter: true } }]
    }],
    methods: [
        {
            name: "HIDE_CMP",
            action: {
                type: "list",
                actions: [
                    { type: "hide", target: { selector: ".cky-consent-container" } },
                    { type: "hide", target: { selector: ".cky-modal" } },
                    { type: "hide", target: { selector: ".cky-overlay" } }
                ]
            }
        },
        { name: "OPEN_OPTIONS" },
        {
            name: "DO_CONSENT",
            action: {
                // 전부 거부면 "Reject All", 전부 허용이면 "Accept All", 그 사이면 설정에서 종류별로 맞춘 뒤 저장
                type: "ifallownone",
                trueAction: click(".cky-consent-container .cky-btn-reject"),
                falseAction: {
                    type: "ifallowall",
                    trueAction: click(".cky-consent-container .cky-btn-accept"),
                    falseAction: {
                        type: "list",
                        actions: [
                            click(".cky-consent-container .cky-btn-customize"),
                            { type: "waitcss", target: { selector: "#ckySwitchfunctional" }, retries: 40, waitTime: 50 },
                            { type: "wait", waitTime: 200 },
                            {
                                type: "consent",
                                consents: [
                                    ckySwitch("functional", "A"),
                                    ckySwitch("analytics", "B"),
                                    ckySwitch("performance", "B"),
                                    ckySwitch("advertisement", "F")
                                ]
                            },
                            click(".cky-modal .cky-btn-preferences")
                        ]
                    }
                }
            }
        },
        { name: "SAVE_CONSENT" }
    ]
};

export default {
    "usercentrics_v3": usercentricsV3,
    "cookieyes": cookieyes
};

// 원본 규칙을 통째로 바꾸지 않고 부족한 부분만 덧붙임 (원본이 갱신돼도 계속 따라감)
export function patchRules(config) {
    // sourcepoint: 원본 규칙이 설정 창을 열어 놓고 멈추고, 그 상태에서는 autoconsent도 닫지 못함
    // (확인: theguardian.com, 2026-11-21 시험). 이 종류는 Consent-O-Matic에서 빼고 autoconsent에 맡김.
    // 종류별 선택은 안 되고 전부 거부로 처리됨
    for (const name of Object.keys(config)) {
        if (/^sourcepoint/i.test(name)) delete config[name];
        // contentpass: "동의하거나 유료 구독" 창. 원본 규칙은 창이 남는데도 처리 완료로 알림
        // (확인: corriere.it). 빼 두면 "거부 선택지 없는 창"으로 표시됨
        if (/^contentpass/i.test(name)) delete config[name];
        // trustarc: 원본 규칙이 설정 창을 열어 놓고 "처리 완료"로 알림. 뒤이은 확인도 때에 따라 놓침
        // (확인: trustarc.com, 2026-11-21 사용자 화면). autoconsent에 맡김. 종류별 선택은 안 되고 전부 거부로 처리됨
        if (/^trustarc/i.test(name)) delete config[name];
        // gov.uk: 원본 규칙은 쿠키 설정 페이지로 이동해서 처리함. 도중에 멈추면 보던 페이지 대신
        // 설정 페이지에 남게 됨(확인: 2026-11-21 시험). autoconsent는 제자리에서 처리하므로 그쪽에 맡김
        if (/^gov\.uk/i.test(name)) delete config[name];
    }

    // didomi: 종류를 하나라도 고르지 않으면 "Save" 버튼이 눌리지 않음.
    // 원본은 이름을 아는 종류만 골라서, 모르는 종류가 있으면 저장을 못 하고 창이 남음.
    // 먼저 맨 위의 일괄 버튼으로 전부 고른 뒤 종류별 선택을 진행하게 함.
    // 확인: didomi.io (2026-11-21), 일괄 "Disagree" 클릭 후 Save 버튼 활성화
    try {
        const doConsent = config["didomi.io"].methods.find((m) => m.name === "DO_CONSENT");
        const list = doConsent.action.actions;
        const at = list.findIndex((a) => a.type === "waitcss");
        if (at >= 0 && !list.some((a) => a.cookieHelper)) {
            const bulk = (n) => ({
                type: "click",
                target: { selector: `.didomi-consent-popup-container-click-all .didomi-components-radio__option:nth-child(${n})` }
            });
            list.splice(at + 1, 0,
                { type: "ifallowall", cookieHelper: true, trueAction: bulk(2), falseAction: bulk(1) },
                { type: "wait", waitTime: 150 }
            );
        }
    } catch (e) { /* 원본에 해당 규칙이 없거나 모양이 바뀐 경우 건너뜀 */ }
    return config;
}
