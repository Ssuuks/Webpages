/* GitHub Contents API — 비공개 데이터 저장소를 사용자 토큰으로 읽고 쓴다 */
import { repoConfig, getToken, settings } from './store.js';
import { utf8ToB64, b64ToUtf8 } from './util.js';

const API = 'https://api.github.com';

function headers(json) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const t = getToken();
  if (t) h.Authorization = 'Bearer ' + t;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
function contentsUrl(path) {
  const c = repoConfig();
  return `${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}
export class GhError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
function explain(status, what) {
  if (status === 401) return new GhError(status, `${what}: 토큰이 틀렸거나 만료됐어요. [설정]에서 토큰을 다시 넣으세요.`);
  if (status === 403) return new GhError(status, `${what}: 권한이 없거나 호출 한도를 넘었어요. 토큰에 이 저장소의 Contents 읽기/쓰기 권한이 있는지 확인하세요.`);
  if (status === 404) return new GhError(status, `${what}: 저장소나 파일을 찾지 못했어요. 저장소 이름과 토큰의 저장소 범위를 확인하세요.`);
  if (status === 409) return new GhError(status, `${what}: 저장소가 그사이 바뀌었어요(충돌). 다시 불러온 뒤 커밋하세요.`);
  if (status === 422) return new GhError(status, `${what}: 요청이 거부됐어요(422). 브랜치 이름을 확인하세요.`);
  return new GhError(status, `${what} 실패 (${status})`);
}

export const hasToken = () => !!getToken();

/* 토큰 만료일: GitHub가 응답 헤더로 알려주면 기억한다(브라우저에 노출되지 않으면 설정에서 직접 입력) */
function note(res) {
  try {
    const exp = res.headers.get('github-authentication-token-expiration');
    if (exp) { const d = new Date(exp.replace(' UTC', 'Z').replace(' ', 'T')); if (!isNaN(d)) settings.setTokenExp(d.toISOString().slice(0, 10)); }
  } catch { /* 무시 */ }
  return res;
}

/* 파일 읽기 → { sha, text, json } / 없으면 null */
export async function getFile(path) {
  const c = repoConfig();
  let res;
  try {
    res = await fetch(contentsUrl(path) + '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now(),
      { headers: headers(), cache: 'no-store' });
  } catch { throw new GhError(0, '네트워크에 연결할 수 없어요 (오프라인이면 기기 사본으로 동작합니다)'); }
  note(res);
  if (res.status === 404) return null;
  if (!res.ok) throw explain(res.status, path + ' 불러오기');
  const data = await res.json();
  let text;
  if (data.content && data.encoding === 'base64') text = b64ToUtf8(data.content);
  else if (data.download_url || data.git_url) {          // 1MB 넘는 파일: blob API로
    const b = await fetch(data.git_url, { headers: headers() });
    if (!b.ok) throw explain(b.status, path + ' 불러오기');
    text = b64ToUtf8((await b.json()).content);
  } else text = '';
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { sha: data.sha, text, json };
}

/* 파일 쓰기 → 새 sha */
export async function putFile(path, obj, sha, message, opts = {}) {
  const c = repoConfig();
  const content = opts.b64 != null ? opts.b64 : utf8ToB64(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) + '\n');
  const body = { message, content, branch: c.branch };
  if (sha) body.sha = sha;
  let res;
  try {
    res = await fetch(contentsUrl(path), { method: 'PUT', headers: headers(true), body: JSON.stringify(body) });
  } catch { throw new GhError(0, '네트워크에 연결할 수 없어요. 연결된 뒤 다시 커밋하세요.'); }
  note(res);
  if (!res.ok) throw explain(res.status, path + ' 커밋');
  const out = await res.json();
  return out.content.sha;
}

/* 파일의 sha만 (큰 파일도) */
export async function getSha(path) {
  const c = repoConfig();
  const res = await fetch(contentsUrl(path) + '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now(),
    { headers: { ...headers(), Accept: 'application/vnd.github.object+json' }, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw explain(res.status, path + ' 확인');
  return (await res.json()).sha;
}
/* 바이너리 내려받기 (서류함) → Blob */
export async function getRaw(path) {
  const c = repoConfig();
  let res;
  try {
    res = await fetch(contentsUrl(path) + '?ref=' + encodeURIComponent(c.branch),
      { headers: { ...headers(), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
  } catch { throw new GhError(0, '네트워크에 연결할 수 없어요'); }
  if (!res.ok) throw explain(res.status, '파일 내려받기');
  return res.blob();
}
export async function deleteFile(path, message) {
  const c = repoConfig();
  const sha = await getSha(path);
  if (!sha) return false;
  const res = await fetch(contentsUrl(path), { method: 'DELETE', headers: headers(true), body: JSON.stringify({ message, sha, branch: c.branch }) });
  if (!res.ok) throw explain(res.status, path + ' 삭제');
  return true;
}

/* 저장소 접근 확인 */
export async function checkRepo() {
  const c = repoConfig();
  let res;
  try {
    res = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: headers(), cache: 'no-store' });
  } catch { throw new GhError(0, '네트워크에 연결할 수 없어요'); }
  note(res);
  if (!res.ok) throw explain(res.status, '저장소 확인');
  const r = await res.json();
  return { private: r.private, full: r.full_name, canPush: !!(r.permissions && r.permissions.push), defaultBranch: r.default_branch };
}

/* 커밋 기록 (P2) */
export async function listCommits(path, n = 20) {
  const c = repoConfig();
  const res = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(c.branch)}&per_page=${n}`,
    { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw explain(res.status, '커밋 기록');
  return (await res.json()).map((x) => ({ sha: x.sha, message: x.commit.message, date: x.commit.author && x.commit.author.date }));
}
export async function getFileAt(path, ref) {
  const res = await fetch(contentsUrl(path) + '?ref=' + encodeURIComponent(ref), { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw explain(res.status, '이전 버전 불러오기');
  const data = await res.json();
  return JSON.parse(b64ToUtf8(data.content));
}
