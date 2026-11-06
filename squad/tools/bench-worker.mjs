/* tools/bench.mjs의 워커: 일감을 받아 benchlib.runJob으로 돌리고 결과를 돌려준다 */
import { parentPort } from 'node:worker_threads';
import { runJob } from './benchlib.mjs';

parentPort.on('message', async ({ id, job }) => {
  const t = performance.now();
  try {
    const out = await runJob(job);
    parentPort.postMessage({ id, out, ms: performance.now() - t });
  } catch (e) {
    parentPort.postMessage({ id, err: String((e && e.stack) || e), ms: performance.now() - t });
  }
});
