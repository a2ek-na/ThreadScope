/*
EXAMPLE 1: NO DEADLOCK
Two threads safely increment a shared counter using a mutex.
This demonstrates correct, sequential lock
 */
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>
#include <string>
#include <chrono>
#include <sstream>
using namespace std;

// --- ThreadScope Helper Code ---
namespace threadscope {
    static auto T0 = chrono::high_resolution_clock::now();
    static mutex log_mutex;
    void log_event(const string& type, const string& lock_name) {
        lock_guard<mutex> guard(log_mutex);
        auto ms = chrono::duration_cast<chrono::milliseconds>(chrono::high_resolution_clock::now() - T0).count();
        stringstream ss_tid;
        ss_tid << this_thread::get_id();
        printf("{\"type\":\"%s\",\"time\":%lld,\"tid\":\"%s\",\"lock\":\"%s\"}\n", type.c_str(), (long long)ms, ss_tid.str().c_str(), lock_name.c_str());
        fflush(stdout);
    }
}
// --- End Helper Code ---

mutex counter_mutex;
int shared_counter = 0;

void increment_worker(int id) {
    printf("[Worker %d] Started.\n", id);
    for (int i = 0; i < 5; ++i) {
        threadscope::log_event("lock_acquire_attempt", "SharedCounterMutex");
        counter_mutex.lock();
        threadscope::log_event("lock_acquired", "SharedCounterMutex");

        // Critical Section
        shared_counter++;
        printf("[Worker %d] Incremented counter to %d.\n", id, shared_counter);
        fflush(stdout);
        
        // Simulate some work
        this_thread::sleep_for(chrono::milliseconds(50));

        threadscope::log_event("lock_released", "SharedCounterMutex");
        counter_mutex.unlock();

        // Sleep outside the lock to allow other threads to run
        this_thread::sleep_for(chrono::milliseconds(20));
    }
    printf("[Worker %d] Finished.\n", id);
}

int main() {
    printf("--- No Deadlock Example ---\n");
    fflush(stdout);

    thread t1(increment_worker, 1);
    thread t2(increment_worker, 2);

    t1.join();
    t2.join();

    printf("--- Final counter value: %d ---\n", shared_counter);
    fflush(stdout);

    return 0;
}
