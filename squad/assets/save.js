/* 저장 2 — 진행 중인 판 이어하기, 다른 기기로 옮기는 백업 코드.
   localStorage가 막혀 있으면 이 판(탭) 동안만 메모리에 기억한다. */

const RUN_KEY = 'squad.run.v1';
const PREFIX_Z = 'SQD1.';   // 압축(deflate-raw) + base64url
const PREFIX_P = 'SQD0.';   // 압축을 못 쓰는 브라우저용(그대로 base64url)
let runMemory = null;
let runMemoryOnly = false;   // 저장소에 못 쓰고 메모리에만 있는 판

/* ---------- 진행 중인 판 ---------- */
export function saveRun(snap) {
  const raw = JSON.stringify(snap);
  runMemory = raw;
  try { localStorage.setItem(RUN_KEY, raw); runMemoryOnly = false; return true; } catch { runMemoryOnly = true; return false; }
}

export function loadRun() {
  // 메모리 사본은 저장소를 못 쓸 때만 본다(다른 탭이 지운 판을 되살리지 않게)
  let raw;
  try { raw = localStorage.getItem(RUN_KEY) ?? (runMemoryOnly ? runMemory : null); } catch { raw = runMemory; }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || !o.state || !o.L) return null;
    return o;
  } catch { return null; }
}

export function clearRun() {
  runMemory = null;
  runMemoryOnly = false;
  try { localStorage.removeItem(RUN_KEY); } catch { /* 무시 */ }
}

/* ---------- 백업 코드 ---------- */
function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
/* 오타를 잡는 짧은 검사값(FNV-1a 32비트, 앞 6자리) */
function check(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).padStart(7, '0').slice(-6);
}

export async function encodeBackup(data) {
  const json = JSON.stringify({ app: 'squad', at: Date.now(), data });
  const bytes = new TextEncoder().encode(json);
  let body;
  let prefix = PREFIX_P;
  if (typeof CompressionStream !== 'undefined') {
    try { body = toB64url(await pipe(bytes, new CompressionStream('deflate-raw'))); prefix = PREFIX_Z; } catch { body = null; }
  }
  if (!body) body = toB64url(bytes);
  return `${prefix}${body}.${check(body)}`;
}

/* 붙여넣은 코드 → 저장 데이터. 틀리면 이유를 담은 Error */
export async function decodeBackup(code) {
  const text = String(code || '').replace(/\s+/g, '');
  const m = /^(SQD[01])\.([A-Za-z0-9_-]+)\.([0-9a-z]{6})$/.exec(text);
  if (!m) throw new Error('코드 모양이 맞지 않아요. SQD로 시작하는 코드를 통째로 붙여 넣어 주세요.');
  if (check(m[2]) !== m[3]) throw new Error('코드 일부가 빠졌거나 바뀌었어요. 다시 복사해 주세요.');
  let bytes;
  try { bytes = fromB64url(m[2]); } catch { throw new Error('코드를 읽지 못했어요.'); }
  if (m[1] === 'SQD1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축된 코드를 풀 수 없어요. 최신 브라우저에서 열어 주세요.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  let o;
  try { o = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('코드 안의 내용을 읽지 못했어요.'); }
  if (!o || o.app !== 'squad' || !o.data || typeof o.data !== 'object') throw new Error('숫자부대 돌격의 저장 코드가 아니에요.');
  return { data: o.data, at: o.at };
}
