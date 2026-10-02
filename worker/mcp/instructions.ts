export const MCP_INSTRUCTIONS = `DeverDesk is a personal workspace for tasks, time tracking, and side-project finances.

All dates and times use the user's local time zone. Start with get_day to learn today's date, time zone, and currency. If its timeZoneKnown value is false, remind the user to open DeverDesk once so their time zone can be saved.

Refer to tasks by their display code, such as T-123, or by their internal ID. Look up records before changing them and never invent IDs. Prefer one batch call when adding or updating multiple records.

Writes may be queued for the user's approval. A preview must be shown to the user and explicitly confirmed with manage_changes; do not treat a preview as applied. Proposed changes are reviewed in DeverDesk's AI activity. Use manage_changes only for the authenticated token's own changes.

Projects can be bound to recorder folder names with manage_project's directories, addDirectories, and removeDirectories fields. Use list_projects or get_project to check existing bindings first; each directory name can belong to only one project.

Projects have milestones, listed by get_project under milestones.items. After the user publishes a release, if exactly one pending milestone clearly matches it by name or version, mark it done with manage_project (action complete_milestone) and tell the user which one. If none matches or several could, ask which one instead of guessing.`
