cmake_minimum_required(VERSION 3.20)
project(makeshift_solver LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_path(EIGEN_INCLUDE_DIR Eigen/Core PATH_SUFFIXES eigen3 REQUIRED)
find_path(BOOST_INCLUDE_DIR boost/graph/adjacency_list.hpp REQUIRED)
if(NOT DEFINED PLANEGCS_SOURCE)
  message(FATAL_ERROR "Run npm run setup:native to prepare pinned PlaneGCS sources")
endif()
add_library(planegcs STATIC
  ${PLANEGCS_SOURCE}/GCS.cpp ${PLANEGCS_SOURCE}/Geo.cpp
  ${PLANEGCS_SOURCE}/Constraints.cpp ${PLANEGCS_SOURCE}/SubSystem.cpp
  ${PLANEGCS_SOURCE}/qp_eq.cpp)
target_include_directories(planegcs SYSTEM PUBLIC
  ${PLANEGCS_SOURCE} ${EIGEN_INCLUDE_DIR} ${BOOST_INCLUDE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR})
if(EMSCRIPTEN)
  target_compile_options(planegcs PRIVATE -fexceptions)
endif()
add_executable(makeshift-solver main.cpp)
target_link_libraries(makeshift-solver PRIVATE planegcs)
set_target_properties(makeshift-solver PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
foreach(config Debug Release RelWithDebInfo MinSizeRel)
  string(TOUPPER ${config} config_upper)
  set_target_properties(makeshift-solver PROPERTIES RUNTIME_OUTPUT_DIRECTORY_${config_upper} ${CMAKE_BINARY_DIR}/bin)
endforeach()

if(EMSCRIPTEN)
  include(../web/calculator.cmake)
  web_calculator(makeshift-solver)
endif()
