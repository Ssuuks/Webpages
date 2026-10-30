# 숫자부대 돌격 v2 설계

사용자와 합의한 범위: 도트 그래픽, 특수병과 3종, 영웅 3명(스킬은 **버튼으로 직접**, 설정에서 자동 가능), 판 중간 이어하기·백업 코드, 배경음악, 리뷰에서 나온 버그 수정. 미룬 것은 맨 아래.

## 1. 원칙

- 시뮬레이션(`assets/core.js`)은 DOM 없는 순수·결정적 코드다. 새 상태도 평범한 JSON 객체(Map·Set·함수 금지)라 판 중간 저장이 그대로 된다.
- `VERSION = 'squad-v1'`은 레벨 배치의 소금이라 **바꾸지 않는다**. 규칙이 바뀌면 `SIM`(정수)을 올린다. 이어하기 스냅숏과 보정 표는 `SIM`이 같을 때만 쓴다.
- 보정은 그 레벨의 기대 강화(EXPECT)와 기대 영웅의 상시 효과를 단 기준 봇으로 한다. **일반·쉼 레벨**의 보스는 특수병·상자 없이도 기준 병력으로 깰 수 있게, **어려움·매우 어려움**은 사람 흉내 봇 무리의 첫 시도 승률이 목표 구간에 들게(상자·철창을 챙겨야 수월할 수 있다 — 기준 봇은 늘 이긴다). 판 내내 한 자리에 서 있기만 해서 이기는 배치는 쓰지 않는다(배치 검사). 별 기준(par)은 플레이어의 강화와 출격 영웅을 단 기준 봇으로 정한다(영웅은 상시 효과만 — 스킬은 쓰지 않는다. 스킬을 안 누르는 사람이 영웅 때문에 별을 덜 받지 않게). 별 문턱은 par의 45%·90%(집중한 사람이 이긴 판의 25~45%가 ★★★, 60~80%가 ★★ 이상). 강화·영웅은 이기기 쉽게, 별은 실력으로.
- 화면에 쓰는 한국어는 DOM(Jua 글꼴)에서만. 게임 화면 안에는 숫자·기호·아이콘만 그린다.

## 2. 특수병과 (`roster.js` UNITS, 수치는 core.js)

| k | 이름 | 소개 레벨 | 효과 |
|---|---|---|---|
| medic | 의무병 | 5 | 게이트를 뺀 손실의 60%가 회복 풀로(1명이 안 되는 몫도 모아 둔다). 풀은 초당 max(1.5, 0.35·풀)명씩 돌아온다 |
| sniper | 저격수 | 9 | 1.2초마다 2–36m 안 표적에 즉시 0.35D. 우선순위 독침 > 거구 > 질주 > 졸개 > 상자·철창 > 보스. 게이트·벽은 안 쏜다 |
| rocket | 로켓병 | 13 | 2.4초마다 유도 로켓(30m/s). 8–30m 안 반경 2.2m에 hp 합 0.3D 이상인 가장 큰 무리 → 통로의 벽 → 보스. 0.6D 범위 피해 |

D = 지금 분대 화력(dps). 분대 최대 3명, 병과마다 1명. 같은 병과를 또 얻으면 병사 +max(5, nice(0.12N)).

