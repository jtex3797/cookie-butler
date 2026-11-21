// 화면 왼쪽 아래 작은 알림 (맨 위 페이지에서만 사용). 모양은 content.scss의 진행 표시 규칙을 그대로 씀.
let modal = null;
let timer = null;

function remove() {
    clearTimeout(timer);
    if (modal != null) {
        modal.remove();
        modal = null;
    }
}

// "쿠키 창 처리 중" 표시
export function startNotice(text) {
    if (document.body == null) return;
    remove();
    modal = document.createElement("div");
    modal.classList.add("ConsentOMatic-Progress-Dialog-Modal");
    const dialog = document.createElement("div");
    dialog.classList.add("ConsentOMatic-Progress-Dialog");
    const contents = document.createElement("p");
    contents.innerText = text;
    dialog.appendChild(contents);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    const shown = modal;
    setTimeout(() => shown.classList.add("ConsentOMatic-Progress-Started"), 0);
    // 끝났다는 소식이 안 오는 경우(중간 단계 규칙, 프레임 이동 등)에도 20초 뒤에는 내려감
    timer = setTimeout(() => endNotice(null), 20000);
}

// 결과 문구를 잠깐 보여 준 뒤 내려감. text가 없으면 바로 내려감.
// kind가 "info"면 체크 대신 느낌표 표시(처리하지 않은 경우)이고 조금 더 오래 보여 줌
export function endNotice(text, kind) {
    if (modal == null) {
        if (!text) return;
        startNotice(text);
        if (modal == null) return;
    }
    const shown = modal;
    clearTimeout(timer);
    if (text) {
        shown.querySelector("p").innerText = text;
        shown.classList.add(kind === "info" ? "CookieHelper-Info" : "CookieHelper-Done");
    }
    timer = setTimeout(() => {
        shown.classList.add("ConsentOMatic-Progress-Complete");
        timer = setTimeout(() => {
            shown.remove();
            if (modal === shown) modal = null;
        }, 500);
    }, !text ? 0 : kind === "info" ? 3500 : 2200);
}
