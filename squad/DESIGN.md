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

D = 지금 분대 화력(dps). 분대 최대 3명, 병과마다 1명. 같은 병과를 또 얻으면 그 특수병의 레벨이 오른다(SIM 9, Lv3까지 — `UNITS[k].lv`: 의무병 60·70·80%, 저격수 1.2·0.9·0.7초·0.35·0.42·0.5D, 로켓병 2.4·2.0·1.7초·반경 2.2·2.6·3.0m). Lv3에서 또 얻거나 자리·호위 병사가 모자라면 병사 +max(5, nice(0.12N)). 나비·보리의 짝 효과는 짝 특수병 레벨만큼 ×1·×1.25·×1.5(`SYNERGY`), 회복 풀 몫 상한 0.9(`SHARE_MAX`), 저격수·로켓병의 Lv1 위 레벨마다 보스전 추가 피해 한도 +2%p(`SP_LV_CAP`).

- 얻기: **철창**(L5+, 쉼 청크에 확률 0.5, 지원병 상자의 0.35를 철창으로, 소개 레벨엔 반드시, L5~8은 레벨마다 하나 이상) — 쏴서 부수면 합류. **금색 게이트**(L9+, 줄당 확률 0.45, 레벨당 최대 2줄, 마지막·1칸·모두 나쁜 줄과 가장 나쁜 칸이 제자리(x=0) 칸인 줄 제외) — 가장 나쁜 칸을 `+v`와 병과로 바꾼다. v = max(3, 가장 좋은 다른 칸 결과 − 1.3·N)이라 '병사 조금 덜 + 특수병'의 진짜 선택이 된다. 금색 칸은 총알이 통과(쏴서 못 올림). 특수병 배치에는 별도 난수 흐름을 써서 기존 배치를 바꾸지 않는다. SIM 9: 수·자리·확률은 SIM 8 그대로(억지로 늘리지 않는다)이고, 병과만 '바로 앞과 다른 병과' 규칙 없이 열린 병과 중 무작위(같은 rand 한 번) — 같은 병과가 두 번 나오면 두 번째는 레벨 업.
- 잃기: 한 번에 max(3, ceil(15%·N)) 이상 잃으면(게이트·톱날 제외) 가장 늦게 온 특수병이 쓰러진다. 내려찍기를 맞으면 매번 하나. 병사가 4×특수병 수보다 적으면 가장 늦게 온 특수병이 떠난다. N이 0이면 패배.
- 보스에게 주는 특수병·영웅 피해(뭉치 스킬로 늘어난 총알 피해 포함)는 병사 화력의 +10%(`BONUS_CAP`)까지. 초당 0.1·D씩 최대 1.5초 분량이 쌓이는 예산 `boss.bonus`에서 나간다(스킬을 안 누르는 사람과의 차이를 줄이려고 0.3 → 0.1).
- 결과: 살아남은 특수병 1명당 +3코인.

## 3. 영웅 (`roster.js` HEROES)

