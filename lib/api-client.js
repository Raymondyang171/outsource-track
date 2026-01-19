import { getDb, retryRequest } from './dexie/init-dexie';
import { getDeviceId } from './device';

export async function safeFetch(url, options) {
  const device_id = getDeviceId();
  const idempotency_key = window.crypto.randomUUID();

  const headers = { ...options.headers, 'X-Device-ID': device_id, 'X-Idempotency-Key': idempotency_key };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        // For server errors, we might not want to retry all the time.
        // For now, we'll just log it and let the caller handle it.
        // In a real-world scenario, we might want to differentiate between 4xx and 5xx errors.
        console.error('safeFetch responded with error', response);
    }
    return response;
  } catch (error) {
    // This is likely a network error
    console.log('safeFetch failed, adding to outbox', { url, options });
    await addRequestToOutbox({
      url,
      method: options.method || 'GET',
      headers,
      body: options.body,
      idempotency_key,
      device_id,
    });
    // We throw the error so the caller knows the request failed.
    // The UI can then show a message to the user.
    throw error;
  }
}

async function addRequestToOutbox(request) {
  const db = getDb();
  if (!db) return;
  await db.requests.add({
    ...request,
    status: 'pending',
    retryCount: 0,
    lastAttemptedAt: null,
  });
}

export async function retryAllPendingRequests() {
    const db = getDb();
    if (!db) return;
    const pendingRequests = await db.requests.where('status').equals('pending').toArray();
    for (const req of pendingRequests) {
        await retryRequest(req.id);
    }

    const failedRequests = await db.requests.where('status').equals('failed').toArray();
    for (const req of failedRequests) {
        // Simple backoff strategy: retry after 2^retryCount seconds
        const secondsToWait = Math.pow(2, req.retryCount);
        const timeSinceLastAttempt = (new Date() - req.lastAttemptedAt) / 1000;
        if (timeSinceLastAttempt > secondsToWait) {
            await retryRequest(req.id);
        }
    }
}

// Retry pending requests every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(retryAllPendingRequests, 30000);
}
