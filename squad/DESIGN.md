# 숫자부대 돌격 v2 설계

사용자와 합의한 범위: 도트 그래픽, 특수병과 3종, 영웅 3명(스킬은 **버튼으로 직접**, 설정에서 자동 가능), 판 중간 이어하기·백업 코드, 배경음악, 리뷰에서 나온 버그 수정. 미룬 것은 맨 아래.

## 1. 원칙

- 시뮬레이션(`assets/core.js`)은 DOM 없는 순수·결정적 코드다. 새 상태도 평범한 JSON 객체(Map·Set·함수 금지)라 판 중간 저장이 그대로 된다.
- `VERSION = 'squad-v1'`은 레벨 배치의 소금이라 **바꾸지 않는다**. 규칙이 바뀌면 `SIM`(정수)을 올린다. 이어하기 스냅숏과 보정 표는 `SIM`이 같을 때만 쓴다.
- 보정은 그 레벨의 기대 강화(EXPECT)와 기대 영웅의 상시 효과를 단 기준 봇으로 한다. **일반·쉼 레벨**의 보스는 특수병·상자 없이도 기준 병력으로 깰 수 있게, **어려움·매우 어려움**은 사람 흉내 봇 무리의 첫 시도 승률이 목표 구간에 들게(상자·철창을 챙겨야 수월할 수 있다 — 기준 봇은 늘 이긴다). 판 내내 한 자리에 서 있기만 해서 이기는 배치는 쓰지 않는다(배치 검사). 별 기준(par)은 플레이어의 강화와 출격 영웅을 단 기준 봇으로 정한다(영웅은 상시 효과만 — 스킬은 쓰지 않는다. 스킬을 안 누르는 사람이 영웅 때문에 별을 덜 받지 않게). 별 문턱은 par의 55%·90%(`STARS`, 집중한 사람이 이긴 판의 25~45%가 ★★★, 60~80%가 ★★ 이상). 강화·영웅은 이기기 쉽게, 별은 실력으로.
- 화면에 쓰는 한국어는 DOM(Jua 글꼴)에서만. 게임 화면 안에는 숫자·기호·아이콘만 그린다.
- 2단계(판 중 긴장): 난이도는 보이는 숫자·예고·판단에서만 나온다 — 숨은 난수·결제 벽 없음, 한 손으로 반응할 수 없는 것 없음. 예고 공정성: 옆 칸 회피는 `WARN_MIN` 0.7초 이상, 한 칸 넘게 움직여야 하면 `moveTime(d) + REACT_FAR`(0.45초) 이상(`fairWarn`, 테스트로 확인). 어려움·매우 어려움은 상자·철창을 챙겨야 할 수 있고(열쇠 상자), 일반 레벨은 없이도 깬다. 별 기준(par)은 그대로 스킬 없는 기준 봇, 이미 받은 별·산 강화는 줄이지 않는다.

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
| mungchi | 뭉치 대장 | 레벨 3부터 | 게이트 올리기 ×1.2→1.4 | 돌격 나팔(16): 5초 총알 피해 ×1.12→1.25 |
| bori | 보리 | 레벨 8 클리어 | 손실의 8→18% 회복 풀로 | 괜찮아 주사(20): 최근 손실의 40→55% 즉시 회복 + 2.5초 손실 ×0.5 |
| nabi | 나비 | 별 30개 | 1.8초마다 0.08D→0.13D 직접 저격(저격수가 없을 때; 있으면 저격수 저격 +15→30%), 보스전 추가 피해 한도 +2%p/레벨 | 백발백묘(15): 3초 동안 0.375초마다 0.25D→0.35D 저격 8발 |

수치는 `roster.js` `HEROES[id].num`([Lv1, Lv5] 선형). 2단계에서 판 중 위협이 세지자 나비·보리가 뭉치보다 8~13%p 강해져 다시 맞췄다 — 같은 레벨이면 sloppy0.1 승률이 영웅마다 5%p 안(테스트).

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

1단계 난이도 약속(main.js·insight.js가 쓴다): `levelTag(L)` → `{ tag: '' | 'hard' | 'super' | 'rest', label, coinMul }`(lv.tag도 같다), `upgCap(maxL)`, `bossEta(s)`(보스가 닿기까지 초, 없거나 닿았으면 null), `supportFor(lv, own?)`(= lv.helpStart, own = 그 저장의 `{ start, fire }`가 기대 강화보다 낮으면 모자란 만큼 더 — 3단계), `starGoals(par, lv)`·`starsFor(par, n, won, lv)`, `coinsFor`가 태그 배수를 곱한다. 'gate' 이벤트는 `{ before, after, x, row, alt }` — alt는 그 순간 줄의 칸마다 결과.

