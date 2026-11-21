// Cookie Butler가 직접 추가한 autoconsent 형식 규칙. autoconsent 규칙 묶음에 없는 동의 창을 여기에 넣음.
// 선택자를 배열로 쓰면 앞 요소의 분리된 영역(shadow DOM) 안에서 다음 선택자를 찾음.

// iubenda의 새 창: <tb-banner-wrapper> 안에 영역이 3겹으로 분리돼 있음
// tb-banner-wrapper > tb-banner-footer > tb-action-button(Reject, Accept 순) > button
// 확인: iubenda.com (2026-11-21). 기존 iubenda 창(#iubenda-cs-banner)은 autoconsent의 원래 규칙이 처리
const TB = ["tb-banner-wrapper", "tb-banner-footer"];
const tbButton = (host, button) => [...TB, host, button];
// 버튼 순서가 바뀐 경우에 대비해 첫째 칸에 없으면 둘째 칸에서 찾음
const tbClick = (button, first, second) => ({
    if: { exists: tbButton(first, button) },
    then: [{ click: tbButton(first, button) }],
    else: [{ click: tbButton(second, button) }]
});

const iubendaTb = {
    name: "iubenda-tb",
    prehideSelectors: ["tb-banner-wrapper"], // 뜨기 전에 미리 가려서 번쩍임을 없앰
    detectCmp: [{ exists: "tb-banner-wrapper" }],
    detectPopup: [{ visible: tbButton("tb-action-button", "button") }],
    optOut: [tbClick("button.reject-button", "tb-action-button", "tb-action-button:nth-of-type(2)")],
    optIn: [tbClick("button.accept-button", "tb-action-button:nth-of-type(2)", "tb-action-button")]
};

export default [iubendaTb];
