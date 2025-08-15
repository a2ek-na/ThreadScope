#include <iostream>
#include <thread>
#include <mutex>
#include <chrono>
#include <vector>
using namespace std;
mutex m1;

void worker(int id) {
    cout << "Thread " << id << " is trying to get the lock.\n";
    m1.lock();
    cout << "Thread " << id << " has acquired the lock.\n";

    // Simulate some work while holding the lock
    this_thread::sleep_for(chrono::milliseconds(5000));

    cout << "Thread " << id << " is releasing the lock.\n";
    m1.unlock();

    cout << "Thread " << id << " finished its work.\n";
}

int main() {
    constexpr int numberOfThreads = 5;
    vector<thread> threads;

    for (int i = 1; i <= numberOfThreads; ++i) 
        threads.emplace_back(worker, i);
    

    for (auto& t : threads) 
        t.join();
    

    std::cout << "All threads finished.\n";
    return 0;
}
