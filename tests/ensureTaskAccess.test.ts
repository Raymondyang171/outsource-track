import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTaskAccess } from "../lib/guards/ensureTaskAccess";

type MembershipRow = {
  org_id: string;
  unit_id: string;
  user_id: string;
  role: string;
};

type TaskRow = {
  id: string;
  org_id: string;
  unit_id: string;
};

type QueryResult<T> = { data: T; error: null };

class MockQuery<T extends Record<string, unknown>> {
  private filters = new Map<string, string>();

  constructor(private rows: T[]) {}

  select() {
    return this;
  }

  eq(field: string, value: string) {
    this.filters.set(field, value);
    return this;
  }

  maybeSingle(): Promise<QueryResult<T | null>> {
    const row = this.filtered()[0] ?? null;
    return Promise.resolve({ data: row, error: null });
  }

  then<TResult1 = QueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const result = { data: this.filtered(), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private filtered() {
    if (this.filters.size === 0) return this.rows;
    return this.rows.filter((row) => {
      for (const [field, value] of this.filters.entries()) {
        if (String(row[field]) !== value) return false;
      }
      return true;
    });
  }
}

class MockSupabaseClient {
  constructor(private tasks: TaskRow[], private memberships: MembershipRow[]) {}

  from(table: string) {
    if (table === "project_tasks") {
      return new MockQuery<TaskRow>(this.tasks);
    }
    if (table === "memberships") {
      return new MockQuery<MembershipRow>(this.memberships);
    }
    throw new Error(`unexpected table: ${table}`);
  }
}

const SUPER_ORG_ID = "org-super";
const TASK = { id: "task-1", org_id: "org-1", unit_id: "unit-1" };

test("unit member can access task", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], [
    { org_id: "org-1", unit_id: "unit-1", user_id: "u1", role: "member" },
  ]);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u1",
    taskId: "task-1",
  });

  assert.equal(result.ok, true);
});

test("org admin can access task even if unit differs", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], [
    { org_id: "org-1", unit_id: "unit-2", user_id: "u2", role: "admin" },
  ]);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u2",
    taskId: "task-1",
  });

  assert.equal(result.ok, true);
});

test("super admin can access cross-org task", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], [
    { org_id: SUPER_ORG_ID, unit_id: "unit-x", user_id: "u3", role: "admin" },
  ]);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u3",
    taskId: "task-1",
  });

  assert.equal(result.ok, true);
});

test("no membership is denied", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], []);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u4",
    taskId: "task-1",
  });

  assert.deepEqual(result, { ok: false, status: 403, error: "permission_denied" });
});

test("org mismatch is denied", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], [
    { org_id: "org-2", unit_id: "unit-1", user_id: "u5", role: "member" },
  ]);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u5",
    taskId: "task-1",
  });

  assert.deepEqual(result, { ok: false, status: 403, error: "permission_denied" });
});

test("unit mismatch is denied for non-admin", async () => {
  process.env.PLATFORM_SUPER_ADMIN_ORG_ID = SUPER_ORG_ID;
  const client = new MockSupabaseClient([TASK], [
    { org_id: "org-1", unit_id: "unit-2", user_id: "u6", role: "member" },
  ]);

  const result = await ensureTaskAccess({
    client: client as unknown as SupabaseClient,
    userId: "u6",
    taskId: "task-1",
  });

  assert.deepEqual(result, { ok: false, status: 403, error: "permission_denied" });
});
