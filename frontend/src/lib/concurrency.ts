// Sliding-window concurrency limiter: keeps at most `limit` workers in flight,
// starting the next item as soon as one finishes. Resolves when all complete.
export function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  return new Promise((resolve) => {
    let cursor = 0
    let active = 0
    let done = 0
    const total = items.length

    if (total === 0) {
      resolve()
      return
    }

    const next = () => {
      while (active < limit && cursor < total) {
        const index = cursor++
        active++
        worker(items[index], index)
          .catch(() => {})
          .finally(() => {
            active--
            done++
            if (done === total) resolve()
            else next()
          })
      }
    }

    next()
  })
}
