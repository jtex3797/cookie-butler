# 쿠키 도우미 설계와 남은 계획

작성일: 2026-11-21. 대상 폴더: `D:\CodeWorkspace\my-project\cookie-helper`

## 1. 목적

- 웹사이트의 쿠키 동의 창을 사용자가 정한 허용 범위(4단계)에 맞춰 자동 처리하는 Chrome, Edge 확장 프로그램(Manifest V3)
- 일반 사용자 대상, 한국어 화면, Chrome 웹 스토어와 Edge Add-ons 등록 예정
- 부가 기능: 사이트별 처리 결과와 동의 전후 쿠키 기록(사용자가 켠 경우만, 브라우저 안 저장)

## 2. 현재 설계 (구현 완료, 일부 미검증)

### 2.1 구성

| 파일 | 역할 |
|---|---|
| `extension/Extension/contentScript.js` | 모든 프레임에서 실행. 허용 단계를 읽어 엔진 2개를 차례로 시작 |
| `extension/Extension/autoconsentBridge.js` | DuckDuckGo autoconsent(`@duckduckgo/autoconsent` 18.9.0, MPL-2.0) 인스턴스 생성과 메시지 연결 |
| `extension/Extension/ConsentEngine.js`, `CMP.js`, `Action.js`, `Matcher.js`, `Tools.js`, `Consent.js`, `Detector.js` | Consent-O-Matic(MIT) 엔진. 일부 수정 |
| `extension/Extension/extraRules.js` | 직접 추가한 Consent-O-Matic 형식 규칙(usercentrics_v3, cookieyes)과 원본 규칙 덧붙임(`patchRules`, didomi) |
| `extension/Extension/background.js` | 서비스 워커. 규칙 목록 받기, 상태 표시, 기록 저장, autoconsent 메시지 처리 |
| `extension/Extension/notice.js`, `content.scss` | 왼쪽 아래 작은 알림, 쿠키 창이 작아지며 사라지는 움직임 |
| `extension/Extension/popup.html`, `popup.js` | 작은 창: 드래그바와 쿠키 종류 4칸, 사이트별 스위치, 오늘 처리 건수, 기록 보기 버튼 |
| `extension/Extension/log.html`, `log.js` | 기록 화면: 기록 남기기 스위치, 사이트별 결과, 전후 쿠키, 내보내기, 삭제 |
| `extension/Extension/GDPRConfig.js` | 설정 저장(`chrome.storage.sync`: 허용 범위만 / `chrome.storage.local`: 꺼 둔 사이트, 기록) |

### 2.2 허용 단계와 엔진 순서

- 단계: 0 필수만, 1 기능까지(A), 2 통계까지(A, B), 3 전부 허용(A, B, D, E, F, X). 저장 형식은 Consent-O-Matic의 `consentValues`
- 단계 0과 3: autoconsent 먼저(optOut 또는 optIn), 못 찾으면 Consent-O-Matic
- 단계 1과 2: Consent-O-Matic 먼저(종류별 선택), 못 찾으면 autoconsent optOut
- "못 찾음" 판정
  - autoconsent: `instance.state.lifecycle`을 0.2초 간격으로 확인. `nothingDetected`이거나, `cmpDetected`(업체 흔적은 있으나 창이 안 보임) 상태가 7초(35회)를 넘거나, 전체 100회(20초)를 넘으면 못 찾은 것으로 처리. autoconsent는 창이 뜨기를 약 5초 기다린 뒤 상태를 바꾸지 않고 끝내기 때문
  - Consent-O-Matic: 엔진이 5초 동안 못 찾으면 콜백에서 handled, error 모두 아닌 경우
- 두 엔진 중복 방지 1: Consent-O-Matic의 5초 정지 타이머는 창이 뜨는지 확인하는 중(`checkRunning`)이면 다시 걸고 끝냄. autoconsent 쪽은 못 찾은 것으로 넘긴 뒤(`gaveUp`)에는 배경과 메시지를 주고받지 않고, `optOut`/`optIn` 지시는 프레임당 1번만 받음
- 탭 상태 메시지(`Searching`, `NothingFound`)는 맨 위 페이지만 보냄
- 두 엔진 중복 방지 2: 두 번째 엔진을 시작하기 전에 배경에 `PopupSeen`을 물어, 같은 탭의 어느 프레임이든 쿠키 창을 찾은 적이 있으면 시작하지 않음. 배경의 `popupSeenTabs`는 autoconsent `popupFound`와 Consent-O-Matic `CMPShowing`에서 추가, 탭이 `loading` 상태가 되면 제거

### 2.3 autoconsent 연결

