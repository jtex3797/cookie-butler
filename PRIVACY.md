# 쿠키 도우미 개인정보 처리 안내

최종 수정일: 2026-11-21

쿠키 도우미는 웹사이트의 쿠키 동의 창을 사용자가 정한 범위에 맞춰 대신 처리하는 브라우저 확장 프로그램입니다. 이 문서는 확장 프로그램이 어떤 정보를 다루는지 설명합니다.

## 요약

- 수집한 정보를 개발자나 제3자에게 보내지 않습니다. 모든 정보는 사용자의 브라우저 안에만 저장됩니다.
- 방문 기록에 해당하는 정보는 사용자가 기록 화면에서 "기록 남기기"를 직접 켰을 때만 저장합니다. 기본값은 꺼짐입니다.
- 쿠키의 값은 읽어서 저장하지 않습니다. 이름, 주소, 유효 기간만 저장합니다.
- 쿠키를 지우는 것은 사용자가 "이 사이트 쿠키 지우기" 버튼을 직접 눌렀을 때뿐입니다.
- 광고, 분석, 추적 도구를 포함하지 않습니다.

## 다루는 정보

### 항상 저장하는 정보 (브라우저 안)

- 쿠키 허용 범위 설정(필수만, 기능까지, 통계까지, 전부 허용). 브라우저의 동기화 기능을 켜 둔 경우 이 설정은 브라우저 계정을 통해 다른 기기와 동기화될 수 있습니다.
- 사용자가 확장 프로그램을 꺼 둔 사이트의 주소(이 브라우저에만 저장, 동기화하지 않음)
- 쿠키 창을 처리한 시각(오늘 처리한 개수를 보여 주는 데 사용, 사이트 주소는 포함하지 않음)

### "기록 남기기"를 켰을 때만 저장하는 정보 (브라우저 안)

- 쿠키 창을 처리했거나 처리하지 못한 사이트의 주소, 시각, 결과(처리 완료, 처리 못 함, 거부 선택지가 없어 처리하지 않음, 쿠키 창 없음), 동의 창 종류
- 그 사이트와 사이트가 불러온 주소에 저장된 쿠키의 이름, 주소, 외부 업체 여부, 유효 기간(동의 창 처리 직전과 처리 4초 뒤)

이 기록은 기록 화면에서 사용자에게 보여 주는 용도로만 사용합니다. 기록 화면의 "기록 삭제"로 언제든 지울 수 있고, "파일로 내보내기"를 누르면 사용자의 PC에 파일로 저장됩니다. 확장 프로그램을 제거하면 저장된 정보가 모두 삭제됩니다.

## 외부와의 통신

- 확장 프로그램은 스스로 외부 서버와 통신하지 않습니다. 쿠키 동의 창을 인식하는 규칙은 확장 프로그램 안에 들어 있습니다.

## 권한을 쓰는 이유

- 모든 사이트 접근: 쿠키 동의 창은 어느 사이트에서나 뜰 수 있어, 창을 찾아 대신 처리하려면 필요합니다. 지금 보고 있는 사이트의 주소를 확인해 사이트별 켜기/끄기와 처리 상태 표시를 제공하는 데에도 사용합니다.
- 저장소: 설정과 기록을 브라우저 안에 저장합니다.
- 스크립트 실행: 일부 쿠키 동의 창을 닫으려면 그 페이지가 제공하는 동의 기능을 호출해야 합니다. 확장 프로그램 안에 미리 들어 있는 정해진 함수만 실행합니다. "이 사이트 쿠키 지우기"를 눌렀을 때 그 사이트가 브라우저에 저장해 둔 값(localStorage, sessionStorage)을 비우는 데에도 사용합니다.
- 쿠키: "기록 남기기"를 켰을 때 처리 전후의 쿠키 이름과 유효 기간을 읽습니다. 사용자가 "이 사이트 쿠키 지우기"를 누르면 지금 보고 있는 사이트의 쿠키를 지웁니다. 쿠키를 만들거나 내용을 바꾸지 않습니다.

## 문의

이 안내에 대한 문의는 저장소의 이슈 게시판으로 보내 주세요.

---

# Cookie Helper Privacy Policy (English summary)

Last updated: 2026-11-21

Cookie Helper automatically answers cookie consent dialogs according to the level you choose.

- No data is sent to the developer or any third party. Everything is stored locally in your browser.
- Browsing-related records (site hostname, result, and cookie names, domains and lifetimes before and after a consent dialog is handled) are stored only if you turn on "Keep records" on the records page. It is off by default. Cookie values are never stored.
- You can delete the records at any time on the records page. Uninstalling the extension removes all stored data.
- Cookies are deleted only when you press "Clear this site's cookies" in the popup, and only for the site you are viewing.
- The extension makes no network requests of its own. Consent-dialog rules are bundled with the extension.
- No ads, analytics or tracking.
