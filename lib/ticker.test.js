import { Ticker } from './ticker';
describe('Ticker', () => {
    let currentTime = 0;
    let rafCallbacks;
    let nextId;
    let originalRAF;
    let originalCAF;
    let originalPerfNow;
    beforeAll(() => {
        originalRAF = global.requestAnimationFrame;
        originalCAF = global.cancelAnimationFrame;
        originalPerfNow = performance.now;
    });
    beforeEach(() => {
        currentTime = 0;
        rafCallbacks = new Map();
        nextId = 1;
        // Mock performance.now()
        // Ticker가 생성 시 prevTime을 잡을 때만 사용됩니다.
        // 이후 dt는 RAF timestamp로 계산됩니다.
        performance.now = jest.fn(() => currentTime);
        // Mock RAF/CAF
        global.requestAnimationFrame = ((cb) => {
            const id = nextId++;
            rafCallbacks.set(id, cb);
            return id;
        });
        global.cancelAnimationFrame = ((id) => {
            rafCallbacks.delete(id);
        });
    });
    afterEach(() => {
        jest.clearAllMocks();
        // 원상 복귀
        performance.now = originalPerfNow;
        global.requestAnimationFrame = originalRAF;
        global.cancelAnimationFrame = originalCAF;
    });
    /**
     * 유틸: 한 프레임을 진행한다.
     * 등록된 가장 오래된 콜백 1개를 꺼내 지정 ms만큼 시간이 흐른 시점으로 호출.
     * 호출 중 Ticker가 다음 RAF를 예약하면 map에 새 콜백이 추가됩니다.
     */
    function advanceOneFrame(ms) {
        const first = rafCallbacks.entries().next().value;
        if (!first)
            throw new Error('no RAF callback to advance');
        const [id, cb] = first;
        rafCallbacks.delete(id);
        currentTime += ms;
        cb(currentTime);
    }
    /**
     * 유틸: n 프레임을 연속 진행
     */
    function advanceFrames(count, msPerFrame) {
        for (let i = 0; i < count; i++) {
            advanceOneFrame(msPerFrame);
        }
    }
    test('uncapped: onTick은 dt(초)로 1:1 호출된다', () => {
        const onTick = jest.fn();
        // 생성 시 performance.now()=0으로 prevTime 초기화, 첫 RAF 등록
        const ticker = new Ticker(onTick);
        // 첫 프레임: 16ms 경과 → dt=0.016
        advanceOneFrame(16);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.016);
        // 두 번째 프레임: 추가 33ms 경과 → dt=0.033
        advanceOneFrame(33);
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(onTick).toHaveBeenLastCalledWith(0.033);
        ticker.remove();
    });
    test('fpsCap: fixed step만큼 축적되면 호출되고, lag가 2*step 이상이면 추가로 dt 전체를 한 번 더 호출한다', () => {
        const onTick = jest.fn();
        // fps=10 → fixedStep=0.1s
        const ticker = new Ticker(onTick, 10);
        // 300ms 동안 프레임 1번만 들어오면:
        // 1) lag=0.3 >= 0.1 → onTick(0.1)
        // 2) lag(여전히 0.3)이 2*0.1 이상 → onTick(dt=0.3) 추가 호출, lag=0으로 리셋
        advanceOneFrame(300);
        expect(onTick).toHaveBeenNthCalledWith(1, 0.1);
        expect(onTick).toHaveBeenNthCalledWith(2, 0.3);
        expect(onTick).toHaveBeenCalledTimes(2);
        ticker.remove();
    });
    test('fpsCap: lag가 fixedStep 이상이지만 2*fixedStep 미만이면 한 번만 fixedStep으로 호출한다', () => {
        const onTick = jest.fn();
        // fps=20 → fixedStep=0.05s
        const ticker = new Ticker(onTick, 20);
        // 70ms 경과: lag=0.07 >= 0.05 → onTick(0.05), 남은 lag는 0.02
        advanceOneFrame(70);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.05);
        // 이후 30ms 더 경과: 누적 lag=0.02 + 0.03 = 0.05 → onTick(0.05) 한 번 더
        advanceOneFrame(30);
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(onTick).toHaveBeenLastCalledWith(0.05);
        ticker.remove();
    });
    test('setFpsCap/disableFpsCap: 동적으로 캡 변경 및 해제', () => {
        const onTick = jest.fn();
        const ticker = new Ticker(onTick); // uncapped 시작
        // uncapped 10ms → dt=0.01
        advanceOneFrame(10);
        expect(onTick).toHaveBeenLastCalledWith(0.01);
        // fps=5로 캡 설정 → fixedStep=0.2
        ticker.setFpsCap(5);
        // 250ms 경과: lag=0.25 → onTick(0.2) 1회, 0.25>=0.4는 false라 두 번째는 없음
        onTick.mockClear();
        advanceOneFrame(250);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.2);
        // 캡 해제
        ticker.disableFpsCap();
        // uncapped 40ms → dt=0.04 그대로
        onTick.mockClear();
        advanceOneFrame(40);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.04);
        ticker.remove();
    });
    test('remove: 이후 프레임이 더 이상 호출되지 않는다(취소 확인)', () => {
        const onTick = jest.fn();
        const ticker = new Ticker(onTick);
        // 한 프레임 처리 후 즉시 remove
        advanceOneFrame(16);
        const callsAfterFirst = onTick.mock.calls.length;
        ticker.remove();
        // 더 진행해도 콜백이 호출되지 않아야 함
        // 남아있는 콜백이 있을 수 있으니 에러 없이 종료되게 방어적으로 처리
        if (rafCallbacks.size > 0) {
            // 남은 콜백은 취소되어야 한다. advance를 시도해도 호출되지 않게 확인.
            const sizeBefore = rafCallbacks.size;
            // 취소가 제대로 됐다면 advanceOneFrame를 부르면 에러(콜백 없음)가 나야 함
            expect(() => advanceOneFrame(16)).toThrow();
            expect(rafCallbacks.size).toBe(sizeBefore); // 변화 없음
        }
        expect(onTick).toHaveBeenCalledTimes(callsAfterFirst);
    });
});
//# sourceMappingURL=ticker.test.js.map