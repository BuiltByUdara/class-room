# Phase 4: results, progress and reports

Students use Progress reports; parents choose a linked child on their dashboard. Teachers/admins use Analytics to select a class and open individual student reports. Date filters, paginated attempt history and Download CSV report are available. Recharts trends have expandable data-table alternatives; topics include numeric mark totals. Empty metrics show No results.

## Calculation policy

- Summary scores use the latest submitted attempt per quiz, not the best. Attempt history preserves every submission. Completion counts unique quizzes.
- Students/parents see only published scores; pending submissions still count as completed. Managers may inspect unpublished scores within their authorized classes.
- Monthly trends use the latest attempt per student/quiz within each month. Earlier-month retakes remain represented. Reporting months and UI calendar boundaries use Asia/Colombo.
- Subject averages weight each latest quiz equally. Topics weight earned marks against available marks. Strengths are the top three topics at least 75%; practice suggestions are the lowest three below 50%.
- Assignment counts include currently eligible published/scheduled/closed quizzes, respecting class/batch membership and effective join dates. Submitted historical quizzes are included even after enrollment removal or archive. Missed means closed/expired without a submission.
- Date ranges filter submissions by submittedAt and current assignments by endsAt. Endpoints accept inclusive ISO instants; reversed/invalid ranges fail validation. Legacy enrollments fall back to createdAt where join dates are absent.
- No qualifying results means null averages/rates, rather than a fabricated zero. In-progress work is not a finalized result.

## Access and export

Every request checks the current user, parent link and teacher class scope. Shared students do not expose another teacher's results. JSON and CSV follow the same publication policy; snapshots and keys stay server-side. CSV includes summary, subjects, topics, missed quizzes and full filtered attempt history, with spreadsheet formula escaping. PDF export is not implemented.

## Implementation and verification

Contracts: `packages/contracts/src/progress.ts`. API: `modules/progress/{routes,service,calculations}.ts` and `modules/reports/csv.ts`. Web: `features/progress.tsx`, lazy-loaded from app routes. Recharts is the added chart dependency. No additional analytics collection or cache is needed.

Ten calculation tests and nine API tests cover retakes, dates, empty states, publication, linked-child isolation, teacher scope, pagination, historical results and export. The full suite has 67 passing tests. Browser QA verified two-child switching, published-only 62.5% average, an empty child, pending results, CSV download and a 390-pixel mobile layout without page overflow using disposable data.

Phase 5 still needs production-domain end-to-end checks, accessibility/cross-browser review, realistic load tests, index rollout, monitoring and backup restoration. Aggregation currently loads scoped history in memory; benchmark before large deployments. The main web bundle warning remains a release optimization item.
