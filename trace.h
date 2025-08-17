#ifndef THREADSCOPE_H
#define THREADSCOPE_H

#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <sstream>
#include <mutex>

/**
 * @brief Provides simple, thread-safe logging for the ThreadScope visualizer.
 */
namespace threadscope {

// --- Internal implementation details ---
namespace internal {
    // C++17 inline static ensures a single instance across all translation units.
    // This is the modern way to handle header-only static variables.
    inline static auto T0 = std::chrono::high_resolution_clock::now();
    
    // A global mutex to ensure that log lines (JSON) are printed atomically.
    // This prevents garbled output when multiple threads log simultaneously.
    inline static std::mutex log_mutex;
}

/**
 * @brief An RAII-style lock guard that automatically logs lock events for ThreadScope.
 *
 * When created, it logs a lock attempt and then acquires the lock.
 * When it goes out of scope, it automatically logs the lock release and unlocks the mutex.
 *
 * @example
 * std::mutex my_mutex;
 * {
 * threadscope::ScopedLock lock(my_mutex, "MyMutex"); // Logs attempt, then locks
 * // ... critical section ...
 * } // Lock is automatically released and logged here
 */
class ScopedLock {
public:
    /**
     * @param m The std::mutex to lock.
     * @param name A descriptive name for the lock, used in the visualizer.
     */
    ScopedLock(std::mutex& m, const std::string& name) : mtx(m), lock_name(name) {
        log_event("lock_acquire_attempt");
        mtx.lock();
        log_event("lock_acquired");
    }

    ~ScopedLock() {
        log_event("lock_released");
        mtx.unlock();
    }

    // Disable copying and moving to ensure correct lock management
    ScopedLock(const ScopedLock&) = delete;
    ScopedLock& operator=(const ScopedLock&) = delete;
    ScopedLock(ScopedLock&&) = delete;
    ScopedLock& operator=(ScopedLock&&) = delete;

private:
    std::mutex& mtx;
    std::string lock_name;

    void log_event(const std::string& type) {
        // Lock the internal mutex to ensure this entire block is atomic
        std::lock_guard<std::mutex> guard(internal::log_mutex);
        
        const auto now = std::chrono::high_resolution_clock::now();
        const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - internal::T0).count();
        
        std::stringstream ss_tid;
        ss_tid << std::this_thread::get_id();

        // The JSON format the server expects
        printf(
            "{\"type\":\"%s\",\"time\":%lld,\"tid\":\"%s\",\"lock\":\"%s\"}\n",
            type.c_str(),
            (long long)ms,
            ss_tid.str().c_str(),
            lock_name.c_str()
        );
        fflush(stdout); // Ensure the server gets the message immediately
    }
};

} // namespace threadscope

#endif // THREADSCOPE_H