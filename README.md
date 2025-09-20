# @webgamelibs/ticker

A lightweight **Ticker** class for frame-based game loops.
It uses `requestAnimationFrame` under the hood and optionally supports an FPS cap.

## Installation

```bash
yarn add @webgamelibs/ticker
# or
npm install @webgamelibs/ticker
```

Type definitions (`.d.ts`) are bundled, so it works seamlessly with TypeScript.

## Usage

```ts
import { Ticker } from '@webgamelibs/ticker'

const ticker = new Ticker((deltaTime) => {
  // deltaTime: elapsed time in seconds (float)
  console.log(`Elapsed time per frame: ${deltaTime.toFixed(3)}s`)
})

// Enable FPS cap
ticker.setFpsCap(60)

// Disable FPS cap
ticker.disableFpsCap()

// Stop the loop when no longer needed
ticker.remove()
```

### Constructor

```ts
new Ticker(onTick: (deltaTime: number) => void, fps?: number)
```

* **onTick**
  Callback executed every frame. The `deltaTime` argument is the time passed **in seconds** since the last tick.
* **fps (optional)**
  FPS cap value. If omitted or ≤ 0, the ticker will run uncapped (every animation frame).

### Methods

| Method            | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `setFpsCap(fps)`  | Dynamically set the FPS cap. Passing a value ≤ 0 disables the cap. |
| `disableFpsCap()` | Disables FPS capping, resuming uncapped execution.                 |
| `remove()`        | Stops the internal `requestAnimationFrame` loop and cleans up.     |

## How FPS Cap Works

* When an FPS cap is set, `onTick` is executed at a **fixed step interval (`1 / fps`)**.
* If the browser lags and multiple steps are missed, Ticker will catch up by invoking `onTick` multiple times.
  If the lag exceeds `2 * fixedStep`, an additional call with the full delta time is made to prevent excessive slowdowns.

This design ensures a consistent update rate for game logic while still using `requestAnimationFrame` for smooth rendering.

## Error Handling

* If `onTick` throws, the error is logged via `console.error` but the loop **keeps running**.
* `prevTime` is always updated in `finally`, so the next `deltaTime` is not inflated by the failed frame.

```ts
const ticker = new Ticker(() => {
  throw new Error('Test error')
})
// The error is logged, but the game loop continues.
```

## Handling Large deltaTime After Tab Switch

`requestAnimationFrame` pauses or slows in inactive tabs, which may produce very large `deltaTime` values once the tab becomes active again.
Ticker does not clamp these values by default — clamp manually if needed:

```ts
const MAX_DT = 1 / 15 // Clamp to 15 FPS minimum
const ticker = new Ticker((dt) => {
  update(Math.min(dt, MAX_DT))
})
```

## Testing

This package is tested with [Jest](https://jestjs.io/).

```bash
yarn add --dev jest ts-jest @types/jest jest-environment-jsdom
```

Minimal example:

```ts
import { Ticker } from './ticker'

test('Ticker passes deltaTime to onTick', () => {
  const onTick = jest.fn()
  const ticker = new Ticker(onTick)

  // Mock requestAnimationFrame and advance time manually here...
  
  ticker.remove()
  expect(onTick).toHaveBeenCalled()
})
```

For a full-featured test suite (including FPS cap scenarios and cancellation), see `src/ticker.test.ts`.

## License

MIT License
