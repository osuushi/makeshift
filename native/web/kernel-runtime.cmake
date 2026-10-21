# The calculator side module contains Makeshift code. OCCT and the shared C++
# runtime live in a separately hashed main module. Keep its source app-independent.
function(web_kernel_runtime target)
  option(MAKESHIFT_WEB_PROFILING "Retain WASM function names for opt-in CPU sampling" OFF)
  get_target_property(kernel_libraries ${target} LINK_LIBRARIES)
  set_property(TARGET ${target} PROPERTY LINK_LIBRARIES "")
  target_compile_options(${target} PRIVATE -fPIC)
  target_compile_definitions(${target} PRIVATE MAKESHIFT_WEB_ENTRY=makeshift_calculate)
  target_link_options(${target} PRIVATE ${exception_flag} -sSIDE_MODULE=2
    "-sEXPORTED_FUNCTIONS=['_makeshift_calculate']")
  set_target_properties(${target} PROPERTIES SUFFIX ".wasm")

  add_executable(makeshift-occt ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/runtime.cpp)
  # The opt-in benchmark bridge is absent from the shipping runtime.
  if(MAKESHIFT_KERNEL_GPU_SEARCH)
    target_sources(makeshift-occt PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/candidate-bridge.cpp)
  endif()
  target_compile_options(makeshift-occt PRIVATE ${exception_flag})
  target_link_options(makeshift-occt PRIVATE
    --no-entry ${exception_flag} -sMAIN_MODULE=2 -sMODULARIZE=1 -sEXPORT_ES6=1
    -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648
    -sSTACK_SIZE=4194304 "-sEXPORTED_RUNTIME_METHODS=['ccall','stringToNewUTF8','ENV']"
    "-sEXPORTED_FUNCTIONS=['_calculate','_malloc','_free']")
  target_link_libraries(makeshift-occt PRIVATE "$<TARGET_FILE:${target}>" ${kernel_libraries})
  add_dependencies(makeshift-occt ${target})
  if(MAKESHIFT_WEB_PROFILING)
    # Keep function names, without relocating unused DWARF custom sections.
    # Pinned wasm-ld crashes in CustomSection::writeTo on those relocations.
    target_link_options(${target} PRIVATE --profiling-funcs -Wl,--strip-debug)
    target_link_options(makeshift-occt PRIVATE --profiling-funcs -Wl,--strip-debug)
  endif()
  set_target_properties(makeshift-occt PROPERTIES SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
  foreach(config DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
    set_target_properties(makeshift-occt PROPERTIES
      RUNTIME_OUTPUT_DIRECTORY_${config} ${CMAKE_BINARY_DIR}/bin)
  endforeach()
endfunction()
