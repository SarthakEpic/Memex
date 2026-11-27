# Memex product vision

Memex is a trustworthy personal email command center. It helps people handle important messages quickly, stay on top of commitments, and find the context behind a conversation without giving up control of their inbox.

## Who Memex is for

Memex is for people who manage a busy personal or professional inbox and want one clear place to understand, organize, and act on their email. It should work for people with Gmail, Microsoft, and standard IMAP or SMTP accounts, including people who prefer not to connect a real inbox while evaluating the app.

## The problem Memex solves

Important messages get buried among newsletters, routine notifications, and long conversations. People spend time searching for context, deciding what needs attention, remembering promised follow-ups, and writing repetitive replies. Existing automation can feel opaque or risky when it labels, archives, or sends messages without clear user control.

## Product promise

Memex makes the next useful email action clear. It brings important messages forward, summarizes conversations with links to the original message, helps draft accurate replies, and makes follow-ups easier to remember. The user remains in control of sending, scheduling, archiving, and other consequential actions.

## Desired outcomes

- Users can quickly see which messages need attention and why.
- Summaries and suggested replies stay grounded in the actual email thread.
- Users can find messages, people, decisions, and commitments with minimal effort.
- Follow-ups and scheduled messages are visible, understandable, and recoverable.
- Users can correct AI classifications and drafts without fighting the interface.
- Connecting an account, syncing mail, and disconnecting it are clear and dependable.
- Users can understand what data is stored and what is sent to an AI provider.

## Product principles

- Trust before automation. Never send, archive, delete, or change important email state without an explicit user action.
- Show the source. Summaries, extracted commitments, and reply suggestions should link back to the message or thread that supports them.
- Make uncertainty clear. If context is missing or a conclusion is uncertain, say so instead of inventing details.
- Keep the inbox legible. Prioritize clear message lists, useful filters, and fast search over decorative dashboards.
- Make every action reversible when possible. Explain what happened and provide a straightforward way to recover.
- Protect private information. Use least-privilege access, secure credential storage, careful logging, and clear provider disclosures.
- Support real email workflows. Handle sync failures, duplicates, thread history, drafts, attachments, provider limits, and scheduled delivery gracefully.
- Keep common tasks fast and accessible across screen sizes.

## Priorities

1. Make account connection, inbox sync, and message state reliable across supported providers.
2. Improve triage so urgent, important, routine, and low-value messages are easy to distinguish and correct.
3. Make search and thread views fast, useful, and faithful to the original email.
4. Make summaries and reply drafts accurate, editable, and grounded in thread context.
5. Make follow-ups, reminders, and scheduled email visible, reliable, and easy to manage.
6. Improve privacy controls, error recovery, accessibility, and clear feedback for every important action.
7. Add analytics or advanced automation only when they help users complete email work more safely or quickly.

## Non-goals and constraints

- Do not optimize for autonomous inbox control or sending messages without confirmation.
- Do not fabricate email content, commitments, recipients, or message history.
- Do not hide failed syncs, delivery failures, AI uncertainty, or permission requirements.
- Do not add features merely to create activity or imitate a competitor.
- Keep AI optional and respect the configured provider and its data handling.
- Preserve the existing architecture and support local development with low-cost tools.
- Prefer small, tested improvements that solve a demonstrated user problem.
