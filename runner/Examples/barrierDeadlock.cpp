/*
EXAMPLE 4: THREAD BARRIER
Multiple threads work in phases. They all stop at a barrier
and wait for each other. Once all threads have arrived, they
are released to continue their work simultaneously. */
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <vector>
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

class Barrier {
public:
    Barrier(int count) : thread_count(count), counter(0), waiting(0) {}

    void wait() {
        threadscope::log_event("lock_acquire_attempt", "BarrierLock");
        unique_lock<mutex> lock(m);
        threadscope::log_event("lock_acquired", "BarrierLock");
        
        counter++;
        waiting++;
        
        if (counter == thread_count) {
            // This is the last thread to arrive, release all others
            counter = 0;
            waiting = 0;
            cv.notify_all();
        } else {
            // Wait until the last thread arrives
            cv.wait(lock, [this]{ return counter == 0; });
        }
        threadscope::log_event("lock_released", "BarrierLock");
    }

private:
    mutex m;
    condition_variable cv;
    int thread_count;
    int counter;
    int waiting;
};

void worker(int id, Barrier& barrier) {
    printf("[Worker %d] Starting Phase 1...\n", id);
    fflush(stdout);
    this_thread::sleep_for(chrono::milliseconds(50 * id)); // Stagger start
    printf("[Worker %d] Finished Phase 1, waiting at barrier.\n", id);
    fflush(stdout);

    barrier.wait();

    printf("[Worker %d] Passed barrier, starting Phase 2.\n", id);
    fflush(stdout);
    this_thread::sleep_for(chrono::milliseconds(100));
    printf("[Worker %d] Finished.\n", id);
    fflush(stdout);
}

int main() {
    const int num_threads = 4;
    printf("--- Thread Barrier Example with %d threads ---\n", num_threads);
    fflush(stdout);

    Barrier barrier(num_threads);
    vector<thread> threads;

    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back(worker, i + 1, ref(barrier));
    }

    for (auto& t : threads) {
        t.join();
    }

    printf("--- All workers finished. ---\n");
    fflush(stdout);

    return 0;
}
