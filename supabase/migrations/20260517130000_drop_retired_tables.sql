-- Retired tables after centralizing concierge memos and LINE link state into
-- rooms.concierge_json and identities.
-- Keep public.chat_actions and public.push_subscriptions.

DROP TABLE IF EXISTS public.support_actions CASCADE;
DROP TABLE IF EXISTS public.auth_link_sessions CASCADE;
DROP TABLE IF EXISTS public.chat_handoff_memos CASCADE;
