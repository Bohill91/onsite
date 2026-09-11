# Production authentication warning

The current OnSite prototype stores its user database, active sessions, and
plain-text passwords in browser `localStorage`. Before production launch, this
must be replaced with server-side authentication, secure password hashing, and
server-managed sessions.

This recovery does not implement that production authentication redesign.
