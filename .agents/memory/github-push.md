---
name: GitHub push path
description: Reliable way to publish local commits when the workspace Git remote cannot authenticate directly
---

When a direct HTTPS push fails for missing credentials but the workspace has an authorized GitHub integration, use the integration's authenticated GitHub API rather than asking for a token or force-pushing.

**Why:** The local Git remote can be unauthenticated even when the Replit GitHub connector is installed and authorized. A safe push must still verify the remote branch parent and perform a fast-forward update only.

**How to apply:** Resolve the GitHub connection and repository through the integration, compare the remote branch head with the intended parent, create the required Git objects, update the branch with `force: false`, verify the remote SHA, and align local tracking metadata afterward.