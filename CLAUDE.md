# Writing style

Do not use em dashes (—) or double hyphens (--) as sentence punctuation in generated content: marketing copy, page text, commit messages, PR descriptions, or code comments. Use a period, comma, or a new sentence instead.

This does not apply to hyphens inside compound words (e.g. "single-sourced", "real-time") or to code syntax (e.g. `--flag`, `a - b`).

# Testing

Use `123TestChurch` as the GuardianCheck test church for manual and production-connected testing. Do not create, edit, or delete test records in customer churches. In emulator and unit tests, use `123TestChurch` as the primary tenant fixture and a synthetic second tenant only when a cross-church denial needs to be tested.
