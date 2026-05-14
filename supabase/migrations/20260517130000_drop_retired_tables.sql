-- Retired tables after centralizing profiles, concierge memos, and LINE link
-- state into users.profile_json, rooms.concierge_json, and identities.
-- Keep public.chat_actions and public.push_subscriptions.

DROP TABLE IF EXISTS public.support_actions CASCADE;
DROP TABLE IF EXISTS public.auth_link_sessions CASCADE;
DROP TABLE IF EXISTS public.chat_handoff_memos CASCADE;
DROP TABLE IF EXISTS public.admin_profiles CASCADE;
