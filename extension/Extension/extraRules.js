// 쿠키 도우미가 직접 추가한 규칙. 원본(Consent-O-Matic) 규칙 목록에 없는 동의 창을 여기에 넣음.
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

export default {
    "usercentrics_v3": usercentricsV3
};
