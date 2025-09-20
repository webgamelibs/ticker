/** @jest-environment jsdom */
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
        // Mock performance.now():
        // Only used to seed prevTime at construction; later dt uses RAF timestamps.
        performance.now = jest.fn(() => currentTime);
        // Mock RAF/CAF with a simple registry.
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
        // Restore globals.
        performance.now = originalPerfNow;
        global.requestAnimationFrame = originalRAF;
        global.cancelAnimationFrame = originalCAF;
    });
    /**
     * Advance exactly one scheduled frame by ms.
     * Picks the oldest registered RAF callback, removes it from the queue,
     * advances the clock, then invokes it with the new timestamp.
     * If the callback schedules the next RAF (expected), it will be added to the map.
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
     * Convenience: advance multiple frames by a fixed step each time.
     */
    function advanceFrames(count, msPerFrame) {
        for (let i = 0; i < count; i++) {
            advanceOneFrame(msPerFrame);
        }
    }
    test('uncapped: onTick is called 1:1 with raw dt (seconds)', () => {
        const onTick = jest.fn();
        const ticker = new Ticker(onTick);
        // First frame: 16ms -> dt=0.016
        advanceOneFrame(16);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.016);
        // Second frame: +33ms -> dt=0.033
        advanceOneFrame(33);
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(onTick).toHaveBeenLastCalledWith(0.033);
        ticker.remove();
    });
    test('fpsCap: when lag >= fixedStep, call once with fixedStep; if lag >= 2*fixedStep, call again with raw dt and reset lag', () => {
        const onTick = jest.fn();
        // fps=10 -> fixedStep=0.1s
        const ticker = new Ticker(onTick, 10);
        // Single long frame of 300ms:
        // 1) lag=0.3 >= 0.1 -> onTick(0.1)
        // 2) lag still >= 2*0.1 -> onTick(0.3), lag resets to 0
        advanceOneFrame(300);
        expect(onTick).toHaveBeenNthCalledWith(1, 0.1);
        expect(onTick).toHaveBeenNthCalledWith(2, 0.3);
        expect(onTick).toHaveBeenCalledTimes(2);
        ticker.remove();
    });
    test('fpsCap: if fixedStep <= lag < 2*fixedStep, call once with fixedStep and keep remaining lag', () => {
        const onTick = jest.fn();
        // fps=20 -> fixedStep=0.05s
        const ticker = new Ticker(onTick, 20);
        // 70ms: lag=0.07 >= 0.05 -> onTick(0.05); remaining lag=0.02
        advanceOneFrame(70);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.05);
        // +30ms: lag=0.02 + 0.03 = 0.05 -> onTick(0.05)
        advanceOneFrame(30);
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(onTick).toHaveBeenLastCalledWith(0.05);
        ticker.remove();
    });
    test('setFpsCap/disableFpsCap: change cap at runtime and then remove it', () => {
        const onTick = jest.fn();
        const ticker = new Ticker(onTick); // uncapped
        // uncapped 10ms -> dt=0.01
        advanceOneFrame(10);
        expect(onTick).toHaveBeenLastCalledWith(0.01);
        // enable cap: fps=5 -> fixedStep=0.2
        ticker.setFpsCap(5);
        // 250ms: lag=0.25 -> onTick(0.2) once; 0.25>=0.4 is false -> no second call
        onTick.mockClear();
        advanceOneFrame(250);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.2);
        // disable cap
        ticker.disableFpsCap();
        // uncapped 40ms -> dt=0.04
        onTick.mockClear();
        advanceOneFrame(40);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(0.04);
        ticker.remove();
    });
    test('remove: after remove(), no further ticks are delivered', () => {
        const onTick = jest.fn();
        const ticker = new Ticker(onTick);
        // Process one frame then remove immediately.
        advanceOneFrame(16);
        const callsAfterFirst = onTick.mock.calls.length;
        ticker.remove();
        // Attempt to advance further: there should be nothing to run.
        // If any RAF remained, advancing would invoke callbacks; we expect none.
        expect(() => advanceOneFrame(16)).toThrow('no RAF callback to advance');
        expect(onTick).toHaveBeenCalledTimes(callsAfterFirst);
    });
    test('onTick throws: loop continues and logs to console.error', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const onTick = jest
            .fn()
            .mockImplementationOnce(() => { throw new Error('boom'); }) // throw on first frame
            .mockImplementation(() => { }); // subsequent frames succeed
        const ticker = new Ticker(onTick);
        // First frame triggers the throw
        advanceOneFrame(50); // ~0.05s
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalled(); // error is logged
        // Loop must still be alive and schedule next frame
        advanceOneFrame(16);
        expect(onTick).toHaveBeenCalledTimes(2);
        ticker.remove();
        consoleSpy.mockRestore();
    });
    test('after an exception, prevTime is updated so next dt is not inflated', () => {
        let secondDt;
        const onTick = jest
            .fn()
            .mockImplementationOnce(() => { throw new Error('boom'); }) // first frame throws
            .mockImplementation((dt) => { secondDt = dt; }); // capture dt on second frame
        const ticker = new Ticker(onTick);
        // First frame throws; prevTime should still be updated in finally.
        advanceOneFrame(40); // ~0.04s
        // Next frame should use the current frame as the baseline, not accumulate.
        advanceOneFrame(16);
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(secondDt).toBeGreaterThan(0.010);
        expect(secondDt).toBeLessThan(0.030);
        ticker.remove();
    });
});
//# sourceMappingURL=ticker.test.js.map