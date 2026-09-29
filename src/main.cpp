#include <iostream>
#include <vector>
#include <numeric>
#include "app.hpp"
#include "fastlog.hpp"
#include "mathcore.hpp"
#include "stringutil.hpp"

int main(int argc, char* argv[]) {
    // 1. Using Vendor Header-only Library (vendor/fastlog/include)
    fastlog::info("Application starting with folder-based compilation...");

    // 2. Using Application Source & Header (src/app.cpp & src/app.hpp)
    app::Application myApp("Folder-Based C++ Engine");
    myApp.run();

    std::vector<int> numbers = { 10, 20, 30, 40, 50 };
    int sum = std::accumulate(numbers.begin(), numbers.end(), 0);
    std::cout << "Sum of numbers: " << sum << "\n";

    // 3. Using Vendor Precompiled Static Library (vendor/mathcore/lib/mathcore.lib)
    std::cout << "\n--- Precompiled Static Library Demo (vendor/mathcore) ---\n";
    std::cout << "Factorial of 5:  " << mathcore::factorial(5) << "\n";
    std::cout << "GCD(48, 18):     " << mathcore::gcd(48, 18) << "\n";
    std::cout << "2^10:            " << mathcore::power(2.0, 10) << "\n";
    std::cout << "---------------------------------------------------------\n";

    // 4. Using Vendor Dynamic Library DLL (vendor/stringutil/bin/stringutil.dll)
    std::cout << "\n--- Dynamic Library DLL Demo (vendor/stringutil) --------\n";
    const char* original = "hello from dynamic vendor dll!";
    std::cout << "Original text:   " << original << "\n";
    std::cout << "Uppercase (DLL): " << stringutil_to_upper(original) << "\n";
    std::cout << "Length (DLL):    " << stringutil_length(original) << "\n";
    std::cout << "---------------------------------------------------------\n\n";

    fastlog::success("All application and vendor library types (header, static, DLL) ran successfully!");

    if (argc > 1) {
        std::cout << "\nCommand Line Arguments:\n";
        for (int i = 1; i < argc; ++i) {
            std::cout << "  [" << i << "] " << argv[i] << "\n";
        }
    }

    return 0;
}
