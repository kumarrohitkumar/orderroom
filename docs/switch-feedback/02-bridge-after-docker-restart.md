# Local server stays up without its Mattermost bridge after Docker comes back

**Switch Console 0.40.1 · switch-core 0.31.0 · macOS (arm64) · Docker Desktop**

## What happens
1. Local Switch server running with bundled Mattermost (Docker).
2. Docker Desktop stops (here, by itself about 30 minutes after start).
3. Console restarts the server while Docker is down. The log shows:
   ```
   local-switch-server: docker unavailable (daemon-down)
   local-switch-server: could not stop Mattermost …
   local-switch-server: started switch-core 0.31.0
   ```
4. Docker is started again and Mattermost becomes healthy (`/api/v4/system/ping` → 200).
5. Switch never re-attaches the Mattermost bridge. Running a template that creates a Mattermost room fails:
   ```
   Nothing was kept: the rooms could not be created: Bridge not running: <bridge id>.
   The agents this run had created (orderroom-agent) were deleted.
   ```
   The local-server status dot stays green the whole time.

Recovery needed: quit Console, stop the stale `switch_core.main` process, reopen Console.

## Expected
- When Docker or Mattermost comes back, the server (or Console's supervisor) restarts the bridge, or
- the status shows "Mattermost bridge down" with a one-click restart, and template preflight reports it before creating anything.

(The all-or-nothing rollback is good, and the message is clear. The problem is only the missing recovery.)
