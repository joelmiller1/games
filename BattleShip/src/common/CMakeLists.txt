# OpenCV Test Project
INCLUDE( CMakePackageConfigHelpers )
cmake_minimum_required(VERSION 3.3.0 FATAL_ERROR)
PROJECT( "Common" )


# Set compiler flags
set (CMAKE_CXX_STANDARD 20)
SET( CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${warnings} ${cppFlags}" )
SET( CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${warnings}" )
MESSAGE( STATUS "CMAKE_CXX_FLAGS: ${CMAKE_CXX_FLAGS}" )
MESSAGE( STATUS "CMAKE_C_FLAGS  : ${CMAKE_C_FLAGS}" )

if (NOT CMAKE_PROJECT_NAME STREQUAL PROJECT_NAME)
    MESSAGE(STATUS "This project has a top-level one called [${CMAKE_PROJECT_NAME}]")
else()
    MESSAGE(STATUS "This project is a top-level one")
endif()

ADD_LIBRARY(${PROJECT_NAME} STATIC)

set(public_headers
    net_client.h
    net_common.h
    net_connection.h
    net_message.h
    net_server.h
    net_tsqueue.h
    olc_net.h
    olcPixelGameEngine.h
)

#target_sources(${PROJECT_NAME} PRIVATE ${public_headers} )

target_include_directories(${PROJECT_NAME}
    PRIVATE
        # where the library itself will look for its internal headers
        ${CMAKE_CURRENT_SOURCE_DIR}
    PUBLIC
        # where top-level project will look for the library's public headers
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}>
        # where external projects will look for the library's public headers
        $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)

# Add exe
ADD_EXECUTABLE( ${PROJECT_NAME} ${sources} ${headers} ${common})
target_include_directories(${PROJECT_NAME} PRIVATE "${CMAKE_SOURCE_DIR}/common/")

# boost
set(Boost_USE_STATIC_LIBS OFF) 
set(Boost_USE_MULTITHREADED ON)  
set(Boost_USE_STATIC_RUNTIME OFF) 
target_include_directories(${PROJECT_NAME} PRIVATE "C:/repos/libs/boost_1_80_0")




