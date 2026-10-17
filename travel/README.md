# 가족 여행 플래너

여러 여행을 계획·관리하는 모바일 웹앱. GitHub Pages에서 도는 정적 앱이고 서버가 없다.
나트랑 단일 페이지 앱(`../nhatrang.html`)을 일반화했다. **엔진(이 폴더)과 데이터(여행마다 JSON 하나)를 분리**해서, 여행이 바뀌어도 코드는 고치지 않는다.

- 주소: `https://ssuuks.github.io/Webpages/travel/` (main에 반영된 뒤)
- 데이터: 비공개 저장소 `travel-data`를 사용자 토큰으로 읽고 쓴다. 토큰이 없으면 기기(IndexedDB)에만 저장된다.
- **이 공개 저장소에는 여행 데이터를 넣지 않는다.** 데모(`samples/demo.json`)만 있다.

## 처음 설정

1. GitHub에서 **비공개** 저장소 `travel-data`를 만든다(README로 초기화).
2. Fine-grained 토큰: Repository access는 `travel-data`만, Permissions → Contents: Read and write, 만료 90일.
3. 앱 [설정]에 토큰을 넣고 [저장하고 확인]. "비공개, 쓰기 가능"이 나오면 된다.
4. 홈 [가져오기]에 여행 묶음 파일(`travel-data-bundle.json`)을 넣고 [검사] → [저장] → [모두 커밋].
   저장소에 `trips/index.json`, `trips/{id}.json`, `datasets/{id}.json`이 만들어진다.
5. 다른 기기는 같은 설정 후 홈 [동기화].

## 화면

- 홈: 진행 중 → 다가오는 여행(D-day) → 지난 여행. [새 여행] [가져오기] [동기화].
- 여행 안 탭: **오늘 · 일정 · 장소 · 준비 · 비상 · 더보기**(예약 · 패스 · 경비 · 지도 · 메모 · 데이터).
  - 오늘: 여행 중이면 지금/다음 일정, 남은 시간·거리·출발 시각, 오늘 숙소·날씨, 오늘 필요한 비밀값, 마감 시각, 패스. 여행 전이면 D-day와 마감 임박 준비 항목.
  - 일정: 날짜 탭, 세로 타임라인, 이동 구간(km·분), 패스 도장, 선택·잠정 배지, 점검 경고, 안 전환(기본·우천 등), 편집 모드(추가·삭제·순서), 날짜별 '수정됨'과 [이 날 되돌리기].
  - 장소: 분류·배지·'지금 운영 중' 필터, 지역별/가까운 순, 기준점(오늘 숙소·특정 숙소·다음 일정 장소·현재 위치), 장소 시트(카카오·네이버·구글 길찾기, 전화, 운영시간, 패스 혜택), 찜, 일정에 넣기, 구글 지도 링크로 추가, AI로 여러 곳 추가. 데이터셋 장소(예: 제주투어패스 94곳)도 함께 보이고 일정에 넣으면 여행 장소로 복사된다.
  - 더보기 → 데이터: AI로 고치기, 비밀값 입력, JSON·.ics 내보내기, 커밋/불러오기, 커밋 기록에서 복원, 복제해서 새 여행.
  - 준비: 가족의 여행 첫날 기준 나이·개월(기기 프로필의 생년월일로 계산), 마감 순 목록, **예약 오픈 자동 알림**(일정에 넣은 장소의 "바코드 7일 전"·"24시간 전" 같은 조건, 또는 '예약 필요' 배지로 계산 → [체크리스트에]로 옮길 수 있음).
  - 예약: 숙소·교통 직접 추가·수정·삭제, 비밀값 키 지정.
  - 비밀값 옮기기: [데이터 → 비밀값 → 다른 기기로 옮기기]가 만든 코드를 다른 기기의 [코드로 받기]에 붙여넣는다. 저장소를 거치지 않는다.
  - .ics에는 항공·체크인·교통 마감 외에 준비 마감일과 예약 오픈일(09:00 알림)도 들어간다.

## 데이터 형식 trip/v1

`schema/trip.v1.json`(JSON Schema)이 형식 문서다. 앱의 검사기(`assets/validate.js`)는 여기에 더해 참조 무결성과 일정 점검까지 본다.

