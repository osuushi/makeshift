// Stable protocol trampoline: implementation lives in the Makeshift side module.
#include <emscripten/emscripten.h>

extern "C" const char* makeshift_calculate(const char* request);

extern "C" EMSCRIPTEN_KEEPALIVE const char* calculate(const char* request) {
    return makeshift_calculate(request);
}
