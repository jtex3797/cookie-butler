# 스토어 등록 준비

기준: Chrome 웹 스토어 공식 문서 4종(Privacy 탭, 이미지, User Data FAQ, 리스팅) 2026-11-21 확인분. 대시보드의 실제 입력란 이름과 글자 수 제한은 등록 화면에서 재확인 필요.

## 1. 계정과 비용

| 스토어 | 등록비 | 계정 |
|---|---|---|
| Chrome 웹 스토어 | 5달러 (1회 결제 여부는 등록 화면에서 확인 필요) | Google 계정, 등록 후 이메일 변경 불가 |
| Edge Add-ons | 없음 | Microsoft 계정(Partner Center) |

## 2. 등록 문구

### 이름
쿠키 도우미

### 요약 (manifest의 description과 같게 유지)
쿠키 동의 창을 정해 둔 범위대로 대신 처리합니다. 필수만, 기능까지, 통계까지, 전부 허용 중 선택.

### 상세 설명 (한국어)
쿠키 도우미는 웹사이트에 뜨는 쿠키 동의 창을 대신 처리합니다.

사용 방법
- 주소창 옆 아이콘을 눌러 얼마나 허용할지 정합니다: 필수만, 기능까지, 통계까지, 전부 허용.
- 이후 쿠키 동의 창이 뜨면 정해 둔 범위대로 버튼을 대신 누르고, 화면 왼쪽 아래에 작은 알림으로 결과를 알려 줍니다.
- 사이트별로 켜고 끌 수 있습니다.
- 거부 선택지 없이 "동의하거나 유료 구독"만 고르게 하는 창은 누르지 않고, 처리하지 않았다고 알려 줍니다.
- "이 사이트 쿠키 지우기" 버튼으로 지금 보는 사이트의 쿠키를 지우고 동의 창을 다시 띄울 수 있습니다.

기록 기능 (선택)
- 기록 화면에서 "기록 남기기"를 켜면 사이트별 처리 결과와, 동의 창을 처리하기 전에 이미 심긴 쿠키와 처리 후 새로 생긴 쿠키를 볼 수 있습니다.
- 기록은 브라우저 안에만 저장되며 어디로도 보내지 않습니다. 쿠키 값은 저장하지 않습니다. 기본값은 꺼짐입니다.

알아 둘 점
- 모든 사이트의 동의 창을 처리하지는 못합니다. 널리 쓰이는 동의 창 종류를 규칙으로 인식합니다.
- "기능까지", "통계까지"를 골라도 종류별 선택을 지원하지 않는 창은 필수만 허용으로 처리하고 알림에 그렇게 표시합니다.
- 이미 동의한 사이트는 동의 창이 다시 뜨지 않아 처리 대상이 아닙니다.

원작자 표기
- 동의 창을 찾고 처리하는 부분은 autoconsent(DuckDuckGo, MPL-2.0)와 Consent-O-Matic(CAVI, Aarhus University, MIT License)을 사용합니다.

### 상세 설명 (영어)
Cookie Helper answers cookie consent dialogs for you.

- Choose how much to allow from the toolbar popup: necessary only, plus functional, plus statistics, or allow all.
- When a consent dialog appears, the extension clicks through it with your choice and shows a small notice at the bottom left.
- Turn it on or off per site.
- Dialogs that offer no way to refuse without paying ("accept or subscribe") are left untouched, and you are told so.
- "Clear this site's cookies" removes the cookies of the site you are viewing so its consent dialog appears again.
- Optional records: if you turn on "Keep records", you can see per-site results and which cookies existed before the dialog was handled and which appeared after. Records stay in your browser, cookie values are never stored, and it is off by default.

Consent dialog handling uses autoconsent (DuckDuckGo, MPL-2.0) and Consent-O-Matic (CAVI, Aarhus University, MIT License).

### 분류
개인정보 보호 및 보안 계열 (대시보드의 실제 분류 이름에서 선택)

### 언어
한국어 (영어 설명 추가 여부 미정)

## 3. Privacy 탭 답변

### 단일 목적
쿠키 동의 창을 사용자가 정한 범위에 맞춰 자동으로 처리하고, 그 처리 결과를 사용자에게 보여 준다.

