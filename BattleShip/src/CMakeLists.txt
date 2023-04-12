# OpenCV Test Project
INCLUDE( CMakePackageConfigHelpers )
cmake_minimum_required(VERSION 3.3.0 FATAL_ERROR)
PROJECT( "BattleShip" CXX )
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

# Common Files
#add_library( common INTERFACE )
#add_custom_target( Common SOURCES 
#		common/net_client.h
#		common/net_common.h
#		common/net_connection.h
#		common/net_message.h
#		common/net_server.h
#		common/net_tsqueue.h
#		common/olc_net.h
#		common/olcPixelGameEngine.h
#		)
#set_property( TARGET Common PROPERTY FOLDER "common/")
#
#target_include_directories( common INTERFACE ${CMAKE_SOURCE_DIR}/common/ )
#target_include_directories( common INTERFACE "C:/repos/libs/asio/include")


FILE( GLOB sources ${CMAKE_SOURCE_DIR}/*.cpp )
FILE( GLOB headers ${CMAKE_SOURCE_DIR}/*.h )

# Add exe
ADD_EXECUTABLE( ${PROJECT_NAME} WIN32 ${sources} ${headers} ${Common} )
target_include_directories(${PROJECT_NAME} PRIVATE "C:/repos/libs/asio/include")

#add_subdirectory( ${CMAKE_SOURCE_DIR}/server )
#add_subdirectory( ${CMAKE_SOURCE_DIR}/client )

# Set compiler flags
SET( CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${warnings} ${cppFlags}" )
SET( CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${warnings}" )
MESSAGE( STATUS "CMAKE_CXX_FLAGS: ${CMAKE_CXX_FLAGS}" )
MESSAGE( STATUS "CMAKE_C_FLAGS  : ${CMAKE_C_FLAGS}" )

