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
const rateLimitCounter = new Counter('rate_limit_hits');
const serverErrorCounter = new Counter('server_errors');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, 
    { duration: '3m', target: 50 }, 
    { duration: '1m', target: 0 },  
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    // We expect some 429s, so we'll only fail if actual server errors (5xx) exceed 1%
    // or if unexpected 4xx (not 429, 409, 403) appear.
    'server_errors': ['count<10'], 
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Enhanced Check Utility
 * Checks for expected statuses and logs details on unexpected failures.
 */
function safeCheck(res, name, expectedStatuses = [200]) {
  const isExpected = expectedStatuses.includes(res.status);
  
  if (!isExpected) {
    if (res.status === 429) {
      rateLimitCounter.add(1);
    } else if (res.status >= 500) {
      serverErrorCounter.add(1);
      console.error(`[CRITICAL] ${name} failed with ${res.status}: ${res.body}`);
    } else {
      console.warn(`[UNEXPECTED] ${name} returned ${res.status}: ${res.body}`);
    }
  }

  return check(res, {
    [`${name} (Status: ${res.status})`]: (r) => expectedStatuses.includes(r.status),
  });
}

export default function () {
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
    // Health check can also be limited under heavy load
    safeCheck(res, 'Health Check', [200, 429]);
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
    
    const success = safeCheck(res, 'Check-In Request', [200, 409, 429]);

    if (res.status === 429) {
      sleep(10); 
    }

    if (success && res.status === 200) {
      checkinTrend.add(res.timings.duration);
      emailTriggerCounter.add(1); 
      
      const resJson = res.json();
      const checkinId = resJson.checkinId;

      if (checkinId) {
        group('Email & Identity Tasks', function () {
            const vRes = http.post(`${BASE_URL}/api/auth/send-verification`, JSON.stringify({ email: user.email }), { headers: headers });
            safeCheck(vRes, 'Trigger Verification', [200, 429, 400]); // 400 might happen if already verified
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
          
          // 400 is expected if the child was already checked out in a concurrent/previous run
          safeCheck(outRes, 'Check-Out Request', [200, 429, 400]);

          if (outRes.status === 429) {
            sleep(10);
          } else if (outRes.status === 200) {
            checkoutTrend.add(outRes.timings.duration);
            emailTriggerCounter.add(1); 
          }
        });
      }
    }
  });

  group('Discovery & Admin', function () {
    const res = http.get(`${BASE_URL}/api/health`);
    safeCheck(res, 'API Health Repeat', [200, 429]);

    const transRes = http.get(`${BASE_URL}/api/transactions`, { headers: headers });
    safeCheck(transRes, 'Dashboard Access', [200, 403, 429]);
  });

  sleep(Math.random() * 3 + 1);
}
