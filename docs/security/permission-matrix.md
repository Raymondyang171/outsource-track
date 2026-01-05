# Permission Matrix

## Tenancy Rules (RLS Baseline)
- Read: same org can read (org_id match).
- Write: same org + same unit can write (org_id + unit_id match).
- Drive files: metadata can be visible by org, but actual file links should be restricted to same unit.
- Profiles: users can read their own profile only.
- Memberships: users can read their own memberships; org members can read org memberships.
- Orgs/Units/Templates: readable by same org.

Note: RLS only enforces org/unit. Role-based privileges (admin/manager/member/viewer) must be enforced in the app layer or via server actions.

## Roles (App-Level Privileges)
Role meanings are based on `issue_spec_V0.1.txt`.

| Action / Resource | Admin | Manager (PM) | Member | Viewer | Notes |
| --- | --- | --- | --- | --- | --- |
| View project list / board | Yes | Yes | Yes (same org) | Yes (same org) | RLS: org read; UI may limit details for Viewer |
| View project detail | Yes | Yes | Yes (same org) | Limited | Viewer sees summary only |
| Create / edit project | Yes | Yes | No | No | Writes require same org+unit or service role |
| Create / edit template | Yes | Yes | No | No | Template data is org-scoped |
| Edit project tasks (name/duration/owner) | Yes | Yes | No | No | Writes require same org+unit |
| Report progress (progress_logs) | Yes | Yes | Yes (own unit) | No | Member can write only in own unit |
| Upload file metadata (drive_items) | Yes | Yes | Yes (own unit) | No | Links visible only to own unit |
| View file links | Yes | Yes | Yes (own unit) | No | Viewer sees counts only |
| Manage users / memberships | Yes | Limited | No | No | Manager can assign project/unit members if allowed |

## Data-Level Matrix (RLS Targets)
This is the desired policy target for Phase 2A.

| Table | Read | Write | Notes |
| --- | --- | --- | --- |
| orgs | same org | admin/service role | org metadata |
| units | same org | admin/service role | unit list |
| memberships | same org (or own) | admin/service role | role is stored here |
| profiles | self only | self only | profile data |
| projects | same org | same org + same unit | `unit_id` required |
| project_tasks | same org | same org + same unit | `org_id`/`unit_id` required |
| progress_logs | same org | same org + same unit | per-unit write |
| drive_items | same org (metadata) | same org + same unit | links restricted to unit |
| templates / template_phases / template_tasks | same org | same org + same unit (or admin) | org-owned templates |

## Open Questions / TODO
- Confirm whether drive_items should be org-readable or unit-only (current RLS is unit-only).
- Confirm Manager permissions for user management vs project-only management.
- Define aggregation rule for "project/task overall progress" (max vs manual override).