2단계 약속(SIM 6, 렌더러·화면이 쓸 수 있는 것 — 지금은 그리지 않아도 판은 돈다). 3단계(SIM 7, 검증 뒤 수정)에서 더한 것은 이 블록 아래:

```js
row.kind     = 'plain'|'stake'|'think'|'jack'|'last'|'guard'|'trap'|'crisis'|'shoot'|'gold'   // 줄 종류
cell.jack    = true            // 빨강 잭팟 칸(몰아 쏘면 그 줄 최선), cell.rise·cell.cap = 오르는 빠르기·끝
prop.key     = true            // 열쇠 상자(어려움·매우 어려움, 무기 강화), prop.guard = 지킨 줄의 벽
foe.flank    = true            // 길 가장자리에서 파고드는 몰이 줄·보스 소환 질주 좀비, foe.guard / saw.guard = 약한 칸을 지키는 독침·톱날
lv.marks / s.marks = [{ t:'surge', z }]   // 몰이 청크 시작 — MARK_AHEAD(45m) 앞에서 이벤트
```

2단계 이벤트: `surge {z, x}`(몰이 45m 앞 한 번), `slamWarn {x0, x1, warn}`(warn = 이번 예고 초 — 가장자리에 서 있으면 길어진다), `crateMiss {x, z, n, key}`·`cageMiss {k, x, z, n}`(n = 부딪혀 잃은 병사, key = 열쇠 상자), `summon {n}`(그중 둘은 가장자리 질주 좀비 L4+).

3단계 약속(SIM 7):

- `slamZone(slam, R)` → `{ x0, x1 }`: 내려찍기가 실제로 맞는 범위(칸 ± `SLAM_EDGE`·R, 길 안). 렌더러는 이 범위를 빨갛게, 가장자리에 밝은 선을 그린다 — `slamHits`와 같은 범위(테스트). 예고 중 범위 밖의 분대는 가장자리(`SLAM_STOP`)에서 멈춘다.
- `slamFairWarn(x, vx, R, x0, x1, laneW)`·`moveTimeFrom(d, vx)`·`TURN`: 움직이는 분대의 공정한 예고(반대로 가던 속도를 멈추는 시간 + 밀린 거리).
- 독침은 `spitEscape`가 피할 쪽을 찾을 때만 쏜다(없으면 `SPIT_WAIT` 0.25초 뒤 다시 본다).
- `POP`에 `pump`(덧셈 칸을 쏘아 올리는 집중한 사람) — `humanBot(seed, err, skill, { pump })`. `POP_K` 48. `BOSS_SPEC.*.band.pump`, `band.w`.
- `ROW_MIX.hard`·`LAST_THINK_HARD`: L15+ 어려운 레벨의 줄 구성. 그 첫 게이트 줄은 늘 판돈 줄(금색 제외).
- `calibrateLevel(key, tries)`, `CAL_TRIES` 8(표), `RUNTIME_TRIES` 4(표 밖 L301+를 게임이 처음 열 때). 표(`caltable.js`)는 L1~300. 3패 지원 병력(`helpFor`)은 경기장 앞까지만 돌아 보스 체력과 상관없어서, `calibrate()`는 함수(`cal.help`)로만 넘기고 `calibrateLevel`이 끝에 고른 배치에서 한 번 잰다(결과는 그대로 — L1~60 표 보정·L121~200 그 자리 보정이 바꾸기 전과 같다).
- `stateHash`는 2단계 상태(상자·열쇠·몰이 알림·톱날·줄·독침·총알·난수·무기 단계·속도·코인·보스 타이머)까지 본다.
- 화면: `surge` → 알림 글자·경보음(`sfx.surge`)·진동 + 렌더러 양옆 붉은 화살표. 상자·철창 접촉 손실(`loss` cause 'crate')은 상자 자리에 '−n', 결과 화면 원인 `CAUSE.crate`. 보스전에서 끌기를 한 번도 안 쓴 사람(L5+)에게 끌기 안내. 규칙이 바뀐 뒤 처음 연 기존 플레이어에게 SIM마다 바뀐 것만 알린다(`BALANCE_NOTES`).

충돌 크기 약속(SIM 8 — 그린 것 = 맞는 것, 맞는 범위는 그린 것의 80~100%로 조금 너그럽게):

