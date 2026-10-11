export class VpnLifecycle {
  private sequence: number = 0
  private queue: Promise<void> = Promise.resolve()
  private startedAt: number = 0
  private releaseResources: () => Promise<void>

  constructor(releaseResources: () => Promise<void>) {
    this.releaseResources = releaseResources
  }

  get runTime(): number {
    return this.startedAt
  }

  start(acquireResources: (isCancelled: () => boolean) => Promise<void>, runTime: number): Promise<number> {
    const request = ++this.sequence
    const action = this.queue.then(async (): Promise<number> => {
      if (request !== this.sequence) return 0
      if (this.startedAt !== 0) return this.startedAt
      try {
        await acquireResources(() => request !== this.sequence)
      } catch (err) {
        await this.releaseResources()
        throw err
      }
      if (request !== this.sequence) {
        await this.releaseResources()
        return 0
      }
      this.startedAt = runTime !== 0 ? runTime : Date.now()
      return this.startedAt
    })
    // Each caller still receives its error; the queue must allow a later retry.
    this.queue = action.then(() => {}, () => {})
    return action
  }

  stop(): Promise<void> {
    ++this.sequence
    const action = this.queue.then(async (): Promise<void> => {
      await this.releaseResources()
      this.startedAt = 0
    })
    this.queue = action.then(() => {}, () => {})
    return action
  }
}
