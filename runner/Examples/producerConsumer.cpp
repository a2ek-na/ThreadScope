/*
EXAMPLE 3: PRODUCER-CONSUMER
A producer thread creates items and a consumer thread processes
them, using a shared queue protected by a mutex and
synchronized with condition variables. */
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <string>
#include <chrono>
#include <sstream>

// --- ThreadScope Helper Code ---
namespace threadscope {
    static auto T0 = std::chrono::high_resolution_clock::now();
    static std::mutex log_mutex;
    void log_event(const std::string& type, const std::string& lock_name) {
        std::lock_guard<std::mutex> guard(log_mutex);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - T0).count();
        std::stringstream ss_tid;
        ss_tid << std::this_thread::get_id();
        printf("{\"type\":\"%s\",\"time\":%lld,\"tid\":\"%s\",\"lock\":\"%s\"}\n", type.c_str(), (long long)ms, ss_tid.str().c_str(), lock_name.c_str());
        fflush(stdout);
    }
}
// --- End Helper Code ---
std::queue<int> data_queue;
std::mutex queue_mutex;
std::condition_variable cv;
bool finished = false;

void producer() {
    printf("[Producer] Started.\n");
    for (int i = 0; i < 10; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        
        threadscope::log_event("lock_acquire_attempt", "QueueLock");
        std::unique_lock<std::mutex> lock(queue_mutex);
        threadscope::log_event("lock_acquired", "QueueLock");
        
        printf("[Producer] Pushing item %d\n", i);
        fflush(stdout);
        data_queue.push(i);
        
        threadscope::log_event("lock_released", "QueueLock");
        lock.unlock();
        
        cv.notify_one(); 
    }


    threadscope::log_event("lock_acquire_attempt", "QueueLock");
    std::unique_lock<std::mutex> lock(queue_mutex);
    threadscope::log_event("lock_acquired", "QueueLock");
    finished = true;
    threadscope::log_event("lock_released", "QueueLock");
    lock.unlock();
    cv.notify_one();
    printf("[Producer] Finished.\n");
}

void consumer() {
    printf("[Consumer] Started.\n");
    while (true) {
        threadscope::log_event("lock_acquire_attempt", "QueueLock");
        std::unique_lock<std::mutex> lock(queue_mutex);
        threadscope::log_event("lock_acquired", "QueueLock");

        // Wait until the queue is not empty OR production is finished
        cv.wait(lock, []{ return !data_queue.empty() || finished; });

        if (!data_queue.empty()) {
            int item = data_queue.front();
            data_queue.pop();
            printf("[Consumer] Processing item %d\n", item);
            fflush(stdout);
            
            threadscope::log_event("lock_released", "QueueLock");
            lock.unlock();
        } else if (finished) {
            threadscope::log_event("lock_released", "QueueLock");
            lock.unlock();
            break; 
        }
    }
    printf("[Consumer] Finished.\n");
}

int main() {
    printf("--- Producer-Consumer Example ---\n");
    fflush(stdout);

    std::thread p(producer);
    std::thread c(consumer);

    p.join();
    c.join();

    printf("--- Program Complete ---\n");
    fflush(stdout);

    return 0;
}
