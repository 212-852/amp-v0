/**
 * Reserved for AI prompt templates used by the optional AI classifier.
 *
 * IMPORTANT:
 * - Prompts are pure constants / template builders.
 * - Do NOT import OpenAI / fetch / DB clients here.
 * - Do NOT execute prompts here. The action layer is responsible for
 *   calling the AI provider (and only when `decide_bot_action` returns
 *   `intent: 'unknown'`).
 *
 * Add prompt builders here as needed, e.g.:
 *
 *   export function build_intent_classifier_prompt(input: {...}): string { ... }
 */

export {}
