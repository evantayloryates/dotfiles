// kNN off the main thread. The bank matrix is shared (SharedArrayBuffer), so
// every worker scans the same memory without copying.
import { parentPort, workerData } from 'node:worker_threads'
import { scan } from './lib/knn-core.mjs'

const { buf, labelsBuf, rows, dims, nLabels } = workerData
const M = new Float32Array(buf)
const rowLabel = new Int32Array(labelsBuf)
parentPort.on('message', ({ id, vecs, k }) => {
  const out = vecs.map((v) => {
    const { top, best } = scan(v, M, rows, dims, rowLabel, nLabels, k)
    return { top, best }
  })
  parentPort.postMessage({ id, out })
})
