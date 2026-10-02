---
name: deverdesk
description: Use this skill to link this folder to DeverDesk, 把这个项目加进 DeverDesk, 算到某某副业, log what I just finished in DeverDesk, or tick a DeverDesk milestone after a release (发布后打里程碑).
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

### Tick a milestone after a release
Treat these as a release: you pushed a version tag, published a package, deployed to production, or created a GitHub release, or the user says it is out.
Then look at the pending milestones: the session briefing lists them, or call DeverDesk `get_project` and read `milestones.items`. The project name is in the briefing or in `deverdesk-recorder status --json`.
If exactly one pending milestone clearly matches the release by its name or version number, call `manage_project` with `action: "complete_milestone"`, the project, and that milestone's `id` or exact title. Then tell the user which milestone you completed; they can undo it in DeverDesk's AI activity.
If none matches, or several could, ask the user which one to complete. Do not guess, and never complete a milestone for work that has not shipped.

For time spent in this folder over the last week, run `deverdesk-recorder tasks --since 7d`.
