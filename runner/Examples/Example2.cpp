/*
EXAMPLE 2: WITH DEADLOCK
Two threads attempt to acquire two mutexes in opposite order,
causing a classic circular dependency deadlock.
 */
#include <iostream>
#include <thread>
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

mutex mutex_A;
mutex mutex_B;

void worker_A_then_B() {
    printf("[Worker A->B] Started.\n");
    
    threadscope::log_event("lock_acquire_attempt", "Mutex_A");
    mutex_A.lock();
    threadscope::log_event("lock_acquired", "Mutex_A");
    printf("[Worker A->B] Acquired Mutex_A.\n");
    fflush(stdout);

    this_thread::sleep_for(chrono::milliseconds(100));

    printf("[Worker A->B] Attempting to acquire Mutex_B...\n");
    fflush(stdout);
    threadscope::log_event("lock_acquire_attempt", "Mutex_B");
    mutex_B.lock(); 
    threadscope::log_event("lock_acquired", "Mutex_B");

    mutex_B.unlock();
    threadscope::log_event("lock_released", "Mutex_B");
    mutex_A.unlock();
    threadscope::log_event("lock_released", "Mutex_A");
    
    printf("[Worker A->B] Finished.\n");
}

void worker_B_then_A() {
    printf("[Worker B->A] Started.\n");

    threadscope::log_event("lock_acquire_attempt", "Mutex_B");
    mutex_B.lock();
    threadscope::log_event("lock_acquired", "Mutex_B");
    printf("[Worker B->A] Acquired Mutex_B.\n");
    fflush(stdout);

    this_thread::sleep_for(chrono::milliseconds(100));

    printf("[Worker B->A] Attempting to acquire Mutex_A...\n");
    fflush(stdout);
    threadscope::log_event("lock_acquire_attempt", "Mutex_A");
    mutex_A.lock(); 
    threadscope::log_event("lock_acquired", "Mutex_A");

    mutex_A.unlock();
    threadscope::log_event("lock_released", "Mutex_A");
    mutex_B.unlock();
    threadscope::log_event("lock_released", "Mutex_B");

    printf("[Worker B->A] Finished.\n");
}

int main() {
    printf("--- Deadlock Example ---\n");
    fflush(stdout);

    thread t1(worker_A_then_B);
    thread t2(worker_B_then_A);

    t1.join();
    t2.join();

    printf("--- This message will never be printed. ---\n");
    fflush(stdout);

    return 0;
}