| id | 이름 | 합류 | 패시브 | 스킬(쿨 cd초) |
|---|---|---|---|---|
| mungchi | 뭉치 대장 | 레벨 3부터 | 게이트 올리기 ×1.2→1.4 | 돌격 나팔(16): 5초 총알 피해 ×1.12→1.25 |
| bori | 보리 | 레벨 8 클리어 | 손실의 8→18% 회복 풀로 | 괜찮아 주사(20): 최근 손실의 40→55% 즉시 회복 + 2.5초 손실 ×0.5 |
| nabi | 나비 | 별 30개 | 1.8초마다 0.08D→0.13D 직접 저격(저격수가 없을 때; 있으면 저격수 저격 +15→30%), 보스전 추가 피해 한도 +2%p/레벨 | 벌처럼 쏜다(15): 3초 동안 0.375초마다 0.25D→0.35D 저격 8발 |

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
- 렌더러: `formationPlan(n, R, ppm, vf, vb, pb)`(대형 — 합친 병사 구성 `composeSquad`·이어 가기 `nextComp`·줄 배치 `formArrange`·자리 `formPositions`, 단계 표 `TIER`, 기준 `FORM_LIM`. 줄마다 옆 끝 그림 = ±R, 맨 앞·뒷줄 발 = ±(0.55R − `FORM_IN`)), `slotPos`·`heroZ`(특수병·영웅은 무리 뒤, 분대 폭 안)를 내보낸다(테스트가 읽는다). 그림자도 같은 네모. 보스 총알 판(보스 − 1m)을 지난 총알은 보스 그림 뒤에(정렬 항목 k 11) 그린다. 짓밟기(`stomp`)마다 분대 뒤 끝 ~ 보스 발의 길 전체를 0.22초 밝힌다. 독침 고리는 `SPIT_R`.
- 충돌 크기 보기: `renderer.setHitbox(on)`·`renderer.hitbox`·`info.hitbox`, 화면은 `?hitbox=1`·`__squad.hitbox`. `hitShapes`만 그린다(그림과 같은 시간축으로 분대를 보간).
- 배치 유지: `calibrateLevel(key, tries, keep = keepAttempt(key))` — 보정 표에 이미 적힌 배치(`CALT.keep[L]`, 없으면 `CALT.levels[L].attempt`, 어느 SIM이든)를 먼저 보고, 새 규칙의 보정·배치 검사를 넘으면 그대로 쓴다. `tools/caltable.mjs --keep <표>`(기본: 지금 표). SIM 8 표는 SIM 7 표를 keep으로 만들었다(L1~60 배치는 모두 그대로). 표 밖 레벨(그 자리 보정)과 `benchlib.timeCal`은 keep 없이. SIM 9: 배치마다 먼저 새 규칙 그대로, 서 있기만 해도 이기면 같은 배치를 `buildLevel(L, attempt, bare = true)`(빨간 칸 끝 = `cap0`, 특수병은 SIM 8 배치 그대로)로 다시 보정하고, 보스 올리기(`qaBoost`)는 bare에서만 — 표의 `bare`(`CAL_FIELDS`).
- 난이도 유지(SIM 8 — 스치기가 안 무는 만큼): 거구 상한 `BRUTE_CAP` 0.4 → 0.55, 일반 L11+ 보스 `BOSS_SPEC.normal.m` 0.55 → 0.565, 어려움(L15+) 판 중 위협 `TAG_THREAT.hard` 1.2 → 1.25, 일반 L11+ 보스 도착 `BOSS_SPEC.normal.c` 1.0 → 1.04(맞붙는 승리가 상한 50%에 붙지 않게). 지킨 줄 판돈 칸은 그대로(20~35%) — 알던 레벨의 게이트 숫자가 바뀌지 않게. 졸개 체력(`GRUNT_HP`)은 SIM 7 그대로.

SIM 9 약속(파고들기 — 빨간 칸의 높은 끝, 특수병 레벨):

```js
RED_OVER = 0.25, RED_OVER_MIN = 4   // 같은 줄에 파랑 덧셈 칸이 있으면 빨간 덧셈 칸 cap = max(cap0, 파랑 cap 최댓값 + max(4, nice(0.25·ng))) — 아래 redFast가 남긴 칸만
cell.cap0, cell.fast                // 높이기 전 끝(SIM 8 규칙 v + max(10, nice(0.6·ng)))과 빠르기 배수 — MAX 칸에만 있다. step = SIM 8 step / fast
RED_FROM = 5, RED_FAST_MIN = 2, RED_FAST_MAX = 4, redWin(blue, ng) = blue + max(2, ceil(0.05·ng))
focusPass(lv, co, i, j)             // 앞 줄(i−1)을 지날 때까지 기준 봇, 그 뒤 칸 (i, j) 가운데에 서서 몰아 쏘기(영웅 없음) — 지날 때의 값
redFast(lv)                         // buildLevel 끝(bare가 아닐 때): 높인 칸마다 4배로 redWin을 못 넘으면 SIM 8로 되돌리고, 넘으면 넘게 하는 배수(0.5 단위, 2 이상)를 fast로
s.squad.sp      = [{ id, k, cd, lv }]                 // lv 1..SP_LV_MAX(3). 스냅숏에 lv가 없거나 이상하면 1
UNITS[k].lv     = { share | every | dmg | r: [Lv1, Lv2, Lv3] }, unitVal(k, key, lv)   // roster.js
SYNERGY = [1, 1.25, 1.5], synergyOf(lv)              // 짝 특수병 레벨 → 나비 boost·보리 share·heal(heal은 0.95까지) 배수
SHARE_MAX = 0.9, SP_LV_CAP = 0.02, SP_UP_WORTH = 0.6  // 회복 풀 몫 상한, 저격수·로켓병 Lv1 위 레벨당 보스전 한도, 봇이 보는 레벨 업 값(합류의 배수, SIM 8 병사 몫 아래로는 안 본다)
buildLevel(L, attempt, bare)        // bare: 높인 끝·빠른 칸 없이, 특수병 병과도 SIM 8 규칙(바로 앞과 다른 병과) — SIM 8 배치 그대로. 표의 bare(CAL_FIELDS)
```

