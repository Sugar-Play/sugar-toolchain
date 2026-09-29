#pragma once
#include <iostream>
#include <string>

namespace fastlog {
    inline void info(const std::string& msg) {
        std::cout << "[VENDOR::fastlog] " << msg << "\n";
    }

    inline void success(const std::string& msg) {
        std::cout << "[VENDOR::fastlog] SUCCESS: " << msg << "\n";
    }
}
