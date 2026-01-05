// scripts/rls-smoke-test.mjs
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL || !ANON) {
  throw new Error("Missing SUPABASE_URL/SUPABASE_ANON_KEY (or NEXT_PUBLIC_*)")
}

const users = [
  { name: 'U_admin', email: process.env.T_ADMIN_EMAIL, password: process.env.T_ADMIN_PW },
  { name: 'U_member_A', email: process.env.T_A_EMAIL, password: process.env.T_A_PW },
  { name: 'U_member_B', email: process.env.T_B_EMAIL, password: process.env.T_B_PW },
  { name: 'U_stranger', email: process.env.T_X_EMAIL, password: process.env.T_X_PW },
]

async function asUser(u) {
  const sb = createClient(URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email: u.email, password: u.password })
  if (error) throw new Error(`${u.name} login failed: ${error.message}`)
  const userId = data.user?.id ?? null
  return {
    sb: createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } }),
    userId,
  }
}

async function testUser(u) {
  const { sb, userId: signedInUserId } = await asUser(u)
  const out = { user: u.name, tests: [] }

  // 1) SELECT projects
  {
    const { data, error } = await sb.from('projects').select('id, org_id, unit_id, name').limit(5)
    out.tests.push({ name: 'select projects', ok: !error, info: error?.message ?? `rows=${data?.length ?? 0}` })
  }

  // 2) INSERT progress_logs (用一筆你現有的 project_task_id 測)
  // 你先在 .env 放一個可用的 TASK_ID
  {
    let userId = signedInUserId
    if (!userId) {
      const { data: ures } = await sb.auth.getUser()
      userId = ures.user?.id ?? null
    }

    const payload = {
      project_task_id: process.env.T_TASK_ID,
      org_id: process.env.T_ORG_ID,
      unit_id: process.env.T_UNIT_ID, // 對應此使用者的 unit
      user_id: userId,
      progress: 10,
      note: `smoke by ${u.name}`,
    }
    const { error } = await sb.from('progress_logs').insert(payload)
    out.tests.push({ name: 'insert progress_logs', ok: !error, info: error?.message ?? 'insert ok' })
  }

  // 3) INSERT progress_logs (same org, different unit) should fail
  {
    const otherUnit = process.env.T_UNIT_ID_OTHER
    if (!otherUnit) {
      out.tests.push({ name: 'insert progress_logs (same org diff unit)', ok: false, info: 'T_UNIT_ID_OTHER missing' })
    } else {
      const payload = {
        project_task_id: process.env.T_TASK_ID,
        org_id: process.env.T_ORG_ID,
        unit_id: otherUnit,
        user_id: signedInUserId,
        progress: 10,
        note: `smoke (diff unit) by ${u.name}`,
      }
      const { error } = await sb.from('progress_logs').insert(payload)
      out.tests.push({
        name: 'insert progress_logs (same org diff unit)',
        ok: !!error,
        info: error?.message ?? 'unexpected ok',
      })
    }
  }

  // 4) INSERT progress_logs (different org) should fail
  {
    const otherOrg = process.env.T_ORG_ID_OTHER
    const otherUnit = process.env.T_UNIT_ID_OTHER_ORG
    if (!otherOrg || !otherUnit) {
      out.tests.push({ name: 'insert progress_logs (diff org)', ok: false, info: 'T_ORG_ID_OTHER/T_UNIT_ID_OTHER_ORG missing' })
    } else {
      const payload = {
        project_task_id: process.env.T_TASK_ID,
        org_id: otherOrg,
        unit_id: otherUnit,
        user_id: signedInUserId,
        progress: 10,
        note: `smoke (diff org) by ${u.name}`,
      }
      const { error } = await sb.from('progress_logs').insert(payload)
      out.tests.push({
        name: 'insert progress_logs (diff org)',
        ok: !!error,
        info: error?.message ?? 'unexpected ok',
      })
    }
  }

  return out
}

const results = []
for (const u of users) {
  try {
    results.push(await testUser(u))
  } catch (e) {
    results.push({ user: u.name, tests: [{ name: 'login', ok: false, info: e.message }] })
  }
}

console.log(JSON.stringify(results, null, 2))
