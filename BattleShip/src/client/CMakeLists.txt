# OpenCV Test Project
INCLUDE( CMakePackageConfigHelpers )
cmake_minimum_required(VERSION 3.3.0 FATAL_ERROR)
PROJECT( "Client" )

# Set compiler flags
set (CMAKE_CXX_STANDARD 20)
SET( CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${warnings} ${cppFlags}" )
SET( CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${warnings}" )
MESSAGE( STATUS "CMAKE_CXX_FLAGS: ${CMAKE_CXX_FLAGS}" )
MESSAGE( STATUS "CMAKE_C_FLAGS  : ${CMAKE_C_FLAGS}" )


#These are the files that will appear in the output project (ie, in MSVC, this will be in the vcxproj)
#All cpp files that ought to be compiled in this project must be included here
FILE( GLOB sources ${CMAKE_SOURCE_DIR}/client/*.cpp )
FILE( GLOB common ${CMAKE_SOURCE_DIR}/common/*.h )
Message( STATUS "HEADERS: ${headers}" ) 

# Add exe
ADD_EXECUTABLE( ${PROJECT_NAME} ${sources} ${headers} ${common})
target_include_directories(${PROJECT_NAME} PRIVATE "${CMAKE_SOURCE_DIR}/common/")
target_link_libraries(${PROJECT_NAME} PRIVATE common )

# boost
set(Boost_USE_STATIC_LIBS OFF) 
set(Boost_USE_MULTITHREADED ON)  
set(Boost_USE_STATIC_RUNTIME OFF) 
target_include_directories(${PROJECT_NAME} PRIVATE "C:/repos/libs/boost_1_80_0")