- 얻기: **철창**(L5+, 쉼 청크에 확률 0.5, 소개 레벨엔 반드시, L5~8은 레벨마다 하나 이상) — 쏴서 부수면 합류. **금색 게이트**(L9+, 줄당 확률 0.45, 레벨당 최대 2줄, 마지막·1칸·모두 나쁜 줄과 가장 나쁜 칸이 제자리(x=0) 칸인 줄 제외) — 가장 나쁜 칸을 `+v`와 병과로 바꾼다. v = max(3, 가장 좋은 다른 칸 결과 − 1.3·N)이라 '병사 조금 덜 + 특수병'의 진짜 선택이 된다. 금색 칸은 총알이 통과(쏴서 못 올림). 특수병 배치에는 별도 난수 흐름을 써서 기존 배치를 바꾸지 않는다.
- 잃기: 한 번에 max(3, ceil(15%·N)) 이상 잃으면(게이트·톱날 제외) 가장 늦게 온 특수병이 쓰러진다. 내려찍기를 맞으면 매번 하나. 병사가 4×특수병 수보다 적으면 가장 늦게 온 특수병이 떠난다. N이 0이면 패배.
- 보스에게 주는 특수병·영웅 피해(뭉치 스킬로 늘어난 총알 피해 포함)는 병사 화력의 +10%(`BONUS_CAP`)까지. 초당 0.1·D씩 최대 1.5초 분량이 쌓이는 예산 `boss.bonus`에서 나간다(스킬을 안 누르는 사람과의 차이를 줄이려고 0.3 → 0.1).
- 결과: 살아남은 특수병 1명당 +3코인.

## 3. 영웅 (`roster.js` HEROES)

| id | 이름 | 합류 | 패시브 | 스킬(쿨 cd초) |
|---|---|---|---|---|
| mungchi | 뭉치 대장 | 레벨 3부터 | 게이트 올리기 ×1.1→1.25 | 돌격 나팔(16): 5초 총알 피해 ×1.25→1.4 |
| bori | 보리 | 레벨 8 클리어 | 손실의 12→30% 회복 풀로 | 괜찮아 주사(20): 최근 손실의 50→70% 즉시 회복 + 2.5초 손실 ×0.3 |
| nabi | 나비 | 별 30개 | 1.8초마다 0.18D→0.28D 직접 저격(저격수가 없을 때; 있으면 저격수 저격 +30→50%), 보스전 추가 피해 한도 +2%p/레벨 | 백발백묘(15): 3초 동안 0.25초마다 0.4D→0.6D 저격 12발 |

- 게이지 `hero.charge` 0..1: 시작 0.35, 매 틱 DT/cd(cd = 기본·(1−0.06(lv−1))), 처치 1마리 +0.01, 경기장 입장 +0.5(스킬이 켜져 있어도 쌓아 둔다).
- 발동: 입력 `{dir, tx, skill:true}` 이고 charge ≥ 1, 발동 중이 아니고, run/arena일 때. 화면 아래 가운데 영웅 버튼(게이지 고리) 또는 Space·↑·W. 설정 "스킬 자동 발동"(기본 끔)을 켜면 `heroWants(s)` 규칙으로 자동.
- 레벨 1~5, 비용 150/300/500/800코인. 상한 = min(5, 2 + floor((maxL−1)/10)).
- 코인 강화(store.js UPGRADES)의 새로 살 수 있는 단계 상한은 `core.upgCap(maxL)` = EXPECT(maxL) + 1(이미 산 단계는 줄이지 않는다).

## 4. 시뮬레이션 → 렌더러 계약

기존 상태(`s.squad, rows, props, saws, foes, spits, bullets, boss, phase, t`)에 더해:

```js
s.squad.sp      = [{ id, k }]                 // 얻은 순서. k: 'medic' | 'sniper' | 'rocket'
s.rockets       = [{ id, x0, z0, x, z, t, T, r }]   // 날아가는 로켓. 위치 = 시작→목표를 (1 - t/T)로 보간, 높이는 포물선
s.hero          = null | { id, lv, charge, act, T } // act: 스킬 남은 초(0이면 꺼짐), T: 스킬 길이
prop.kind       = 'wall' | 'crate' | 'cage'        // cage.reward = { type: 'unit', k }
cell.op         = 'add' | 'mul' | 'div' | 'unit'    // unit 칸: { op:'unit', v, k } → "+v" + 병과 아이콘, 금색 테두리
```

