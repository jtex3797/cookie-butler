# Cookie Butler

웹사이트에 뜨는 쿠키 동의 창을 사용자가 정한 범위에 맞춰 대신 처리하는 Chrome, Edge 확장 프로그램입니다.

## 하는 일

- 쿠키 동의 창이 뜨면 정해 둔 범위(필수만, 기능까지, 통계까지, 전부 허용)대로 버튼을 대신 누릅니다.
- 처리하는 동안 화면 왼쪽 아래에 작은 알림을 보여 줍니다.
- 사이트별로 켜고 끌 수 있습니다.
- 원하면 사이트별 처리 결과와, 동의 창 처리 전후에 심긴 쿠키를 기록해서 볼 수 있습니다. 기록은 브라우저 안에만 저장되며 기본값은 꺼짐입니다.

## 폴더

- `extension/` 확장 프로그램 원본과 빌드 설정
- `trials/` 화면, 아이콘 시안
- `store/` 스토어 등록 준비 자료
- `PRIVACY.md` 개인정보 처리 안내

## 빌드와 설치

```
cd extension
npm install
npm run build
```

`chrome://extensions`(Edge는 `edge://extensions`)에서 개발자 모드를 켜고 "압축해제된 확장 프로그램을 로드합니다"로 `extension/build` 폴더를 선택합니다.

아이콘 그림은 `node make-icons.js`로 다시 만들 수 있습니다.

## 원작자 표기

쿠키 동의 창을 찾고 처리하는 부분은 두 가지 공개 프로젝트를 함께 사용합니다.

- [autoconsent](https://github.com/duckduckgo/autoconsent)(DuckDuckGo, MPL-2.0): 규칙이 많고 "전부 거부"와 "전부 허용"을 처리합니다. 수정 없이 라이브러리로 사용하며, 허가 조건은 묶음의 `autoconsent/LICENSE.txt`에 있습니다.
- [Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic)(CAVI, Aarhus University, MIT License): 쿠키 종류별 선택(기능까지, 통계까지)을 처리합니다. 동작 부분을 가져와 고쳐 썼으며, 원본의 저작권 표시와 허가 조건은 `extension/LICENSE`에 있습니다.

허용 범위가 "필수만"이나 "전부 허용"이면 autoconsent를 먼저, "기능까지"나 "통계까지"면 Consent-O-Matic을 먼저 쓰고, 먼저 쓴 쪽이 쿠키 창을 못 찾으면 다른 쪽으로 한 번 더 찾습니다. 화면, 문구, 아이콘, 기록 기능은 새로 만들었습니다.
