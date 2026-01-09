-- Drive items metadata for thumbnails and sizes.
alter table public.drive_items
  add column if not exists thumbnail_link text,
  add column if not exists file_size_bytes bigint,
  add column if not exists original_size_bytes bigint;