- 끝을 직접 정한 칸(`o.cap`: 잭팟·생각·위기·보스 직전·지킨 줄의 쏴서 키우는 +)과 파랑 덧셈 칸이 없는 줄은 높이지 않는다. 레벨 생성(`goldenValue`·`holdVal`)은 redFast 전에 끝나고 다가오는 동안 오르는 만큼만 봐서 cap0 아래 — bare 배치 = SIM 8 배치, 그 밖의 배치 = bare + 특수병 병과·MAX 칸.
- 합류(`addSpecial`): 같은 병과가 Lv3 아래면 레벨 업(자리·호위 병사 필요 없음, 짝 영웅 게이지 +25%). Lv3인 같은 병과·자리 3명·호위 부족이면 병사 +max(5, nice(0.12N)).
- 이벤트: `spUp {k, lv, id, via, x, z}`, `spFull {k, n, why: 'max'|'full'|'escort', x, z}`, `flip {row, v, cap, x, x0, x1, z}`(빨간 칸이 0을 넘어 파랑이 된 순간, 칸마다 한 번), `capped {row, v, x, z}`(빨간 칸이 끝에 닿음). `s.stats.spUp`·`s.stats.flips`. `stateHash`에 특수병 레벨이 들어간다.
- 렌더러: 높인 빨간 칸·잭팟 칸 윗 띠 위에 `MAX+끝`(좁으면 두 줄, 다 오르면 금빛 `MAX`), flip에 하얀 번쩍임·'역전!'·터짐. 특수병 머리 위 별(레벨 수, Lv3 반짝임), spUp에 'Lv2' 숫자·금빛 반짝임. 화면(main.js): 레벨 업 알림·첫 안내, HUD 칩 'Lv2'·'Lv3', 일시정지 판의 지금 수치, 결과 화면 '빨간 게이트 역전 n번'.
- 측정: 빠르기를 그대로 둔 첫 시도는 몰아 쏴도 파란 끝을 넘는 칸이 0개였다(MAX가 거짓말). 마지막 규칙은 L5~60에 MAX 칸 12개쯤, 몰아 쏘면 모두 파란 끝을 넘는다. bench·stakes·fairprobe·영웅 동등성은 마지막 규칙으로 아직 다시 재지 않았다(README).

새 이벤트(`s.ev`): `spGet {k, via:'gate'|'cage', x, z}`, `spFull {k, n, x, z}`, `spLose {k, cause:'hit'|'escort', x, z}`, `snipe {x0, z0, x1, z1, src:'sniper'|'hero', kill}`, `rocket {id, x0, z0, x, z}`, `boom {x, z, r}`, `heal {n, x, z}`, `cageMiss {k, x, z}`, `heroReady {id}`, `heroCast {id}`, `heroEnd {id}`. `kill`에는 `by: 'gun'|'sniper'|'rocket'|'hero'`.

