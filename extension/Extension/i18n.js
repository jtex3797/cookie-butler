// 화면 문구. 문구 본문은 _locales/<언어>/messages.json, 브라우저 언어가 ko면 한국어, 그 밖은 영어
export function t(key, subs) {
    try {
        const m = chrome.i18n.getMessage(key, subs);
        if (m) return m;
    } catch (e) { /* 확장 프로그램 밖에서 연 미리 보기 */ }
    return key;
}

// data-i18n(글자), data-i18n-aria(aria-label), data-i18n-ph(placeholder)가 붙은 요소를 채움.
// 문구를 못 찾으면 HTML에 적힌 한국어를 그대로 둠
export function applyI18n() {
    const has = (key) => {
        try { return chrome.i18n.getMessage(key) || null; } catch (e) { return null; }
    };
    for (const el of document.querySelectorAll("[data-i18n]")) {
        const m = has(el.dataset.i18n);
        if (m) el.textContent = m;
    }
    for (const el of document.querySelectorAll("[data-i18n-aria]")) {
        const m = has(el.dataset.i18nAria);
        if (m) el.setAttribute("aria-label", m);
    }
    for (const el of document.querySelectorAll("[data-i18n-ph]")) {
        const m = has(el.dataset.i18nPh);
        if (m) el.setAttribute("placeholder", m);
    }
    const lang = has("@@ui_locale");
    if (lang) document.documentElement.lang = lang.split("_")[0];
}
