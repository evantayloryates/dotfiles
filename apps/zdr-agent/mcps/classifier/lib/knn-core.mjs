// Brute-force nearest-neighbour scan over unit vectors (dot product = cosine).
// Shared by the main thread and the worker pool. One pass returns the k
// nearest rows and the best similarity per label.

export function scan(q, M, rows, dims, rowLabel, nLabels, k, exclude = -1) {
  const best = new Float32Array(nLabels).fill(-1)
  const topS = new Float32Array(k).fill(-2)
  const topR = new Int32Array(k).fill(-1)
  for (let r = 0; r < rows; r++) {
    if (r === exclude) continue
    const off = r * dims
    let s = 0
    let d = 0
    for (; d + 3 < dims; d += 4) s += M[off + d] * q[d] + M[off + d + 1] * q[d + 1] + M[off + d + 2] * q[d + 2] + M[off + d + 3] * q[d + 3]
    for (; d < dims; d++) s += M[off + d] * q[d]
    const l = rowLabel[r]
    if (s > best[l]) best[l] = s
    if (s > topS[k - 1]) {
      let i = k - 1
      while (i > 0 && topS[i - 1] < s) {
        topS[i] = topS[i - 1]
        topR[i] = topR[i - 1]
        i--
      }
      topS[i] = s
      topR[i] = r
    }
  }
  const top = []
  for (let i = 0; i < k; i++) if (topR[i] >= 0) top.push([topS[i], topR[i]])
  return { top, best }
}