렌더러 API (`createRenderer(canvas)`):
- `view` — 버퍼 픽셀 기준 카메라, `screen` — `{ w, h, col }` CSS 픽셀(조작 계산용)
- `resize(w, h, dpr)`, `draw(s, alpha, dt, prevZ)`, `events(s, ev)`, `reset()`, `setQuality(q)`, `setShake(on)`, `setPreview(on)`, `setFrozen(on)`(일시정지·결과 화면에서 애니메이션 멈춤), `setCard(on)`(레벨 카드 뒤에서 병력 숫자·떠오르는 숫자 숨김), `setHudTarget(x, y)`(코인이 날아갈 CSS 좌표). 글자·아이콘·시트는 `ready` 전에 모두 굽는다 — 준비 뒤 게임 중 굽기는 0이어야 한다(`info.lateBakes`)
- `portrait(id, scale)` → 영웅 얼굴 캔버스(DOM 버튼·영웅 화면용), `icon(name, scale)` → 병과·상자 아이콘 캔버스

엔드게임 약속(ENDGAME.md — `SIM` 9 그대로, 새 상태는 모두 선택 필드):

```js
// 무한모드
ENDLESS                                  // 상수(위협의 기준 화력 10단계, 바닥선, 순성장, 배수, 보스, 코인)
segInfo(k) → { k, loop, biome, tag, L }  // 구간 k(1부터)의 지역·등급·가상 레벨(61~120 — 렌더러·화면은 s.L만 보고 지역 그림·왕관·이름을 고른다)
segMul(k), segFloor(k), segCoins(k), segParams(k)
buildSegment(seed, k, n, tier, attempt)  // 그 순간 병력 n·무기 단계로 만든 구간(레벨 한 판과 같은 모양, z는 0부터). 보정 없음 — 식으로만
newEndless({ seed, start, fire, hero, pet })
s.endless = { seed, seg, bosses, bank, wait, z0 }   // 평범한 JSON. 캠페인 판에는 없다
s.refMul                                 // 보스가 부르는 졸개 체력 배수(무한모드만)
s.boss.dead                              // 무한모드: 쓰러지는 연출 중(ENDLESS.wait초 뒤 nextSegment — 지나간 줄·적·소품을 버리고 이어 붙인다)
endlessCoins(s, bonusPct)                // 적립한 보스 코인 + 처치 10마리당 1(보급 %) + 상자 코인
progress(s)                              // 무한모드는 이번 구간의 출발 자리(z0)부터
// 이벤트: segClear { seg, coins, tag }(보스를 잡음 — 코인 적립), segStart { seg, L }(다음 구간이 이어짐). 'win'은 나오지 않는다

// 회차
expectAt(L, c), expectLoadout(L, c), upgCap(maxL, c), capLoadout(L, c)   // c = 회차(기본 1 — 1회차는 예전 그대로)
buildLevel(L, attempt, bare, cycle)      // lv.cycle(2부터만 있다). 난수 흐름은 1회차와 같고 골든 패스만 회차의 기대 강화로
prepareLevel(L, cycle)                   // 회차 표(cyctable.js, useCyc) → 없으면 calibrateLevel(key, RUNTIME_TRIES, keep, cycle, fast = true)
lv.fast                                  // 그 자리 보정의 빠른 길(L121+와 같다: 어려운 보스 = H* × popRatio, 배치 검사는 세 자리)
parFor(lv, start, fire, hero, pet), supportFor(lv, own)   // lv.cycle을 따른다
heroEff(lv), heroCapC(cycle, maxL), heroCost(lv ≥ 5)      // roster.js

// 펫
PETS[id] = { name, biome, fx, p: [Lv1, Lv10], … }, petP(id, lv), petCost(lv), EGG, openEgg(pets, rnd)   // roster.js — 뽑기 난수는 시뮬레이션 밖
s.pet = { id, lv, rs(펫 전용 난수), procs, acc, avg?, done?, double? }   // 데려간 판에만 있다(없으면 해시 그대로)
newGame(lv, { pet, petAvg })             // petAvg: 확률 대신 기대값으로 고르게(별 기준용)
petCoinMul(s)                            // '줍줍'이 터졌으면 2
bullet.c(크리티컬) · bullet.r(사거리) · bullet.w(넓게 쏘기로 더한 총알)
// 이벤트: pet { fx, n?, x, z }
```

