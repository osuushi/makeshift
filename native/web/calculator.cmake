option(MAKESHIFT_WEB_WASM_EXCEPTIONS "Use native WebAssembly exception instructions" ON)

function(web_calculator target)
  set(exception_flag -fexceptions)
  if(MAKESHIFT_WEB_WASM_EXCEPTIONS)
    set(exception_flag -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0)
  endif()
  # Neither browser exception runtime installs native signal handlers.
  target_compile_options(${target} PRIVATE -UOCC_CONVERT_SIGNALS)
  set_source_files_properties(main.cpp PROPERTIES COMPILE_DEFINITIONS "main=makeshift_cli_main")
  target_sources(${target} PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/entry.cpp)
  target_compile_options(${target} PRIVATE ${exception_flag})
  if(target STREQUAL "makeshift-kernel")
    include(${CMAKE_CURRENT_FUNCTION_LIST_DIR}/kernel-runtime.cmake)
    web_kernel_runtime(${target})
    return()
  endif()
  target_link_options(${target} PRIVATE
    --no-entry ${exception_flag} -sMODULARIZE=1 -sEXPORT_ES6=1
    -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648
    -sSTACK_SIZE=4194304 "-sEXPORTED_RUNTIME_METHODS=['ccall','stringToNewUTF8']"
    "-sEXPORTED_FUNCTIONS=['_calculate','_malloc','_free']")
  set_target_properties(${target} PROPERTIES SUFFIX ".js")
endfunction()
