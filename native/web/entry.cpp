#include <emscripten/emscripten.h>
#include <iostream>
#include <sstream>
#include <string>

int makeshift_cli_main();

#ifndef MAKESHIFT_WEB_ENTRY
#define MAKESHIFT_WEB_ENTRY calculate
#endif

// Reuse the calculator protocol, not a second implementation of its operations.
extern "C" EMSCRIPTEN_KEEPALIVE const char* MAKESHIFT_WEB_ENTRY(const char* request) {
    static std::string result;
    std::istringstream input(std::string(request) + "\n");
    std::ostringstream output;
    auto* previousInput = std::cin.rdbuf(input.rdbuf());
    auto* previousOutput = std::cout.rdbuf(output.rdbuf());
    std::cin.clear();
    std::cout.clear();
    try {
        makeshift_cli_main();
        result = output.str();
    } catch (...) {
        std::cin.rdbuf(previousInput);
        std::cout.rdbuf(previousOutput);
        throw;
    }
    std::cin.rdbuf(previousInput);
    std::cout.rdbuf(previousOutput);
    std::cin.clear();
    std::cout.clear();
    return result.c_str();
}
