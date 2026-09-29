#pragma once

#if defined(_WIN32)
  #if defined(STRINGUTIL_EXPORTS)
    #define STRINGUTIL_API __declspec(dllexport)
  #else
    #define STRINGUTIL_API __declspec(dllimport)
  #endif
#else
  #define STRINGUTIL_API
#endif

extern "C" {
    STRINGUTIL_API const char* stringutil_to_upper(const char* input);
    STRINGUTIL_API int stringutil_length(const char* input);
}
