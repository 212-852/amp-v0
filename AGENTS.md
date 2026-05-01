One Build / Single Core / Multi-Entrance

#########################
GLOBAL RULE
#########################
- Use English only
- Use ASCII characters only
- Do not use emojis

#########################
CORE PRINCIPLE
#########################
- Always centralize core logic into a single place
- Do not duplicate logic
- Reuse core functions instead of rewriting
- All logic must pass through a single core

#########################
NAMING RULE
#########################
- Do not use hyphen-separated file names
- Use directory structure to express responsibility
- Do not repeat context in file names
- Keep file names minimal and contextual

Example:
- chat/action.ts
- not chat-action.ts

- function and variable: snake_case
- class: PascalCase

#########################
FLOW RULE
#########################
Use a single unified flow

request
→ context
→ rules
→ action
→ output

Do not bypass this flow

#########################
ROLE RULE
#########################
- context normalizes input only
- rules decides logic and routing only
- action executes logic only (single core)
- output handles UI and notifications only

#########################
SEPARATION RULE
#########################
- context must not decide logic
- rules must not execute actions
- action must not render UI
- output must not decide logic

#########################
API RULE
#########################
- API must not contain business logic
- API must call the single core only

#########################
UI RULE
#########################
- UI must not contain business logic
- UI must not decide behavior or routing

#########################
CHAT ROOM RULE
#########################
- All chats must belong to a room
- Do not create separate chat logic for web and LINE
- Store all messages from web and LINE in the same archive structure
- Use one message bundle for both Web bubble and LINE Flex Message
- Concierge replies must use the same room and archive flow

#########################
CHAT FLOW RULE
#########################
- All chat messages must use the same flow
- Do not create separate chat logic for Web and LINE

Flow:
LINE or web message
-> dispatch/context.ts
-> chat/room.ts
-> chat/action.ts
-> chat/rules.ts
-> chat/message.ts
-> chat/archive.ts
-> output

#########################
CHAT ROOM RULE
#########################
- All chats must belong to a room
- Rooms must support web, line, liff, and pwa channels
- Rooms must support user, driver, admin, concierge, and bot participants
- Do not split chat logic by channel or role

#########################
CHAT MESSAGE RULE
#########################
- Use one message bundle for Web and LINE
- Web chat bubble and LINE Flex Message must be generated from the same source
- Do not create separate response logic for Web and LINE

#########################
CHAT ARCHIVE RULE
#########################
- Store all messages in the archive
- Store both incoming and outgoing messages
- Store concierge replies in the same room
- Do not discard conversation history

#########################
NOTIFICATION FLOW RULE
#########################
- Notifications must use the same centralized flow
- Do not send Discord or LINE notifications directly from chat or API routes

Flow:
event
-> notify/rules.ts
-> notify/index.ts
-> notify/discord.ts or notify/line.ts

#########################
NOTIFICATION RESPONSIBILITY RULE
#########################
- notify/rules.ts decides category, priority, targets, and channels
- notify/index.ts is the single notification entry point
- notify/discord.ts only delivers Discord messages
- notify/line.ts only delivers LINE messages
- control.ts controls debug and notification switches

#########################
DEBUG FLOW RULE
#########################
- Debug events must use the centralized debug flow
- Do not send debug messages directly to Discord or LINE
- Do not write debug logic directly in API routes, UI, or chat logic

Flow:
debug event
-> debug/rules.ts
-> debug/index.ts
-> notify/index.ts
-> notify/discord.ts

#########################
DEBUG RESPONSIBILITY RULE
#########################
- debug/rules.ts decides debug level, category, and channel
- debug/index.ts is the single debug entry point
- notify/index.ts handles delivery
- control.ts controls debug switches

#########################
AUTH FLOW RULE
#########################
- All authentication must use a single unified flow
- Do not create separate login logic per provider or channel

Flow:
request
-> auth/context.ts
-> auth/session.ts
-> auth/identity.ts
-> auth/route.ts
-> response

#########################
SESSION RULE
#########################
- Resolve visitor_uuid before user_uuid
- Restore session for web, liff, and pwa
- Use one session core for all access channels

#########################
IDENTITY RULE
#########################
- Map all providers (line, google, email) into a single identity system
- Do not handle provider logic separately in business logic

#########################
ROUTING RULE
#########################
- role and tier must be decided in auth/route.ts
- API and UI must not decide role or tier

#########################
LOCALE STRUCTURE RULE
#########################
- Group text by key, not by locale
- Keep all locale text in one place inside the component
- Do not scatter locale text across JSX
- Use content.key[locale] pattern

Example:
title: { ja: '', en: '', es: '' }

#########################
IDENTITY PROVIDER RULE
#########################
- Do not create a provider table for fixed providers
- Store provider as a field in identities
- Use simple values like: line, google, email
- Avoid unnecessary joins

#########################
OUTPUT FLOW RULE
#########################
- All outgoing messages must go through the output core
- Do not send LINE or Web messages directly from chat, API, or UI
- Output destination is decided from the receiver participant state

Flow:
message bundle
-> output/rules.ts
-> output/index.ts
-> output/line.ts or output/web.ts

#########################
OUTPUT RESPONSIBILITY RULE
#########################
- output/rules.ts decides delivery channel
- output/index.ts is the single output entry point
- output/line.ts only sends LINE messages
- output/web.ts only sends Web messages
- chat/message.ts only builds message bundles

#########################
AI OPERATION RULE
#########################
- ChatGPT is the single source for architecture and decisions
- Codex CLI generates code from fixed instructions
- Cursor is used only for editing, running, and UI verification
- Do not use Cursor for large code generation
- Do not let multiple AI tools make architecture decisions
- Prefer Codex CLI for cost control