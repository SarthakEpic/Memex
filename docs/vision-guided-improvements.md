# Vision-guided improvement workflow

The `Memex improvement proposals` workflow runs on GitHub-hosted runners, so your computer can be off. It reads `VISION.md`, reviews the repository, and proposes at most one change per run. If the vision is incomplete or no improvement is clearly worthwhile, it skips the code change. Successful proposals pass the repository's `npm run ci` checks and appear as a draft pull request. The workflow never merges a pull request.

## One-time setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. Add it to **Settings → Secrets and variables → Actions** as `GEMINI_API_KEY`. Do not commit the key or paste it into `VISION.md`.
3. In **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. The workflow only requests the permissions needed to create its review PR.
4. Review and merge the workflow setup pull request. Then complete `VISION.md` and remove its setup note. Until then, scheduled runs deliberately skip.

## Schedule and review

Three GitHub schedule windows are spread through the day. A deterministic daily selection chooses one to three windows and adds a randomized delay, so the runs vary by date while remaining retryable. GitHub Actions schedules are best-effort and can start late during high load.

Each successful change is committed by `github-actions[bot]` to a dedicated proposal branch and opened as a draft pull request. The workflow runs the existing full CI command before publishing the change. Review the diff and CI results, then decide whether to merge it yourself.

## Cost and limits

The repository is public, so standard GitHub-hosted Actions runner usage is free under GitHub's public repository policy. Gemini model usage follows the quota and terms of the Google account or API key; free quotas are limited and can change. When the free allowance is exhausted, the AI step may fail until the quota resets. Keep any paid usage disabled if you require a hard zero-cost setup.
