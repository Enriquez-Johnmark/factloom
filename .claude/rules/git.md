# Git rules

These rules apply to every change in this repository.

## Branch

- Work on `main` only. Do not create any other branch.
- Never force-push, never rewrite history, never delete a branch.
- If a push is rejected, stop and tell the owner. Do not push elsewhere as a workaround.

## Author

- Every commit is authored and committed as `Enriquez-Johnmark <enriquezjohnmark15@gmail.com>`.
- Check with `git log -1 --format='%an <%ae> / %cn <%ce>'` after the first commit of a session.

## Commit messages

- Conventional format with a short, specific subject: `docs: add research on bi-temporal modelling`.
- No `Co-Authored-By` line, no "Generated with" line, no session link.
- Use real timestamps. Do not backdate commits or space them out artificially.

## Commit size

- One logical change per commit: one document, one config file, one package.
- Commit only work that is complete enough to stand on its own.
- Push to `origin main` after each small group of related commits.

## The repository is public

- Never commit a secret. Before each push, check the diff for keys, tokens, and the contents of environment variables.
- `.env` files stay ignored.
- Write every document for a stranger. Criticism of other projects is factual, sourced, and neutral.
