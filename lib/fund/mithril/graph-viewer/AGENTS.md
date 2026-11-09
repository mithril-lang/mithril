# Graph viewer contribution policy

Follow https://github.com/mithril-lang/.github/blob/main/LANGUAGE_POLICY.md.
English is the default for all system UI and accessible names. Japanese is an
explicit locale option. Preserve supplied node labels and execution records.
Verify both default English and explicit Japanese with `npm test`; run
`npm run check` before release. Publish only viewer code and descriptive library
metadata, never workspace graph data or computation engines.
