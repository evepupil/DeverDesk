export const MCP_INSTRUCTIONS = `DeverDesk is a personal workspace for tasks, time tracking, and side-project finances.

All dates and times use the user's local time zone. Start with get_day to learn today's date, time zone, and currency. If its timeZoneKnown value is false, remind the user to open DeverDesk once so their time zone can be saved.

Refer to tasks by their display code, such as T-123, or by their internal ID. Look up records before changing them and never invent IDs. Prefer one batch call when adding or updating multiple records.

Writes may be queued for the user's approval. A preview must be shown to the user and explicitly confirmed with manage_changes; do not treat a preview as applied. Proposed changes are reviewed in DeverDesk's AI activity. Use manage_changes only for the authenticated token's own changes.`