- 화면(main.js): `run.mode === 'endless'`·`run.cycle`·`run.pet`. 이어하기 스냅숏에 `mode`·`cycle`. 무한모드 정산은 `settleEndless`(전멸·포기·다시 시작 — `lastRunId`로 한 번만). 렌더러: `petFace(id, scale)`, 정렬 항목 13(펫), 'boss' 이벤트에 앞 보스의 쓰러지는 연출을 지운다. 다음 지역 그림은 구간이 시작될 때 그다음 구간 것을 쉬는 틈에 굽는다(`prepBiome`).
- 빨간 칸의 'MAX+끝' 표(`maxTag`)는 그리지 않는다(사용자 판단) — 규칙·이벤트는 그대로.
- 탄종(ARSENAL.md — `SIM` 9 그대로, 선택 필드): `AMMO[id] = { name, stars, dmg?, range?, pierce?, splash?, r?, slow?, T? }`·`ammoOpen(id, stars)`·`ammoText(id)`(roster.js), `newGame(lv, { ammo })` → `s.ammo`(보통탄이면 없다), `bullet.r`(사거리), `foe.slowT`(이 시각까지 느리다), `parFor(lv, start, fire, hero, pet, ammo)`, 이벤트 `pierce { x, z0, z1 }`·`splash { x, z, r, n }`. 저장 `ammo: { sel, seen }`(열림은 `totalStars`로 센다).
- 갈림길(무한모드만): `s.divs = [{ id, z0, z1, risk(±1 — 벽이 있는 쪽), wall(벽 prop id), seen? }]`(없는 판에는 필드도 없다), `divAt(s, lead)`·`divPad(d, z, R)`·`FORK`·`FORK_TAPER`·`FORK_WALL`, `prop.fork`, 이벤트 `fork { z, risk, kind }`(45m 앞 한 번 — kind 'wall'|'horde'). 좀비 떼 갈림길은 `d.kind = 'horde'`, `d.wall = 0`, `d.hp`(떼의 체력 합), 떼의 좀비에는 `f.fork`, `hitShapes`의 `div`. 봇은 `steer`가 20m 앞부터 한쪽을 고른다(`divSteer`). 렌더러 `drawDivider`.
- 정예 좀비(무한모드 + 캠페인 L11+/L21+ — SIM 10, `placeElites`·`UNLOCK.toxic`·`UNLOCK.split`·`ELITE_WAVE`·`ELITE[k].nL`): `f.elite = 'toxic' | 'split'`(졸개 몸 — 종류별 코드는 그대로 졸개로 본다), `ELITE`, `makeElites`(`spawnWave` 끝, `p.endless`일 때만 난수를 쓴다), `eliteDeath`(`hitFoe`에서). 웅덩이 `s.pools = [{ id, x, z, t(예고 남은 초), T, life, hit }]`(없으면 필드도 없다 — 해시 그대로), `poolsUpdate`, `POOL_T`·`POOL_R`·`POOL_LIFE`·`POOL_HIT`, 이벤트 `pool`·`poolOn`·`poolHit`·`split`, `kill.elite`, 잃는 까닭 `'pool'`, `hitShapes`의 `pool`. 갈라진 질주 좀비는 `f.kid`. 봇(`botTarget`)은 웅덩이 옆 자리를 후보에 넣고 밟을 손실을 뺀다.
- 무한모드 속도: `segSpeed(k)` = min(`ENDLESS.speedMax` 1.4, 1 + `speedStep` 0.04·(k−1)) — `segParams(k).speed`에 곱한다.
- 렌더러(그리기만): 총알 모양 몫 `shotCum`(합친 병사 구성), 보스 피해 숫자·체력 75·25% 파편(`bossFeedback`), 특수병 레벨별 선·꼬리·방울, `kill.by`별 처치 연출. `__squad.info` = `renderer.info`.

## 5. 저장

