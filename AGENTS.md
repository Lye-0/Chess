<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Dynamic security verification

- Run npm run security:emulator during security validation when the local Firebase Emulator is available.
- The command uses only loopback Firestore/Auth Emulator endpoints, creates isolated synthetic data, starts a production-like Next.js server on a dedicated local port, verifies the API, and removes the synthetic data before exiting.
- If the Emulator is not already running, the command attempts to start firestore and auth with the Firebase CLI. Java, the Firebase CLI, child-process spawning, loopback networking, and writable temporary storage are required for that path.
- SECURITY_EMULATOR_AUTOSTART=0 disables automatic Emulator startup. SECURITY_SKIP_BUILD=1 skips the next build step only when a current production build is already available.
- If prerequisites are unavailable, record the dynamic check as deferred with the command output; do not switch the command to a live Firebase project.
