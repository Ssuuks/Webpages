/* 서류함 — 바우처·QR·탑승권 같은 파일.
   원본은 비공개 저장소 docs/{여행id}/ 에, 기기에는 오프라인 사본(IndexedDB)을 둔다.
   목록(제목·연결된 예약)은 여행 JSON의 documents 배열이라 다른 기기와 함께 동기화된다.
   올리기·지우기는 기기 대기열에 넣었다가 동기화할 때 처리한다(오프라인에서 추가해도 됨). */
import { blobs, kvGet, kvSet } from './store.js';
import { getRaw, putFile, deleteFile, getSha, hasToken } from './github.js';
import { blobToB64 } from './util.js';

export const MAX_BYTES = 20 * 1024 * 1024;
const QKEY = 'docq';
const queue = async () => (await kvGet(QKEY)) || [];
const setQueue = (q) => kvSet(QKEY, q);

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif', 'application/pdf': 'pdf' };
export const isImage = (doc) => /^image\//.test(doc.mime || '') && doc.mime !== 'image/heic';
export const docPath = (tripId, id, ext) => `docs/${tripId}/${id}.${ext}`;

/* 큰 사진은 긴 변 2000px JPEG로 줄인다(1.5MB 이하·QR 캡처는 원본 그대로) */
export async function prepareFile(file) {
  const type = file.type || '';
  if (/^image\/(jpeg|png|webp)$/.test(type) && file.size > 1.5 * 1024 * 1024 && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      if (blob) return { blob, mime: 'image/jpeg', ext: 'jpg' };
    } catch { /* 원본 사용 */ }
  }
  const fromName = (file.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  return { blob: file, mime: type || 'application/octet-stream', ext: EXT[type] || fromName || 'bin' };
}

/* 새 서류 → 목록에 넣을 메타데이터 */
export async function addDoc(tripId, file, { title, linkTo }) {
  const { blob, mime, ext } = await prepareFile(file);
  if (blob.size > MAX_BYTES) throw new Error('20MB보다 큰 파일은 넣을 수 없어요. 사진으로 찍거나 나눠서 넣으세요.');
  const id = 'doc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const path = docPath(tripId, id, ext);
  await blobs.put(path, blob, mime);
  const q = await queue(); q.push({ op: 'put', path, title: title || id }); await setQueue(q);
  return { id, title: title || file.name || '서류', file: path, mime, size: blob.size, linkTo: linkTo || null, addedAt: new Date().toISOString() };
}
export async function removeDoc(doc) {
  await blobs.del(doc.file);
  let q = await queue();
  const pendingPut = q.some((j) => j.op === 'put' && j.path === doc.file);
  q = q.filter((j) => j.path !== doc.file);
  if (!pendingPut) q.push({ op: 'del', path: doc.file });      // 이미 올라간 파일만 저장소에서 지운다
  await setQueue(q);
}
export async function pendingCount() { return (await queue()).length; }

/* 동기화 때: 대기열을 저장소에 반영 */
export async function flushDocs() {
  if (!hasToken() || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const q = await queue();
  if (!q.length) return 0;
  const rest = [];
  let done = 0;
  for (const job of q) {
    try {
      if (job.op === 'put') {
        const hit = await blobs.get(job.path);
        if (!hit) continue;
        const b64 = await blobToB64(hit.blob);
        try { await putFile(job.path, null, null, `서류 추가: ${job.title}`, { b64 }); }
        catch (e) {
          if (e.status !== 422) throw e;                        // 이미 올라가 있으면 sha를 받아 덮어쓴다
          await putFile(job.path, null, await getSha(job.path), `서류 추가: ${job.title}`, { b64 });
        }
      } else if (job.op === 'del') await deleteFile(job.path, `서류 삭제: ${job.path.split('/').pop()}`);
      done++;
    } catch { rest.push(job); }
  }
  await setQueue(rest);
  return done;
}

/* 열기: 기기 사본 → 없으면 저장소에서 받아 사본을 남긴다 */
export async function loadDoc(doc) {
  const hit = await blobs.get(doc.file);
  if (hit) return hit.blob;
  if (!hasToken()) throw new Error('이 기기에 사본이 없어요. 저장소 연결이 필요해요.');
  if (!navigator.onLine) throw new Error('이 기기에 사본이 없고 오프라인이에요. 온라인일 때 [모두 내려받기]를 해 두세요.');
  const raw = await getRaw(doc.file);
  const blob = new Blob([raw], { type: doc.mime || raw.type || 'application/octet-stream' });
  await blobs.put(doc.file, blob, doc.mime);
  return blob;
}
export async function cachedPaths(docs) {
  const out = new Set();
  for (const d of docs || []) if (await blobs.get(d.file)) out.add(d.file);
  return out;
}
/* 여행 전에: 서류 전부 이 기기에 받아 두기 */
export async function cacheAll(docs, onStep) {
  let ok = 0, fail = 0;
  for (const d of docs || []) {
    try { await loadDoc(d); ok++; } catch { fail++; }
    if (onStep) onStep(ok + fail, docs.length);
  }
  return { ok, fail };
}
export function fmtSize(n) {
  if (n == null) return '';
  return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + 'KB' : (n / 1024 / 1024).toFixed(1) + 'MB';
}
