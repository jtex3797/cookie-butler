# Cookie Butler 설계와 남은 계획

작성일: 2026-11-21. 대상 폴더: `D:\CodeWorkspace\my-project\cookie-butler`

## 1. 목적

- 웹사이트의 쿠키 동의 창을 사용자가 정한 허용 범위(4단계)에 맞춰 자동 처리하는 Chrome, Edge 확장 프로그램(Manifest V3)
- 일반 사용자 대상, 한국어와 영어 화면(브라우저 언어 기준, ko 외는 영어), Chrome 웹 스토어와 Edge Add-ons 등록 예정
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
- 단계 1과 2: 두 엔진을 함께 시작. autoconsent는 창을 찾아도 지시를 기다리고(`autoAction: null`), 배경은 1.2초 동안 Consent-O-Matic이 그 창을 맡는지(`CMPShowing`) 지켜봄. 맡으면 Consent-O-Matic이 종류별로 처리하고, 끝난 뒤 `cookieHelperRecheck`로 창이 아직 떠 있는지 물어 떠 있으면 autoconsent가 이어받음. 안 맡으면 `cookieHelperStopCom`으로 Consent-O-Matic을 멈추고 autoconsent optOut. (차례로 쓰던 방식은 5초 대기 때문에 창이 한참 떠 있다가 사라져서 변경)
- 종류별 선택 뒤 확인: Consent-O-Matic이 처리를 끝냈거나(1.5초 뒤) 시작 후 12초 동안 소식이 없으면, 배경이 탭의 모든 프레임에 `cookieHelperVerify`를 보내 Consent-O-Matic을 정리하고 autoconsent를 시작. 쿠키 창이 아직 보이면 autoconsent가 전부 거부로 처리(단계 1, 2에서만). 근거: 2026-11-21 시험에서 통계까지 단계 실패 6곳 중 4곳이 Consent-O-Matic이 창을 열어 놓고 멈추거나 잘못 완료 보고한 경우
- 거부 선택지 없는 창: 두 엔진 모두 못 찾았을 때 맨 위 페이지에서 `findConsentWall`로 "동의 또는 유료 구독" 창이 보이는지 글자로 추정. 보이면 `ConsentWall`을 보내 결과 `wall`(처리 불가), 아이콘 "!", 작은 알림으로 표시. 버튼은 누르지 않음. Consent-O-Matic의 contentpass 규칙은 잘못된 완료 보고 때문에 제외
- 직접 추가한 autoconsent 형식 규칙: `extraAutoconsentRules.js`(iubenda 새 창)
- "못 찾음" 판정
  - autoconsent: `instance.state.lifecycle`을 0.2초 간격으로 확인. `nothingDetected`이거나, `cmpDetected`(업체 흔적은 있으나 창이 안 보임) 상태가 7초(35회)를 넘거나, 전체 100회(20초)를 넘으면 못 찾은 것으로 처리. autoconsent는 창이 뜨기를 약 5초 기다린 뒤 상태를 바꾸지 않고 끝내기 때문
  - Consent-O-Matic: 엔진이 5초 동안 못 찾으면 콜백에서 handled, error 모두 아닌 경우
- 두 엔진 중복 방지 1: Consent-O-Matic의 5초 정지 타이머는 창이 뜨는지 확인하는 중(`checkRunning`)이면 다시 걸고 끝냄(최대 6회, 약 30초. 넘으면 못 찾은 것으로 처리). autoconsent 쪽은 못 찾은 것으로 넘긴 뒤(`gaveUp`)에는 배경과 메시지를 주고받지 않고, `optOut`/`optIn` 지시는 프레임당 1번만 받음
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
- 원본의 `statistics`(동의 창 종류별 처리 횟수) 저장은 제거. 읽는 곳이 없었음

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

## 검토 기록 (2026-11-21 01:33)

- 프로젝트 경로: D:/CodeWorkspace/my-project/cookie-butler
- 검토 대상: D:/CodeWorkspace/my-project/cookie-butler/docs/plan.md
- 설정: 에이전트 3, 라운드 3, 최우선 가치 단순성

반영 9/9 (채택 9, 부분 0, 기각 0) / 완성도 90% / 추가 검토: 권장 1라운드 (파급)

