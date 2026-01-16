
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

// --- Configuration ---
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'gm@green-demo.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'Demo1234!';
const USER_A_EMAIL = process.env.USER_A_EMAIL ?? 'a1@green-demo.com'; // Member of '安裝一隊'
const USER_A_PASSWORD = process.env.USER_A_PASSWORD ?? 'Demo1234!';
const USER_B_EMAIL = process.env.USER_B_EMAIL ?? 'b1@green-demo.com'; // Member of '安裝二隊'
const USER_B_PASSWORD = process.env.USER_B_PASSWORD ?? 'Demo1234!';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const UNIT_A_NAME = '安裝一隊';
const UNIT_B_NAME = '安裝二隊';
const TASK_A_CODE = 'E1'; // Owned by '安裝一隊'
const TASK_B_CODE = 'E2'; // Owned by '安裝二隊'

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api';

// --- Test Runner ---
class SmokeTestRunner {
  private tests: Array<{ name: string; pass: boolean; info?: string }> = [];

  async run(name: string, testFn: () => Promise<void>) {
    try {
      await testFn();
      this.tests.push({ name, pass: true });
      console.log(`✅ PASS: ${name}`);
    } catch (e: any) {
      this.tests.push({ name, pass: false, info: e.message });
      console.error(`❌ FAIL: ${name}\n   -> ${e.message}`);
    }
  }

  summarize() {
    console.log('\n--- Test Summary ---');
    const passed = this.tests.filter(t => t.pass).length;
    const failed = this.tests.filter(t => !t.pass).length;

    this.tests.forEach(test => {
      const status = test.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${test.name}`);
      if (!test.pass && test.info) {
        console.log(`   -> Info: ${test.info}`);
      }
    });

    console.log(`\nTotal: ${this.tests.length}, Passed: ${passed}, Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
  }
}

// --- Test Implementation ---

async function main() {
  const runner = new SmokeTestRunner();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Setup: Get data from DB ---
  console.log('--- Setup: Fetching test data from database ---');
  const { data: unitA, error: errA } = await supabase.from('units').select('id').eq('name', UNIT_A_NAME).single();
  if (errA || !unitA) throw new Error(`Unit A '${UNIT_A_NAME}' not found.`);
  const { data: unitB, error: errB } = await supabase.from('units').select('id').eq('name', UNIT_B_NAME).single();
  if (errB || !unitB) throw new Error(`Unit B '${UNIT_B_NAME}' not found.`);

  const { data: taskA, error: errTA } = await supabase.from('project_tasks').select('id').eq('code', TASK_A_CODE).eq('owner_unit_id', unitA.id).limit(1).single();
  if (errTA || !taskA) throw new Error(`Task A ('${TASK_A_CODE}' in unit '${UNIT_A_NAME}') not found.`);
  const { data: taskB, error: errTB } = await supabase.from('project_tasks').select('id').eq('code', TASK_B_CODE).eq('owner_unit_id', unitB.id).limit(1).single();
  if (errTB || !taskB) throw new Error(`Task B ('${TASK_B_CODE}' in unit '${UNIT_B_NAME}') not found.`);

  console.log(`Found Unit A (${unitA.id}), Unit B (${unitB.id})`);
  console.log(`Found Task A (${taskA.id}), Task B (${taskB.id})`);
  console.log('--- Setup Complete ---\n');

  // --- Login ---
  async function loginAndGetClient(email: string, pass: string): Promise<{ token: string; supabase: SupabaseClient }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error || !data.session) throw new Error(`Login failed for ${email}: ${error?.message}`);
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
    });
    return { token: data.session.access_token, supabase: client };
  }

  const { token: userAToken } = await loginAndGetClient(USER_A_EMAIL, USER_A_PASSWORD);
  // Pre-create an item in Task B for read/delete tests, using a super admin account
  const { token: superAdminToken } = await loginAndGetClient(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  
  let itemInTaskBId: string | null = null;
  await runner.run('[Setup] Super admin can upload to Task B', async () => {
    const form = new FormData();
    form.append('task_id', taskB.id);
    form.append('file', new Blob(['test-content-b']), 'test-b.txt');
    const res = await fetch(`${API_BASE_URL}/drive/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${superAdminToken}` },
        body: form,
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}. Body: ${await res.text()}`);
    const json = await res.json();
    if (!json.ok || !json.item?.id) throw new Error(`API response not ok. Body: ${JSON.stringify(json)}`);
    itemInTaskBId = json.item.id;
  });
  if(!itemInTaskBId) {
      console.error("Fatal: Could not create test item in task B. Aborting.");
      process.exit(1);
  }


  // --- Test Cases ---
  let itemInTaskAId: string | null = null;

  console.log(`\n--- Running tests as User A (${USER_A_EMAIL}) ---`);

  await runner.run('User A can upload to their own unit (Task A)', async () => {
    const form = new FormData();
    form.append('task_id', taskA.id);
    form.append('file', new Blob(['test-content-a']), 'test-a.txt');
    const res = await fetch(`${API_BASE_URL}/drive/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userAToken}` },
        body: form,
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}. Body: ${await res.text()}`);
    const json = await res.json();
    if (!json.ok || !json.item?.id) throw new Error(`API response not ok. Body: ${JSON.stringify(json)}`);
    itemInTaskAId = json.item.id;
  });
  
  if (itemInTaskAId) {
    await runner.run('User A can get thumbnail for item in their own unit', async () => {
        const res = await fetch(`${API_BASE_URL}/drive/thumbnail?item_id=${itemInTaskAId}`, {
            headers: { 'Authorization': `Bearer ${userAToken}` },
        });
        // We expect 200 or 404 if thumbnail is not ready, both are fine for auth check.
        if (![200, 404].includes(res.status)) throw new Error(`Expected 200 or 404, got ${res.status}.`);
    });
  }

  await runner.run('User A CANNOT upload to another unit (Task B)', async () => {
    const form = new FormData();
    form.append('task_id', taskB.id);
    form.append('file', new Blob(['test-content-a-fail']), 'test-a-fail.txt');
    const res = await fetch(`${API_BASE_URL}/drive/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userAToken}` },
        body: form,
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}.`);
  });

  await runner.run('User A CANNOT get thumbnail for item in another unit', async () => {
    const res = await fetch(`${API_BASE_URL}/drive/thumbnail?item_id=${itemInTaskBId}`, {
        headers: { 'Authorization': `Bearer ${userAToken}` },
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}.`);
  });

  await runner.run('User A CANNOT delete item in another unit', async () => {
    const res = await fetch(`${API_BASE_URL}/drive/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemInTaskBId }),
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}.`);
  });

  if (itemInTaskAId) {
    await runner.run('User A can delete item in their own unit', async () => {
        const res = await fetch(`${API_BASE_URL}/drive/delete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userAToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: itemInTaskAId }),
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}. Body: ${await res.text()}`);
    });
  }

  // --- Cleanup ---
  await runner.run('[Cleanup] Super admin can delete item from Task B', async () => {
    const res = await fetch(`${API_BASE_URL}/drive/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${superAdminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemInTaskBId }),
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}. Body: ${await res.text()}`);
  });

  runner.summarize();
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  process.exit(1);
});
