export class Ticker {
  #fpsCap?: number
  #frameId = 0

  constructor(onTick: (deltaTime: number) => void, fps?: number) {
    this.#fpsCap = fps !== undefined && fps > 0 ? fps : undefined

    let prevTime = performance.now()
    let lagSeconds = 0

    const step = (timestamp: number) => {
      try {
        const dt = (timestamp - prevTime) / 1000
        if (dt > 0) {
          const fpsCap = this.#fpsCap
          if (fpsCap !== undefined && fpsCap > 0) {
            lagSeconds += dt
            const fixedStep = 1 / fpsCap
            if (lagSeconds >= fixedStep) {
              onTick(fixedStep)
              if (lagSeconds >= fixedStep * 2) {
                onTick(dt)
                lagSeconds = 0
              } else {
                lagSeconds -= fixedStep
              }
            }
          } else {
            onTick(dt)
          }
        }
      } catch (err) {
        // just log error, keep loop alive
        console.error('[Ticker] onTick threw an error:', err)
      } finally {
        prevTime = timestamp
        this.#frameId = requestAnimationFrame(step)
      }
    }

    this.#frameId = requestAnimationFrame(step)
  }

  setFpsCap(fps: number) {
    this.#fpsCap = fps > 0 ? fps : undefined
  }

  disableFpsCap() {
    this.#fpsCap = undefined
  }

  remove() {
    cancelAnimationFrame(this.#frameId)
  }
}
