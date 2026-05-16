insert into public.chat_actions (
  room_uuid,
  actor_user_uuid,
  actor_participant_uuid,
  actor_display_name,
  actor_role,
  action_type,
  body,
  visibility,
  source_channel,
  created_at,
  meta_json
)
select
  latest.room_uuid,
  latest.actor_user_uuid,
  latest.actor_participant_uuid,
  coalesce(latest.actor_display_name, 'Admin'),
  coalesce(latest.actor_role, 'admin'),
  'support_left',
  coalesce(latest.actor_display_name, 'Admin') || ' が退出しました',
  coalesce(latest.visibility, 'admin'),
  'admin',
  now(),
  jsonb_build_object(
    'source',
    'development_cleanup',
    'cleanup_reason',
    'close_stale_support_started',
    'closed_support_started_action_uuid',
    latest.action_uuid
  )
from (
  select
    action_uuid,
    room_uuid,
    actor_user_uuid,
    actor_participant_uuid,
    actor_display_name,
    actor_role,
    visibility,
    action_type
  from public.chat_actions
  where room_uuid = '87c1145a-79c9-4e6f-8806-419d64091d3f'
    and action_type in ('support_started', 'support_left')
  order by created_at desc
  limit 1
) latest
where latest.action_type = 'support_started'
  and not exists (
    select 1
    from public.chat_actions existing
    where existing.room_uuid = latest.room_uuid
      and existing.action_type = 'support_left'
      and existing.meta_json ->> 'closed_support_started_action_uuid' =
        latest.action_uuid::text
  );

notify pgrst, 'reload schema';