- 여행 하나 = 파일 하나. 장소는 `places`에 한 번만 두고 일정은 `placeId`로 연결.
- 시각은 `meta.timezone` 현지 시각(`YYYY-MM-DDTHH:MM`). 날짜 `YYYY-MM-DD`, 시간 `HH:MM`.
- 비밀값은 본문에 `{{secret:키}}`, `secrets`에는 키와 이름만. 값은 기기 localStorage에만.
- 교통 마감 `deadlines[]`: `after`(그 교통 도착 + `bufferMin` > `at`이면 경고), `before`(`at` + `bufferMin` > 그 교통 출발이면 경고).
- 운영시간 `hours`: `default`, 요일별 `mon..sun`, `lastEntry`, `closed`(요일 배열), `note`.
- 가져오기 전용 키(저장 전에 처리, 파일에 남지 않음): `secretValues`, `_remove`. 부분 JSON은 기존 여행에 병합(배열은 id 기준 upsert, days는 date 기준).
- 묶음 `bundle/v1`: `{ "schema": "bundle/v1", "trips": [], "datasets": [] }` — 여러 파일을 한 번에 가져온다(전체 백업도 이 형식).

## AI로 데이터 만들기

[새 여행] → [프롬프트 복사](규칙 + 가족 프로필 요약 + 빈 양식) → 여행을 상의하던 AI 채팅 끝에 붙여넣기 → AI가 준 JSON을 붙여넣고 [검사] → 오류/경고/요약/비밀값 → 미리보기 → [저장] → [커밋].
프롬프트 원문 5종은 `assets/prompts/*.txt`(새 여행, 기존 여행 고치기, 장소 추가, 예약 메일 정리, 지난 여행 정리).
코드블록 표시·앞뒤 설명·끝 쉼표·스마트 따옴표는 자동으로 걷어내고, 그래도 안 되면 몇째 줄 몇째 글자에서 막혔는지 보여준다.

## 동기화 규칙

- 열 때: 원격 sha가 마지막으로 받은 것과 다르고 기기에 커밋 안 된 변경이 없으면 자동 반영. 변경이 있으면 덮지 않고 충돌 배너로 묻는다.
- 저장은 기기에 즉시, [커밋]으로 저장소 반영(sha 사용). 다른 기기가 먼저 커밋했으면 덮어쓰기 전에 확인. 여행 메타가 바뀌면 `trips/index.json`도 갱신.
- '수정됨'·[되돌리기]의 기준은 마지막 커밋 버전.

## 구조

```
travel/
├── index.html, manifest.webmanifest, sw.js   # 셸, PWA, 오프라인 캐시
├── assets/
│   ├── app.js        # 상태·라우팅·동기화·홈·설정
│   ├── v-trip.js     # 오늘·일정·장소·준비·비상
│   ├── v-more.js     # 예약·패스·경비·지도·메모·데이터
│   ├── v-import.js   # 새 여행·가져오기·AI로 고치기·복제
│   ├── validate.js   # 검사기 + 일정 점검
│   ├── importer.js   # 관용 파싱, 부분 병합, _remove, secretValues, 변경 목록
│   ├── model.js, util.js, store.js, github.js, ui.js
│   ├── weather.js (Open-Meteo), map.js (Leaflet), ics.js, prompts.js
│   └── prompts/*.txt
├── schema/trip.v1.json
├── samples/demo.json      # 민감정보 없는 데모
├── vendor/leaflet-1.9.4/  # npm 공식 패키지 그대로(BSD-2), SRI 해시 일치 확인
├── tools/migrate-nhatrang.mjs
└── tests/run.mjs
```

- 빌드 없음. ES 모듈. 외부 스크립트 없음(Leaflet도 저장소에 고정 포함), CSP 메타 태그.
- AI가 만든 문자열은 모두 텍스트 노드로 렌더링한다(innerHTML 미사용, `**굵게**`·`*굵게*`만 변환). 링크는 http·https·tel·nmap·kakaomap만 허용.
- 키가 필요한 API는 쓰지 않는다. 날씨 Open-Meteo, 지도 OpenStreetMap 타일(출처 표기).

## 개발

```sh
python3 -m http.server 8000      # 저장소 루트에서 → http://localhost:8000/travel/
node --test travel/tests/run.mjs # 검사기·병합·시간대·.ics 단위 테스트
```

나트랑 이관(일회성): `node travel/tools/migrate-nhatrang.mjs data.json nhatrang.html out.json` → 결과를 [가져오기].
비밀값 키(`pnr`, `parking`, `car`)는 그대로라, 나트랑 앱을 쓰던 기기에 남은 값을 자동으로 이어받는다.

실기기 확인 항목: iOS Safari·안드로이드 크롬에서 지도 앱 링크(특히 `nmap://`), 위치 권한, 오프라인, 홈 화면 추가.
