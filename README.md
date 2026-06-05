# FIFA World Cup 2026 Prediction Challenge - V22 Firebase Test Concept

## What changed in V22

- Keeps the landing page as the first screen.
- Pre-fills saved test details if they exist, but does not skip the landing page.
- Connects the landing-page name/email form to Firebase Firestore.
- Saves test entries into the `test_entries` collection.
- Automatically assigns league:
  - `@lego.com` = LEGO
  - anything else = Friends & Family

## How to upload to GitHub Pages

Upload the contents of this ZIP to your GitHub repository root:

- `index.html`
- `README.md`

Your live URL should remain:

https://blanemckie.github.io/FIFA2026/

## How to test

1. Open the live GitHub Pages URL.
2. Enter a test name and email.
3. Click **Start Predicting →**.
4. Check Firebase Firestore.
5. You should see a collection called `test_entries`.

## Note on GitHub secret scanning

GitHub may flag the Firebase web API key as a public Google API key. This is expected for Firebase client-side web apps. The key is not a password. Before wider sharing, Firestore rules and API key restrictions should be tightened.
