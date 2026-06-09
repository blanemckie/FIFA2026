# FIFA World Cup 2026 Prediction Challenge - V65

V65 consolidates the header alignment and league display fixes.

## Included
- Centres the premium page header bubbles consistently across all pages.
- Standardises header width, spacing, icon alignment and mobile behaviour.
- Moves Results Centre selector closer to the header/content flow.
- Safeguards LEGO/Main league display by using the saved `league` field and falling back to `@lego.com` email detection.
- Keeps production Firestore collections: `entries`, `users`, and `predictions`.
