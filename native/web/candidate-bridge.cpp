#include <emscripten.h>
// Only linked in the opt-in benchmark runtime. The caller remains on its worker;
// the browser main thread never waits. Missing/unavailable bridge means fallback.
EM_JS(int, candidate_search_js, (const float* samples, int count,
    const float* points, int queries, int* result), {
    try {
        return Module['makeshiftSearch']?.(HEAPF32, HEAP32, samples, count, points, queries, result) ? 1 : 0;
    } catch (_) { return 0; }
});
// A real exported WASM trampoline keeps the EM_JS implementation reachable when
// called by the dynamically linked side module under MAIN_MODULE=2 elimination.
extern "C" EMSCRIPTEN_KEEPALIVE int makeshift_search_candidates(const float* samples, int count,
    const float* points, int queries, int* result) {
    return candidate_search_js(samples, count, points, queries, result);
}
