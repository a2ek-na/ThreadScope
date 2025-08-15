// runner/examples/example.cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <vector>
using namespace std;

mutex m1;

double now_ms(){
    using namespace chrono;
    auto t = steady_clock::now().time_since_epoch();
    return duration<double,  milli>(t).count();
}

void emit(const  string &type, int tid, const string &extra=""){
    ostringstream ss;
    ss << "{\"time\":" << fixed <<  setprecision(3) << now_ms()
       << ",\"type\":\"" << type << "\",\"tid\":" << tid;
    if(!extra.empty()) ss << "," << extra;
    ss << "}";
     cout << ss.str() <<  endl;
     cout.flush();
}

void worker(int id){
    emit("thread_start", id, "\"name\":\"worker\"");
    emit("lock_acquire_attempt", id, "\"lock\":\"m1\"");
    m1.lock();
    emit("lock_acquire", id, "\"lock\":\"m1\"");
     this_thread::sleep_for( chrono::milliseconds(300));
    emit("lock_release", id, "\"lock\":\"m1\"");
    m1.unlock();
    emit("thread_end", id);
}

int main(){
     thread t1(worker, 1);
     thread t2(worker, 2);
    t1.join();
    t2.join();
    return 0;
}
