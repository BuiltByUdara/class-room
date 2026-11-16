# Phase 3: quiz engine

Managers can build, duplicate, schedule, publish, close and archive quizzes, then control result publication and answer review. Students see eligible assignments, start/resume timed attempts, autosave answers, navigate questions and submit. The server calculates exact-match marks (no partial or negative credit).

Quiz routes and services live in `apps/api/src/modules/quizzes`; shared validators live in `packages/contracts/src/quizzes.ts`; the web feature is `apps/web/src/features/quizzes.tsx`. Attempts are handled by the quiz service rather than a separate attempt router.

The deadline is the earlier of original start plus duration and scheduled close. Question/option ordering and grading metadata are snapshotted. Content freezes after the first attempt; retakes preserve earlier results. Transactional allocation enforces limits, optimistic versions reject stale autosaves, and repeated submission cannot change a finalized score. A five-second API worker finalizes expired attempts without an open browser and catches up after restart. Unpublished results and unauthorized grading keys are withheld.

Verification includes grading, ownership, eligibility, race/retry, autosave conflict and expiry cases. The Phase 3 baseline had 48 passing tests; Phase 4 extends this to 67. Run `npm run verify`. MongoDB must support transactions. Production browser/domain and load testing remain Phase 5 work.