```js
SQUAD_DEPTH = 0.55                 // 분대 몸 앞뒤 ±SQUAD_DEPTH·R (그린 대형의 앞뒤 끝 발도 여기 — FORM_IN 0.08 안쪽)
CONTACT_GRACE = 0.12, SOLO_HALF = 0.34
hitHalf(R) = min(R − CONTACT_GRACE, SOLO_HALF + 1.5(R − 0.53))   // 분대가 맞는 몸의 옆 반폭(그린 무리 끝 = R)
touches(dx, dz, hx, hz, a, b)      // 분대 네모(±hx, ±hz)와 땅 위 타원(반지름 a, b)이 겹치나 — 좀비(a = FOE_HX·r = 0.8r, b = r)·톱날(a = w/2, b = SAW_HD 0.35)
hitShapes(s) → [{ k, x0, x1, z0, z1, ell? }]   // 시뮬레이션이 실제로 재는 모양(squad·foe·saw·wall·crate·cage·spit·bossHit·bossReach)
```

- 벽·상자·철창·독침은 분대 몸 ±hitHalf와 x로 겹친 몫(`ov` = 겹친 폭 / 2·hitHalf). 벽·상자·철창 손실은 `min(ceil(체력/10 × min(1, 2ov)), ceil(n × ov))` — 걸친 폭의 병사까지만.
- 봇·레벨 생성(`foeLeftover`·`waveLeak`)·독침 공정성(`spitEscape`)은 그린 크기(R, R + 0.8r)로 판단한다 — 사람이 보고 피하는 크기, 은혜는 덤.
- 보스 총알 판정(±`BOSS_HIT` 1.8)·짓밟기(옆 판정 없음)·내려찍기(`slamZone`)는 그대로.
- 렌더러: `formationSpot(i, T, R, hw)`(대형 — 초타원 p = `FORM_P` 8 네모, 바깥 병사는 테두리 위, 옆 끝 그림 = R: hw = `SOLDIER_HALF_PX`(7) / 분대 자리 배율), `formationCount(n, low)`, `slotPos`·`heroZ`(특수병·영웅은 무리 뒤, 분대 폭 안)를 내보낸다(테스트가 읽는다). 그림자도 같은 네모. 보스 총알 판(보스 − 1m)을 지난 총알은 보스 그림 뒤에(정렬 항목 k 11) 그린다. 짓밟기(`stomp`)마다 분대 뒤 끝 ~ 보스 발의 길 전체를 0.22초 밝힌다. 독침 고리는 `SPIT_R`.
- 충돌 크기 보기: `renderer.setHitbox(on)`·`renderer.hitbox`·`info.hitbox`, 화면은 `?hitbox=1`·`__squad.hitbox`. `hitShapes`만 그린다(그림과 같은 시간축으로 분대를 보간).
- 배치 유지: `calibrateLevel(key, tries, keep = keepAttempt(key))` — 보정 표에 이미 적힌 배치(`CALT.keep[L]`, 없으면 `CALT.levels[L].attempt`, 어느 SIM이든)를 먼저 보고, 새 규칙의 보정·배치 검사를 넘으면 그대로 쓴다. `tools/caltable.mjs --keep <표>`(기본: 지금 표). SIM 8 표는 SIM 7 표를 keep으로 만들었다(L1~60 배치는 모두 그대로). 표 밖 레벨(그 자리 보정)과 `benchlib.timeCal`은 keep 없이.
- 난이도 유지(SIM 8 — 스치기가 안 무는 만큼): 거구 상한 `BRUTE_CAP` 0.4 → 0.55, 일반 L11+ 보스 `BOSS_SPEC.normal.m` 0.55 → 0.565, 어려움(L15+) 판 중 위협 `TAG_THREAT.hard` 1.2 → 1.25, 일반 L11+ 보스 도착 `BOSS_SPEC.normal.c` 1.0 → 1.04(맞붙는 승리가 상한 50%에 붙지 않게). 지킨 줄 판돈 칸은 그대로(20~35%) — 알던 레벨의 게이트 숫자가 바뀌지 않게. 졸개 체력(`GRUNT_HP`)은 SIM 7 그대로.

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
- 분대는 앞 64명을 온전히 그리고 뒤로는 철모 줄을 더해 병력 규모가 보이게. 대형은 시뮬레이션의 분대 몸을 채우는 모서리 둥근 네모(SIM 8 — 옆 끝 그림 = R, 앞뒤 발 = ±0.55R).

## 7. 미룬 것

방패병·화염병, 영웅 쾅이·철순이·딸깍, 도감 화면, 업적, 오늘의 작전, 지역별 보스, 밤의 도시 지역, 정면 승리 포즈.