### 권한별 사용 이유
| 권한 | 사용 이유 |
|---|---|
| 호스트 권한(모든 사이트) | 쿠키 동의 창은 어느 사이트에서나 뜨므로, 페이지에서 동의 창을 찾아 사용자가 정한 선택을 대신 입력하는 데 필요 |
| storage | 허용 범위 설정, 꺼 둔 사이트 목록, 사용자가 켠 경우의 기록을 브라우저 안에 저장 |
| scripting | 일부 동의 창은 페이지가 제공하는 동의 기능을 직접 호출해야 닫힘. 묶음 안에 미리 들어 있는 정해진 함수만 페이지에서 실행하며, 외부에서 받은 코드는 실행하지 않음. 사용자가 "이 사이트 쿠키 지우기"를 누르면 현재 탭의 localStorage, sessionStorage를 비우는 데에도 사용 |
| cookies | (1) 사용자가 "기록 남기기"를 켠 경우, 동의 창 처리 전후의 쿠키 이름, 주소, 유효 기간을 읽어 기록 화면에 표시 (2) 사용자가 "이 사이트 쿠키 지우기"를 누른 경우, 현재 사이트의 쿠키 삭제. 쿠키 값 저장, 쿠키 생성과 내용 변경은 하지 않음 |

### 원격 코드
사용하지 않음. 실행 코드와 동의 창 인식 규칙(autoconsent, Consent-O-Matic)은 전부 묶음 안에 포함. 확장 프로그램이 스스로 외부에서 받는 것은 없음.

### 데이터 사용 공개
- 해당 항목: 웹 브라우징 활동(사이트 주소, 쿠키 이름). 사용자가 켠 경우에만 브라우저 안에 저장, 외부 전송 없음
- 허용 범위 설정만 브라우저 동기화 저장소(storage.sync) 사용. 사이트 주소가 들어가는 값(꺼 둔 사이트, 기록)은 전부 storage.local
- 공식 FAQ 기준: 브라우저 안에만 저장해도 공개 대상이며 개인정보 처리 안내 주소 등록 필수
- 공식 FAQ 기준: 브라우징 활동 수집은 사용자에게 보이는 기능에 필요한 범위만 허용, 수집 전 화면 안에서 눈에 띄는 고지와 동의 필요. 대응: 기록 화면의 "기록 남기기" 스위치(기본 꺼짐)와 안내 문구
- 인증 항목: 판매 안 함, 단일 목적과 무관한 용도로 사용 안 함, 신용 평가 용도로 사용 안 함

### 개인정보 처리 안내 주소
`PRIVACY.md`를 공개 주소에 게시한 뒤 그 주소 입력. 게시 위치 미정(GitHub 공개 저장소 또는 GitHub Pages).

## 4. 그림

| 항목 | 규격 | 필수 | 상태 |
|---|---|---|---|
| 스토어 아이콘 | 128x128 PNG, 그림 96x96과 둘레 16 투명 여백 | 필수 | `store/store-icon-128.png` 생성 완료 |
| 화면 사진 | 1280x800 또는 640x400, 1~5장, 여백 없이 꽉 차게 | 1장 이상 필수 | 3장 제작 완료: `store/screenshot-1.png`(작은 창), `screenshot-2.png`(처리 알림), `screenshot-3.png`(기록 화면). `tools/make-store-shots.js`로 재생성 |
| 작은 홍보 그림 | 440x280 | 선택 | 미제작 |
| 큰 홍보 그림 | 1400x560 | 선택 | 미제작 |

화면 사진의 배경 사이트는 영국 정부 사이트(gov.uk). 다른 사이트로 바꾸려면 `tools/make-store-shots.js`의 MAIN 값 변경.

## 5. 올릴 묶음

- `extension/build/dist/` 안의 zip 파일 (빌드할 때 자동 생성)
- 묶음에 `LICENSE.txt`(Consent-O-Matic 저작권 표시), `autoconsent/LICENSE.txt`(MPL-2.0) 포함

## 6. 남은 일

- [x] 시험 사이트 25곳 자동 시험(2026-11-21): 쿠키 창이 뜬 18곳 중 16곳 처리, 2곳 처리 불가 표시
- [x] 화면 사진 3장 제작
- [ ] 평소 쓰는 Chrome에서 "이 사이트 쿠키 지우기" 버튼과 기록 화면 확인
- [ ] `PRIVACY.md` 공개 주소 결정과 게시
- [ ] 원본의 `logo.svg`, `hide.svg`, `minimize.svg` 사용 여부 확인 후 미사용분 제거
- [ ] 한국어 외 언어 지원 여부 결정(화면 문구가 한국어 고정)
- [ ] Chrome 개발자 등록과 결제, Edge Partner Center 등록 (본인이 직접)
- [ ] Edge Add-ons 요구 사항 확인
