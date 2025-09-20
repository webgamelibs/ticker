# @webgamelibs/ticker

프레임 기반 게임 루프를 간단하게 관리할 수 있는 **Ticker** 클래스입니다.
`requestAnimationFrame` 기반으로 실행되며, 선택적으로 FPS 제한(fps cap)을 적용할 수 있습니다.

## 설치

```bash
yarn add @webgamelibs/ticker
# 또는
npm install @webgamelibs/ticker
```

타입 정의(`.d.ts`)가 포함되어 있으므로 TypeScript에서 바로 사용 가능합니다.

## 사용법

```ts
import { Ticker } from '@webgamelibs/ticker'

const ticker = new Ticker((deltaTime) => {
  // deltaTime: 초 단위 경과 시간 (float)
  console.log(`프레임당 경과시간: ${deltaTime.toFixed(3)}s`)
})

// FPS 제한 적용
ticker.setFpsCap(60)

// FPS 제한 해제
ticker.disableFpsCap()

// 더 이상 필요 없을 때 루프 종료
ticker.remove()
```

### 생성자

```ts
new Ticker(onTick: (deltaTime: number) => void, fps?: number)
```

* **onTick**
  매 프레임마다 호출되는 콜백입니다. `deltaTime`은 **초 단위** 경과 시간입니다.
* **fps (옵션)**
  FPS 제한값. 지정하지 않거나 0 이하의 값을 넣으면 제한 없이 매 프레임 호출됩니다.

### 메서드

| 메서드               | 설명                                               |
| ----------------- | ------------------------------------------------ |
| `setFpsCap(fps)`  | FPS 제한을 동적으로 변경합니다. 0 이하의 값을 넣으면 자동으로 제한이 해제됩니다. |
| `disableFpsCap()` | FPS 제한을 해제합니다.                                   |
| `remove()`        | 내부 `requestAnimationFrame`을 취소하고 Ticker를 종료합니다.  |

## FPS Cap 동작 방식

* FPS 제한이 설정되어 있으면 **고정된 시간 간격(`1 / fps`)**으로만 `onTick`이 호출됩니다.
* 만약 브라우저가 일시적으로 멈춰서(`lag`) 시간이 많이 지났다면, 누락된 스텝만큼 catch-up 호출을 수행합니다.
  lag가 `2 * fixedStep` 이상이면 추가로 한 번 더 `onTick`을 호출하여 게임 로직이 과도하게 늦춰지는 것을 방지합니다.

## 테스트

이 패키지는 [Jest](https://jestjs.io/) 환경에서 테스트됩니다.

```bash
yarn add --dev jest ts-jest @types/jest jest-environment-jsdom
```

간단한 예시 테스트 (전체 예시는 `src/ticker.test.ts` 참고):

```ts
import { Ticker } from './ticker'

test('Ticker는 deltaTime을 onTick에 전달한다', () => {
  const onTick = jest.fn()
  const ticker = new Ticker(onTick)
  
  // requestAnimationFrame 모킹 후 시간 진행 시뮬레이션
  // ...
  
  ticker.remove()
  expect(onTick).toHaveBeenCalled()
})
```

## 라이선스

MIT License