- 진행: 키 `squad.v1` 그대로, v2는 **필드 추가만**(옛 탭이 써도 깨지지 않게). 추가 필드: `v, updated, lastRunId, backupAt, nagged, heroes{sel, lv{}}, codex{foe,unit,hero,biome}, stats{wins,kills,bossKills,maxN,spGot,heroUses,resumes}, set.music, set.autoSkill`. 불러올 때 normalize(값 범위 고치기, 영웅 합류 소급).
- 엔드게임 필드(더하기만): `cycle`(지금 회차), `endSeen`(엔딩 화면을 본 가장 높은 회차), `cyc{ c: { maxL, cur, stars, best, fails } }`(2회차부터의 진행 — 1회차는 옛 필드 그대로, `prog(d, c)`), `upgX{start,fire,coin}`(10단계 위 강화 — 옛 탭이 `upg`를 0~10으로 자르므로 따로 둔다, `upgLv`·`addUpg`), `heroX{id}`(Lv5 위, `heroLvOf`·`addHeroLv`), `endless{best,bestN,runs}`, `pets{own{id:{lv,sh}},sel,eggs,pity,got}`, `tips.endgame`. 끝낸 회차는 저장에서 셈한다(`endedCycles`: 그 회차의 maxL > 60 — 예전에 L60을 넘긴 저장은 1회차를 끝낸 것). 백업 코드는 저장을 통째로 싣기 때문에 새 필드도 그대로 간다(가져오기 비교 표의 '진행'에 회차가 나온다).
- 이어하기: `squad.run.v1` = `{ v:1, sim:SIM, id, at, L, attempt, start, fire, support, hero, par, state }`. 3초마다·일시정지·화면 내릴 때·경기장 입장 때 저장. 결과 정산 뒤 `lastRunId`를 기록하고 지운다(이중 보상 방지). 다시 열면 멈춘 상태로 시작.
- 백업 코드: `save.js`의 `SQD1.` 코드(압축 + 검사값). 넣기 전 비교 표, 덮어쓰기 전 `squad.bak`에 보관해 되돌리기.
- 저장이 막히면 "저장 꺼짐" 표시, 첫 승리 뒤 `navigator.storage.persist()`, 레벨 10 이후 백업 한 번 권하기.

## 6. 그래픽 (도트)

