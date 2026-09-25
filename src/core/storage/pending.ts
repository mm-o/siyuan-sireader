export const createPendingTaskRegistry = () => {
  const tasks = new Set<Promise<unknown>>()
  const track = <T>(task: Promise<T>): Promise<T> => {
    const tracked = Promise.resolve(task).finally(() => tasks.delete(tracked))
    tasks.add(tracked)
    void tracked.catch(() => undefined)
    return tracked
  }
  const drain = async () => {
    const errors: unknown[] = []
    while (tasks.size) {
      const results = await Promise.allSettled([...tasks])
      errors.push(...results.filter(result => result.status === 'rejected').map(result => (result as PromiseRejectedResult).reason))
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      const error = new Error(`Pending task drain failed (${errors.length} errors)`) as Error & { errors?: unknown[] }
      error.errors = errors
      throw error
    }
  }
  return { track, drain, size: () => tasks.size }
}

const pendingTasks = createPendingTaskRegistry()
export const trackPending = pendingTasks.track
export const drainPendingTasks = pendingTasks.drain