1단계 난이도 약속(main.js·insight.js가 쓴다): `levelTag(L)` → `{ tag: '' | 'hard' | 'super' | 'rest', label, coinMul }`(lv.tag도 같다), `upgCap(maxL)`, `bossEta(s)`(보스가 닿기까지 초, 없거나 닿았으면 null), `supportFor(lv)`(= lv.helpStart), `starGoals(par, lv)`·`starsFor(par, n, won, lv)`, `coinsFor`가 태그 배수를 곱한다. 'gate' 이벤트는 `{ before, after, x, row, alt }` — alt는 그 순간 줄의 칸마다 결과.

새 이벤트(`s.ev`): `spGet {k, via:'gate'|'cage', x, z}`, `spFull {k, n, x, z}`, `spLose {k, cause:'hit'|'escort', x, z}`, `snipe {x0, z0, x1, z1, src:'sniper'|'hero', kill}`, `rocket {id, x0, z0, x, z}`, `boom {x, z, r}`, `heal {n, x, z}`, `cageMiss {k, x, z}`, `heroReady {id}`, `heroCast {id}`, `heroEnd {id}`. `kill`에는 `by: 'gun'|'sniper'|'rocket'|'hero'`.

렌더러 API (`createRenderer(canvas)`):
- `view` — 버퍼 픽셀 기준 카메라, `screen` — `{ w, h, col }` CSS 픽셀(조작 계산용)
- `resize(w, h, dpr)`, `draw(s, alpha, dt, prevZ)`, `events(s, ev)`, `reset()`, `setQuality(q)`, `setShake(on)`, `setPreview(on)`, `setFrozen(on)`(일시정지·결과 화면에서 애니메이션 멈춤), `setCard(on)`(레벨 카드 뒤에서 병력 숫자·떠오르는 숫자 숨김), `setHudTarget(x, y)`(코인이 날아갈 CSS 좌표). 글자·아이콘·시트는 `ready` 전에 모두 굽는다 — 준비 뒤 게임 중 굽기는 0이어야 한다(`info.lateBakes`)
- `portrait(id, scale)` → 영웅 얼굴 캔버스(DOM 버튼·영웅 화면용), `icon(name, scale)` → 병과·상자 아이콘 캔버스

## 5. 저장

- 진행: 키 `squad.v1` 그대로, v2는 **필드 추가만**(옛 탭이 써도 깨지지 않게). 추가 필드: `v, updated, lastRunId, backupAt, nagged, heroes{sel, lv{}}, codex{foe,unit,hero,biome}, stats{wins,kills,bossKills,maxN,spGot,heroUses,resumes}, set.music, set.autoSkill`. 불러올 때 normalize(값 범위 고치기, 영웅 합류 소급).
- 이어하기: `squad.run.v1` = `{ v:1, sim:SIM, id, at, L, attempt, start, fire, support, hero, par, state }`. 3초마다·일시정지·화면 내릴 때·경기장 입장 때 저장. 결과 정산 뒤 `lastRunId`를 기록하고 지운다(이중 보상 방지). 다시 열면 멈춘 상태로 시작.
- 백업 코드: `save.js`의 `SQD1.` 코드(압축 + 검사값). 넣기 전 비교 표, 덮어쓰기 전 `squad.bak`에 보관해 되돌리기.
- 저장이 막히면 "저장 꺼짐" 표시, 첫 승리 뒤 `navigator.storage.persist()`, 레벨 10 이후 백업 한 번 권하기.

## 6. 그래픽 (도트)

- 낮은 해상도 버퍼(가로 약 190px)에 그리고 CSS `image-rendering: pixelated`로 확대. 원근 축소는 정해진 단계(1, 0.75, 0.5)만 써서 반짝임이 없게.
- 지역: 모래 고개(L1–10), 눈보라 기지(L11–20), 반복. 땅·연석 색은 파랑(좋음)·빨강(나쁨)을 쓰지 않는다.
- 분대는 앞 64명을 온전히 그리고 뒤로는 철모 줄을 더해 병력 규모가 보이게.

## 7. 미룬 것

방패병·화염병, 영웅 쾅이·철순이·딸깍, 도감 화면, 업적, 오늘의 작전, 지역별 보스, 밤의 도시 지역, 정면 승리 포즈.
