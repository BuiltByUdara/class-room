# Images in quiz questions

1. Upload a PNG, JPEG or another browser-readable image to Google Drive yourself.
2. In Drive, choose Share, set General access to Anyone with the link and the role to Viewer, then copy the file link.
3. Open Quizzes > Create quiz (or edit an unused draft). Under a question, paste the link into Google Drive image link.
4. Check the preview. Optionally add an image description for students using screen readers; avoid revealing the answer.
5. Complete the question text, options and correct answer, save the draft and publish when ready.

Students see the image above the answer options. It remains in resumed/submitted attempt views. Remove image clears it from an editable question. Existing text-only quizzes still work. Question text remains required; for a diagram-only exercise, use a short instruction such as “Use the diagram to answer.”

If the preview fails, verify that the file is an actual image (not a folder, Google Doc or PDF), its link is correct, and sharing allows anyone with the link to view. Retry image reloads the preview; Open image in Google Drive opens the original file. School/work accounts may restrict public sharing. Google may also limit embedding or availability independently of this app.

Uploads remain manual. There is no Drive login, API key, upload automation or server-side image download. Supported inputs include Drive /file/d/ID/view and /open?id=ID links, including resource keys. Other hosts and unsafe URL schemes are rejected. The app renders a Drive thumbnail at up to 1600px width; the original-file link provides access to full detail.

The database stores the link and optional description on questions and immutable attempt snapshots. It does not copy image bytes: changing, replacing, deleting or restricting the Drive file affects existing quizzes and attempts. Keep the original file unchanged and available while students need it.

Rebuild the web deployment and apply its updated _headers policy: image sources now include drive.google.com and Google image delivery hosts (*.googleusercontent.com). Hosts configured manually need the equivalent img-src rule. Existing API deployments must also be updated to save/return the new optional fields. No data migration or index is required.
