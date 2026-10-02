---
name: deverdesk
description: Use this skill to link this folder to DeverDesk, 把这个项目加进 DeverDesk, 算到某某副业, or log what I just finished in DeverDesk.
allowed-tools: Bash(deverdesk-recorder *)
---

# DeverDesk

### Bind this folder
Run `deverdesk-recorder status --json` and use its `dir` and binding status.
Call DeverDesk `list_projects`; for a user-selected existing side project, call `manage_project` with `action: "update"` and `addDirectories: [dir]`; otherwise create one with `action: "create"`, `name: dir`, and `directories: [dir]`.
To unbind it, call `manage_project` with `action: "update"` and `removeDirectories: [dir]`.
Tell the user that earlier activity will be included on the next sync after binding.

### Report completed work
After finishing substantive work without a commit, such as research, investigation, or uncommitted documentation, run `deverdesk-recorder done "<one-line title>"`.
Use one concise title for the completed work.
Do not report work that already has a commit.

### Reference tasks in commits
Use the session briefing to identify any matching DeverDesk task ID.
When a commit corresponds to an existing task, put its ID on the first commit-message line or include `Closes T-123`.
That reference marks the matching task complete.

For time spent in this folder over the last week, run `deverdesk-recorder tasks --since 7d`.
