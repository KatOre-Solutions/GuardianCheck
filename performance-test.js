import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// 1. Data Pooling: Load test users from a JSON file
// You would generate this file using a script (see below)
const users = new SharedArray('test users', function () {
  const data = JSON.parse(open('./test-users.json'));
  return data;
});

const checkinTrend = new Trend('api_checkin_duration');
const checkoutTrend = new Trend('api_checkout_duration');
const emailTriggerCounter = new Counter('emails_triggered');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, 
    { duration: '3m', target: 50 }, 
    { duration: '1m', target: 0 },  
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed': ['rate<0.01'],    
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 2. Pick a user from the pool based on the VU ID
  // If we have 50 VUs, VU #1 gets users[0], VU #50 gets users[49]
  const user = users[(__VU - 1) % users.length];

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${user.token}`,
  };

  const contextData = {
    churchId: user.churchId,
    childId: user.childId,
    roomId: user.roomId || 'perf-test-room',
    serviceId: user.serviceId || 'perf-test-service',
    volunteerId: user.volunteerId,
  };

  group('System Health', function () {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      'health status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);

  group('Sunday Rush: Check-In', function () {
    const payload = JSON.stringify({
      childId: contextData.childId,
      roomId: contextData.roomId,
      serviceId: contextData.serviceId,
      volunteerId: contextData.volunteerId,
      checkedInBy: `Perf VU ${__VU} (${user.email})`,
      qrCode: 'TEST_QR_123',
    });

    const res = http.post(`${BASE_URL}/api/check-in`, payload, { headers: headers });
    
    const success = check(res, {
      'check-in status is valid': (r) => [200, 409, 429].includes(r.status),
    });

    if (res.status === 429) {
      sleep(10); // Back off during the rush
    }

    if (success && res.status === 200) {
      checkinTrend.add(res.timings.duration);
      emailTriggerCounter.add(1); // Check-in sends success email to parents
      
      const resJson = res.json();
      const checkinId = resJson.checkinId;

      if (checkinId) {
        // --- 3. Verification/Email Tasks ---
        // Simulating the user triggering a verification email during the wait
        group('Email & Identity Tasks', function () {
            const vRes = http.post(`${BASE_URL}/api/auth/send-verification`, {}, { headers: headers });
            check(vRes, { 'verification triggered': (r) => [200, 429].includes(r.status) });
            if (vRes.status === 200) emailTriggerCounter.add(1);
        });

        sleep(5); 

        group('Sunday Pickup: Check-Out', function () {
          const checkoutPayload = JSON.stringify({
            checkinId: checkinId,
            volunteerId: contextData.volunteerId,
            guardianName: 'Test Parent',
          });

          const outRes = http.post(`${BASE_URL}/api/check-out`, checkoutPayload, { headers: headers });
          
          check(outRes, {
            'check-out status is valid': (r) => [200, 429].includes(r.status),
          });

          if (outRes.status === 429) {
            sleep(10);
          } else if (outRes.status === 200) {
            checkoutTrend.add(outRes.timings.duration);
            emailTriggerCounter.add(1); // Check-out also sends confirmation email
          }
        });
      }
    }
  });

  group('Discovery & Admin', function () {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, { 'api healthy': (r) => r.status === 200 });

    const transRes = http.get(`${BASE_URL}/api/transactions`, { headers: headers });
    check(transRes, { 'dashboard loaded': (r) => [200, 403, 429].includes(r.status) });
  });

  sleep(Math.random() * 3 + 1);
}
