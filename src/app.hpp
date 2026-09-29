#pragma once
#include <string>

namespace app {
    class Application {
    public:
        Application(const std::string& name);
        void run() const;

    private:
        std::string name_;
    };
}