- 페이지 쪽은 설정 없이 인스턴스를 만들어 `init` 메시지를 보내고, 배경이 `initResp`로 설정과 규칙을 내려 줌
- 설정: `autoAction: null`(창을 찾으면 배경 지시를 기다림), `enablePrehide: true`, `enableCosmeticRules: true`, 추정 인식(`heuristicMode: "off"`, `enableHeuristicDetection: false`)과 `enablePopupMutationObserver`는 끔
- 규칙: 빌드 때 `node_modules/@duckduckgo/autoconsent/rules/`의 `compact-rules.json`, `rules.json`을 `build/autoconsent/`로 복사. optOut이면 `filterCompactRules`로 걸러 보냄, optIn이면 `rules.json` 전체(약 1MB)를 프레임마다 보냄
- `popupFound`: 작은 알림 시작, 기록이 켜져 있으면 쿠키를 먼저 읽고, 그 뒤 해당 프레임에 `optOut` 또는 `optIn` 전송
- `eval`: `evalSnippets[snippetId]` 함수만 `chrome.scripting.executeScript`(world MAIN)로 실행. snippetId가 없으면 false 응답
- `autoconsentDone`: 아이콘 체크, 기록, 작은 알림에 결과 문구
- 작은 알림은 끝났다는 소식이 안 와도 20초 뒤 스스로 내려감
- `optOutResult`/`optInResult`가 false: 처리 못 함으로 기록, 알림 내림

### 2.4 Consent-O-Matic 쪽 수정

- 규칙 목록: 원본 저장소의 `rules/*.json`(받은 판 8ca8500, 203개)을 `extension/rules/consent-o-matic-rules.json` 한 파일로 합쳐 묶음에 포함(`build/consentomatic/rules.json`) + `extraRules` + `patchRules`. 외부에서 받지 않음. 원본의 규칙 목록 받기, 사용자 지정 규칙 메시지 처리는 제거
- `hideInsteadOfPIP` 기본값 true. 가릴 때 `hideSmoothly`(Action.js): 0.8초 동안 작아지며 흐려짐, 크기 0인 껍데기는 흐려지기만 하고 안쪽의 화면 고정 요소를 직접 줄임
- 첫 `HIDE_CMP` 뒤 0.82초 대기 후 버튼 클릭
- 처리 직전 `CMPShowing` 메시지로 배경이 쿠키를 먼저 읽게 하고 최대 1.5초 대기

### 2.5 기록

- `logEnabled`(기본 false)가 true일 때만 `visitLog`(사이트, 시각, 결과, 동의 창 종류. 같은 사이트 같은 결과는 6시간에 1번, 최근 2000건)와 `cookieLog`(동의 전 쿠키, 처리 4초 뒤 새로 생긴 쿠키. 최근 150건) 저장
- 쿠키는 `chrome.cookies.getAll({url})`로 읽고 이름, 주소, 외부 여부, 남은 일수만 저장. 대상 주소는 맨 위 페이지가 `performance.getEntriesByType("resource")`로 알려 준 주소(최대 80개)
- `handledLog`: 처리 시각만 저장(오늘 처리 건수용), 기록 스위치와 무관

### 2.6 권한

`storage`, `cookies`, `scripting`, 호스트 권한 `<all_urls>`. 탭 주소 확인은 호스트 권한으로 처리(`tabs`, `activeTab` 제거)

### 2.7 검증 상태

- 사용자 확인 완료: 작은 창, 아이콘, 작은 알림, Consent-O-Matic 경로(cookiebot.com, onetrust.com, usercentrics.com)
- 미검증: autoconsent 경로 전체, 두 엔진 순서와 중복 방지, 기록 화면, 쿠키 전후 기록, `tabs` 권한 제거 후 작은 창의 사이트 주소 표시

## 3. 남은 계획

1. 지금 빌드 확인: 새로 고침 후 사이트 2~3곳에서 autoconsent 경로 동작 확인
2. 시험 도구: Playwright와 시험 전용 Chromium을 D의 프로젝트 폴더에 설치, 빈 임시 프로필에 확장 프로그램을 넣고 사이트 20~30곳을 자동 방문. 결과(처리 여부, 걸린 엔진, 쿠키 전후 기록, 화면 사진)를 표로 저장. 실행 후 프로필 삭제
3. 보완: 안 잡힌 사이트를 원인별로 묶어 수정
4. 작은 창에 "이 사이트 쿠키 지우기" 버튼: 현재 사이트 쿠키 삭제 후 새로 고침
5. 스토어 등록: 화면 사진 1~5장, `PRIVACY.md` 공개 주소 게시, `store/listing.md` 내용으로 Chrome 웹 스토어와 Edge Add-ons 신청

## 4. 정해 둔 원칙

- 최우선 가치: 단순성. 일반 사용자가 설정 없이 쓸 수 있을 것
- 추정으로 버튼을 고르는 기능은 엉뚱한 버튼을 누를 위험 때문에 사용하지 않음
- 방문 기록에 해당하는 정보는 사용자가 켠 경우에만 저장, 외부 전송 없음
- 새 파일과 설치물은 D 드라이브의 프로젝트 폴더 안에만 둠
