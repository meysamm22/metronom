-- Manual song order, synced across a user's devices.
--
-- position: 0-based place in the user's list. NULL = never placed (e.g. a
-- song created after the last reorder); those sort after placed songs,
-- oldest first.

alter table public.songs
  add column if not exists position integer;

-- Set the order of the caller's songs in one statement.
-- Only updates rows that exist and belong to the caller, so it can never
-- recreate a song deleted on another device. SECURITY INVOKER keeps the
-- table's row-level security in force.
create or replace function public.set_song_order(song_ids text[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.songs s
     set position = o.ord - 1
    from unnest(song_ids) with ordinality as o(id, ord)
   where s.id = o.id
     and s.user_id = auth.uid();
$$;

revoke all on function public.set_song_order(text[]) from public, anon;
grant execute on function public.set_song_order(text[]) to authenticated;
