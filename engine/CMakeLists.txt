cmake_minimum_required(VERSION 3.16)
project(mechanics LANGUAGES CXX)

file(GLOB ENGINE_SOURCES CONFIGURE_DEPENDS src/*.cpp)
list(REMOVE_ITEM ENGINE_SOURCES
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/src/wasm.cpp")
add_library(mechanics_core STATIC ${ENGINE_SOURCES})
target_compile_features(mechanics_core PUBLIC cxx_std_17)
target_include_directories(mechanics_core PUBLIC src)

add_executable(physics src/main.cpp)
target_link_libraries(physics PRIVATE mechanics_core)

enable_testing()
foreach(suite mechanics conservation rest runtime stability)
  add_executable(test_${suite} tests/${suite}.cpp)
  target_link_libraries(test_${suite} PRIVATE mechanics_core)
  if(MSVC)
    target_compile_options(test_${suite} PRIVATE /UNDEBUG)
  else()
    target_compile_options(test_${suite} PRIVATE -UNDEBUG)
  endif()
  add_test(NAME ${suite} COMMAND test_${suite})
endforeach()
