# OpenCV Test Project
INCLUDE( CMakePackageConfigHelpers )
cmake_minimum_required(VERSION 3.3.0 FATAL_ERROR)
PROJECT( "GettingStarted" CXX )
set (CMAKE_CXX_STANDARD 20)


# Set compiler flags
set (CMAKE_CXX_STANDARD 20)
SET( CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${warnings} ${cppFlags}" )
SET( CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${warnings}" )
set( CMAKE_BUILD_TYPE Release )
MESSAGE( STATUS "CMAKE_CXX_FLAGS: ${CMAKE_CXX_FLAGS}" )
MESSAGE( STATUS "CMAKE_C_FLAGS  : ${CMAKE_C_FLAGS}" )

# dont generate ZERO_CHECK
set(CMAKE_SUPPRESS_REGENERATION true)

FILE( GLOB sources ${CMAKE_SOURCE_DIR}/*.cpp )
FILE( GLOB headers ${CMAKE_SOURCE_DIR}/*.h )

# Add exe
ADD_EXECUTABLE( ${PROJECT_NAME} WIN32 ${sources} ${headers} )

# Set compiler flags
SET( CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${warnings} ${cppFlags}" )
SET( CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${warnings}" )
MESSAGE( STATUS "CMAKE_CXX_FLAGS: ${CMAKE_CXX_FLAGS}" )
MESSAGE( STATUS "CMAKE_C_FLAGS  : ${CMAKE_C_FLAGS}" )

