rmdir /s /q .\cwin64\
cmake -G "Visual Studio 17 2022" -A x64 -S ./src/ -B ./cwin64
start cmake-gui -G "Visual Studio 17 2022" -A x64 -S ./src/ -B ./cwin64

