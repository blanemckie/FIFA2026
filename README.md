# FIFA World Cup 2026 Prediction Challenge - V63

V63 adds production validation so only completed and locked submissions appear in Live Table and Results Centre.

## Included
- Landing-page registration is required before predictions can be submitted.
- Browse mode users can view the site but cannot lock predictions.
- Names are not added to the Live Table or Results Centre until the full prediction has been locked.
- Firebase `users` stores started registrations only.
- Firebase `entries` and `predictions` are created together only after lock-in.
- Live Table, Results Centre and Fun Stats read locked prediction submissions only.
