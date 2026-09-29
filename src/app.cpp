#include "app.hpp"
#include <iostream>

namespace app {
    Application::Application(const std::string& name) : name_(name) {}

    void Application::run() const {
        std::cout << "========================================\n";
        std::cout << "  " << name_ << " is running!\n";
        std::cout << "  C++ Standard Macro: " << __cplusplus << "\n";
        std::cout << "========================================\n";
    }
}