| 라운드 | 에이전트 역할 | 모델/노력치 | 입출력 토큰 | 핵심 지적 사항 | 반영 여부(채택/기각) 및 사유 |
|---|---|---|---|---|---|
| R1 | 사실 대조 | sonnet / medium | 563,536 / 4,541 | [Major] autoconsent가 업체 흔적만 찾고 창은 못 찾은 경우(cmpDetected) 상태가 안 바뀌어 다음 엔진과 NothingFound가 실행 안 됨 | 채택. 라이브러리 코드로 사실 확인. cmpDetected 7초 초과 시 못 찾음 처리 |
| R1 | 예외·엣지케이스 | opus / high | 962,152 / 20,126 | [Major] 먼저 쓴 엔진이 못 찾음을 알린 뒤에도 계속 돌아 두 엔진이 같은 창을 처리, autoconsent 지시 중복 | 채택. 포기 뒤 메시지 차단, 지시 1회 제한, 창 확인 중이면 정지 타이머 재설정 |
| 〃 | 〃 | 〃 | 〃 | [Major] 작은 알림이 "처리 중"에서 안 내려가는 경우(중간 단계 규칙, 프레임 이동) | 채택. 20초 안전 타이머 |
| 〃 | 〃 | 〃 | 〃 | [Major] 서비스 워커가 잠든 뒤 늦게 열리는 iframe이 처리 완료 표시를 지우고 none 기록을 남김 | 채택. Searching, NothingFound는 맨 위 페이지만 전송 |
| R1 | 보안·개인정보 | sonnet / medium | 327,468 / 6,032 | [Major] 꺼 둔 사이트 목록이 storage.sync에 저장되어 "브라우저 안에만 저장" 고지와 어긋남 | 채택. storage.local로 이동, 허용 범위 설정의 동기화 가능성은 고지 |
| 〃 | 〃 | 〃 | 〃 | [Major] 쓰지 않는 권한 activeTab, tabs 선언 | 채택. 두 권한 제거 |
| 〃 | 〃 | 〃 | 〃 | [Major] 원격 규칙을 제3자 저장소 master에서 받아 모든 사이트의 클릭에 사용, 사용자 지정 규칙 처리 잔존 | 채택. 규칙을 묶음에 포함해 원격 요청 제거, 사용자 지정 규칙 처리 제거 |
| R2 | 예외·엣지케이스 | opus / high | 878,687 / 13,317 | [Major] 정지 타이머 재설정이, 확인 도중 예외로 checkRunning이 남으면 끝없이 반복되어 못 찾음이 영영 안 불림 | 채택. 재설정 6회(약 30초) 상한 |
| R2 | 파급 | sonnet / medium | 354,833 / 2,764 | Pass | - |
| R2 | 보안·개인정보 | sonnet / medium | 217,616 / 3,519 | [Major] 읽지 않는 statistics(동의 창 종류별 처리 횟수)가 고지 없이 항상 저장됨 | 채택. 저장 코드 제거 |
| R3 | 예외·엣지케이스 | opus / high | 360,727 / 10,543 | Pass | - |
| R3 | 보안·개인정보 | sonnet / low | 141,525 / 740 | Pass | - |

총 소요 17.8분. 서브 8개 입력 3,806,544 / 출력 61,582. 메인 포함 합계 입력 14,662,431 / 출력 99,609.

완성도 산정: 100 − 파급 미확인 1×10 = 90. 채택 9건은 모두 그 관점이 이후 라운드에 다시 투입되어 재검토됨(사실 대조는 관문 뒤 같은 라운드 나머지 관점 실행). R2 판정으로 변경 대상이 늘었으나(statistics 저장 제거, stopRetries 추가) R3에 파급 관점을 다시 넣지 않음. 참고: R3 보안·개인정보가 statistics 참조를 Grep으로 확인했고, 메인의 Grep에서 stopRetries, getStatistics, setStatistics 참조는 ConsentEngine.js:151과 GDPRConfig.js의 정의뿐이었음.

### 집계 스크립트 출력

- 시작: 2026-11-21 01:33 / 집계: 2026-11-21 01:51 / 소요: 17.8분 (로컬 시각)
- 세션: 4c69f26d-3bef-4cad-ab67-d1645a2c98ac

