# Data Contract (UI -> DB Mapping)

This maps UI fields to Supabase tables/columns. Any gaps should be resolved before Phase 2B writes.

## Project Templates
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| Template name | templates.name | org-scoped |
| Template phases | template_phases (template_id, seq, name, color) | seq drives ordering |
| Template tasks | template_tasks (phase_id, seq, code, name, default_duration_days, default_owner_unit_id) | default duration/owner |
| Task location | (missing) | consider adding `location` column |
| Task materials | (missing) | consider adding `materials` column |

## Project Instance
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| Project name | projects.name | org_id + unit_id required (Phase 2A) |
| Project start date | projects.start_date | used to compute schedule |
| Project status | projects.status | active / paused / done |
| Project template | projects.template_id | optional |
| Created by | projects.created_by | profiles.user_id |

## Project Tasks (Instance)
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| Phase name | project_tasks.phase_name | copied from template phase |
| Task seq | project_tasks.seq | unique per project |
| Task code | project_tasks.code | optional |
| Task name | project_tasks.name | display text |
| Start offset (days) | project_tasks.start_offset_days | for Gantt start |
| Duration (days) | project_tasks.duration_days | for Gantt length |
| Owner unit | project_tasks.owner_unit_id | unit responsible |
| Task progress (overall) | project_tasks.progress | derived or manual; needs rule |
| Task location | (missing) | consider adding `location` |
| Task materials | (missing) | consider adding `materials` |

## Progress Logs (Per Unit)
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| Progress percent | progress_logs.progress | 0..100 |
| Note | progress_logs.note | optional |
| Reported by | progress_logs.user_id | auth.uid() |
| Task | progress_logs.project_task_id | FK |
| Org / Unit | progress_logs.org_id / unit_id | required |
| Report time | progress_logs.created_at | auto |

## Drive Items / Documents
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| Document name | drive_items.name | display title |
| Document type | drive_items.mime_type | or map to UI type |
| Document link | drive_items.web_view_link | link to GDrive |
| File id | drive_items.drive_file_id | GDrive ID |
| Updated time | drive_items.modified_time | from GDrive |
| Uploaded by | drive_items.uploaded_by | profiles.user_id |
| Task | drive_items.project_task_id | FK |
| Org / Unit | drive_items.org_id / unit_id | required |

## Membership / Identity
| UI Field | Table.Column | Notes |
| --- | --- | --- |
| User display name | profiles.display_name | optional |
| Org / Unit role | memberships.role | enum: admin/manager/member/viewer |

## Computed / Derived Fields
- Gantt start = projects.start_date + project_tasks.start_offset_days.
- Gantt end = start + project_tasks.duration_days.
- Task overall progress aggregation rule is TBD (e.g., max of unit logs vs manual override).
- Viewer-facing attachment counts should be derived from drive_items per task without exposing links.

## Gaps / TODO
- Confirm if project_tasks needs `location` and `materials` columns.
- Confirm if projects need `client`, `end_date`, `manager_id`, `gdrive_root_url` (from spec).
- Define which endpoints/server actions are responsible for writes per table.
