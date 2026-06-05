# FIFA World Cup 2026 Prediction Challenge - V23 Firebase Test

Conceptual GitHub Pages build with Firebase test registration and full prediction save.

## What changed in V23

- Registration saves to Firebase `test_entries`.
- Registration also saves to Firebase `test_users` for a cleaner future admin structure.
- Lock In Full Tournament Prediction saves a full submission to Firebase `test_predictions`.
- Submission includes name, email, league, all group-stage score predictions, knockout picks and predicted winner.
- Added a short success toast after registration and after full prediction save.
- Test collections are deliberately prefixed with `test_` so they can be deleted before the real launch.

## Upload to GitHub

Upload the contents of this ZIP to the root of the `FIFA2026` repository. Do not upload the ZIP file itself.

## Firebase collections used

- `test_entries`
- `test_users`
- `test_predictions`

## Before full launch

Replace test collections with real collections such as:

- `entries`
- `users`
- `predictions`

And tighten Firestore security rules.