- 낮은 해상도 버퍼(가로 약 190px)에 그리고 CSS `image-rendering: pixelated`로 확대. 원근 축소는 정해진 단계(1, 0.75, 0.5)만 써서 반짝임이 없게.
- 카메라(`render.js` `FIT`·`lensOpt`): 분대 24m 뒤에서 내려다보는 망원. 분대는 화면 높이 70%, 영웅 발은 78% 안(아래 스킬 버튼·화살표·안내를 비운다) — 분대를 아래에 두어 앞을 멀리 보고 미리 조종한다(390×844에서 40m 앞 게이트 폭 25px). 분대 자리의 도트 크기(도로 폭 = 기둥의 90%)는 그대로. 분대 앞 160m쯤까지 그린다(안개 끝 카메라 깊이 `far` 180, 낮은 품질 150): 도로가 화면 17~18% 높이까지 이어지고, 먼 물건은 안개와 함께 세 단계로 짙어진다. 보스전에는 3m 더 뒤·위로 빠진다(분대 70% 안팎·영웅 발 78% 안·보스 머리는 위쪽 HUD 아래). 망원이라 무리 깊이가 화면에서 납작해(390×844 205명 줄 간격 11px) 60명 넘는 무리는 늘 3줄 이상으로 선다(2줄 자리에 병사 아홉 + 분대장 여섯이 들지 않아 69↔70명에서 깜빡이지 않게). 졸개·질주 좀비의 축소 단계는 총알 받는 폭에 맞춘 키(`WORLD_H` 1.17·1.04)로 고른다.
- 지역(10레벨마다, `roster.js` `BIOMES` 순서가 순환): 모래 고개(L1–10), 눈보라 기지(11–20), 무너진 도시(21–30), 버섯 숲(31–40), 용암 협곡(41–50), 한밤 놀이공원(51–60), 반복. 땅·연석 색은 파랑(좋음)·빨강(나쁨)과 ΔE 20 이상, 도로 L* 30~42. 지역마다 언덕 모양(`hills` 모래 언덕·빌딩·둥근 숲·화산·관람차와 천막), 날씨(`weather` 눈·재·포자·불씨·색종이 — 눈송이 풀 40개를 같이 쓴다), 길가 소품 다섯(약 7.5px/m) — `pix/biomes.js`.
- 지역 좀비 옷(`pix/foes.js`, `SKIN[지역][종류]`): 졸개·질주·독침·거구마다 지역 옷 한 벌 + 무리 색 변형 `a`·`b`(`f.seed % 3`). 프레임 수·격자 크기·프레임마다 그림 상자가 기본과 같고, 크기 단계는 종류의 `WORLD_H`(졸개 1.17·질주 1.04 그대로)로 고른다 — 충돌·무는 틈 검사가 지역과 상관없다.
- 지역 보스(`pix/bosses.js`, `SKIN[지역].boss`): 우락이·빙수·와장창·뽀글이·화르륵·곰곰이. 지금 보스와 같은 틀(108×104 → 외곽선 110×106, 11자세, 닻 (55, 105), 걷기 60~74줄 |x−54| ≤ 29 꽉 참 = 총알 받는 몸통 ±1.8m, windup은 치는 것이 y ≤ 20, `rage`·흰 번쩍임·lod 4단계). 정예·대왕(core `levelTag`의 hard·super, 그림만)은 왕관 덧그림(`BOSS_CROWN[시트][자세]` 자리)과 반짝이, 이름 앞말. 효과 색(`BOSS_FX`)은 지역마다, 내려찍기 띠·피격 번쩍임은 빨강 그대로. 등장 띠(0.2~1.6초)는 이름·대사를 쉬는 틈에 미리 그려 둔다.
- 영웅(`pix/heroines.js`): 꼬마 미소녀 셋 — 뭉치(귤빛 단발·장교 모자·확성기), 보리(솜사탕빛 트윈테일·하트 간호모·하트 가방), 나비(긴 민트빛 머리·분홍 나비 리본·긴 총). 뒷모습 16×20(예전보다 2px 큼 — 렌즈 검사는 발을 재므로 그대로), 얼굴 30×30 두 장(미소, 스킬 컷인의 외침).
- 아틀라스: 부팅 때 기본 그림 + 사막(≈0.89M px, 예전처럼 페이지 3장)만 굽고, 다른 지역(좀비 옷·보스·소품 ≈0.81M px, 1024² 한 장 더)은 `renderer.prepBiome(id)`가 그 지역에 가기 전에 쉬는 틈에 굽는다(첫 화면·레벨 카드·이긴 결과 화면, 한 지역씩 차례로). 그리는 쪽은 `atlas.has`로 보고 없으면 기본 시트로 그린다(소품은 비운다) — 그리는 중 굽기 0(`lateBakes`).
- 분대는 합친 병사로 그린다(그리기만 — 시뮬레이션은 그대로): 병사 1 · 분대장 10(`sq10`) · 중장갑 100(`sq100`) · 전차 1000(`sq1000`). 205명 = 중장갑 하나 + 분대장 열 + 병사 다섯(자릿수 그대로에서 줄이 찰 만큼 큰 것을 열로 쪼갠다). 자릿수 그대로도 너무 빽빽한 큰 수는 낮은 단계부터 덜 그린다(어림 — 숫자 말풍선이 정확한 수).
- 대형은 단체 사진: 큰 단계가 앞줄(먼 쪽), 작은 단계가 뒷줄, 줄 안에서는 큰 것이 가운데. 줄마다 양옆 끝이 몸 끝(±R), 줄 간격은 옆 끝 그림이 위아래로 이어질 만큼 — 그린 무리 = 맞는 몸(SIM 8). 한 명씩 늘고 줄 때는 합치기·나누기가 한 걸음에 많아야 한 번(머뭇거림), 합칠 때는 작은 것들이 모여 펑 하고 큰 것이 톡, 나눌 때는 큰 것이 펑 하고 작은 것들이 튀어나온다.

## 7. 미룬 것

방패병·화염병, 영웅 쾅이·철순이·딸깍, 도감 화면·업적·오늘의 작전(하지 않기로 했다 — ENDGAME.md), 정면 승리 포즈, 무한모드 보스 뒤 3택 1 보상(구간 사이 `nextSegment`가 끼울 자리), 펫 등급·펫 레벨 상한의 회차 해제, 무한모드 병력 숫자 줄여 쓰기(상한이 9999라 필요 없었다), 오래 안 간 지역 그림을 아틀라스에서 비우기(지금은 지역을 다 돌면 페이지가 8장까지 는다).