| # | 설명 | 타입 | 모델 | effort | 소요(s) | 도구 | 입력 | 캐시읽기 | 출력 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | R1 사실 대조 | Explore | claude-sonnet-5-5 | medium | 46 | 15 | 563,536 | 474,299 | 4,541 | 완료 |
| 2 | R1 예외·엣지케이스 | Plan | claude-opus-5-5 | high | 208 | 17 | 962,152 | 851,200 | 20,126 | 완료 |
| 3 | R1 보안·개인정보 | Explore | claude-sonnet-5-5 | medium | 52 | 13 | 327,468 | 268,324 | 6,032 | 완료 |
| 4 | R2 예외·엣지케이스 | Plan | claude-opus-5-5 | high | 144 | 16 | 878,687 | 803,571 | 13,317 | 완료 |
| 5 | R2 파급 | Explore | claude-sonnet-5-5 | medium | 44 | 7 | 354,833 | 286,861 | 2,764 | 완료 |
| 6 | R2 보안·개인정보 | Explore | claude-sonnet-5-5 | medium | 30 | 10 | 217,616 | 155,023 | 3,519 | 완료 |
| 7 | R3 예외·엣지케이스 | Plan | claude-opus-5-5 | high | 114 | 9 | 360,727 | 315,408 | 10,543 | 완료 |
| 8 | R3 보안·개인정보 | Explore | claude-sonnet-5-5 | low | 9 | 5 | 141,525 | 117,877 | 740 | 완료 |
| - | 메인(지휘, 집계 시점 기준) | - | claude-fable-5-2 | - | - | 30 | 10,855,887 | 10,785,908 | 38,027 | - |
| | 합계 (서브 8개 + 메인) | | | | | 122 | 14,662,431 | 14,058,471 | 99,609 | |

### 최종 설계 요약

- 엔진 2개를 차례로 사용: 필수만/전부 허용은 autoconsent 먼저, 기능까지/통계까지는 Consent-O-Matic 먼저, 못 찾으면 다른 엔진
- 중복 처리 방지: autoconsent는 포기 뒤 메시지 차단과 지시 1회 제한, Consent-O-Matic은 창 확인 중 정지 타이머를 최대 6회 미룸, 두 번째 엔진 시작 전 PopupSeen 확인
- 외부 통신 없음: 두 엔진의 규칙을 모두 묶음에 포함. 권한은 storage, cookies, scripting, 호스트 권한
- 사이트 주소가 들어가는 값은 전부 storage.local, 방문 기록은 사용자가 켠 경우만 저장. 읽지 않는 통계 저장 제거
- 실제 브라우저 검증은 미실시. 남은 계획: 빌드 확인, 시험 도구, 보완, 쿠키 지우기 버튼, 스토어 등록

```json
{"start":"2026-11-20T16:33:30.469Z","session":"4c69f26d-3bef-4cad-ab67-d1645a2c98ac","project":"cookie-butler","target":"D:/CodeWorkspace/my-project/cookie-butler/docs/plan.md",
 "settings":{"agents":3,"rounds":3,"value":"단순성"},
 "completeness":90,"more":"권장 1라운드 (파급)",
 "main":{"model":"claude-fable-5-2","tools":30,"in":10855887,"cacheRead":10785908,"out":38027},
 "agents":[
  {"name":"R1 사실 대조","type":"Explore","effort":"medium","secs":46,"model":"claude-sonnet-5-5","tools":15,"in":563536,"cacheRead":474299,"out":4541,"adopt":1,"partial":0,"reject":0},
  {"name":"R1 예외·엣지케이스","type":"Plan","effort":"high","secs":208,"model":"claude-opus-5-5","tools":17,"in":962152,"cacheRead":851200,"out":20126,"adopt":3,"partial":0,"reject":0},
  {"name":"R1 보안·개인정보","type":"Explore","effort":"medium","secs":52,"model":"claude-sonnet-5-5","tools":13,"in":327468,"cacheRead":268324,"out":6032,"adopt":3,"partial":0,"reject":0},
  {"name":"R2 예외·엣지케이스","type":"Plan","effort":"high","secs":144,"model":"claude-opus-5-5","tools":16,"in":878687,"cacheRead":803571,"out":13317,"adopt":1,"partial":0,"reject":0},
  {"name":"R2 파급","type":"Explore","effort":"medium","secs":44,"model":"claude-sonnet-5-5","tools":7,"in":354833,"cacheRead":286861,"out":2764,"adopt":0,"partial":0,"reject":0},
  {"name":"R2 보안·개인정보","type":"Explore","effort":"medium","secs":30,"model":"claude-sonnet-5-5","tools":10,"in":217616,"cacheRead":155023,"out":3519,"adopt":1,"partial":0,"reject":0},
  {"name":"R3 예외·엣지케이스","type":"Plan","effort":"high","secs":114,"model":"claude-opus-5-5","tools":9,"in":360727,"cacheRead":315408,"out":10543,"adopt":0,"partial":0,"reject":0},
  {"name":"R3 보안·개인정보","type":"Explore","effort":"low","secs":9,"model":"claude-sonnet-5-5","tools":5,"in":141525,"cacheRead":117877,"out":740,"adopt":0,"partial":0,"reject":0}
 ]}
```
