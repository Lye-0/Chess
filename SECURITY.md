# Security verification

## Local dynamic verification

Run the repository-owned dynamic verification with:

~~~
npm run security:emulator
~~~

The runner is intentionally local-only. It accepts only loopback Emulator endpoints, uses an isolated synthetic organization, exercises the real Next.js API, and deletes the synthetic documents during cleanup. It must not be pointed at a deployed Firebase project.

Codex Security should run this command during validation when Java, the Firebase CLI, child-process creation, loopback networking, and writable temporary storage are available. If the command reports that the Emulator or application environment cannot be started, the dynamic portion is deferred; static analysis results must not be presented as runtime reproduction.

The current suite verifies the employee compatibility response minimization boundary, duplicate-name labeling, internal ID mapping on save, and the absence of display-only keys in Firestore. Additional finding-specific dynamic checks can be added to the same runner without changing the safety boundary.
