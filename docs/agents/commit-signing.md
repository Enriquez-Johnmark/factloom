# Commit signing

Commits on `main` are signed with an SSH key, so that GitHub shows them as "Verified". The setup is local to a machine or a cloud session and is lost when the session's container is replaced. A new session repeats it before its first commit.

The private key is never written into the repository, a commit message or a log. In a cloud session it is supplied base64-encoded in the environment variable `GIT_SIGNING_KEY_B64`. The matching public key is registered on the owner's GitHub account as a signing key.

## Setup in a new session

`ssh-keygen` must be installed. On a Debian or Ubuntu image that lacks it, install `openssh-client`.

Decode the key into a file only the current user can read:

```sh
mkdir -p ~/.ssh && (umask 077 && printf '%s' "$GIT_SIGNING_KEY_B64" | base64 -d > ~/.ssh/kronomind_signing_key)
```

Derive the public key from it:

```sh
ssh-keygen -y -f ~/.ssh/kronomind_signing_key > ~/.ssh/kronomind_signing_key.pub
```

Configure this repository, not the global configuration:

```sh
git config gpg.format ssh && git config gpg.ssh.program ssh-keygen && git config user.signingkey ~/.ssh/kronomind_signing_key.pub && git config commit.gpgsign true
```

## Check

After the first commit of a session:

```sh
git log -1 --format='%G? %an <%ae> / %cn <%ce>'
```

The first letter is `G` for a good signature when an allowed-signers file is configured, and `U` or `N` otherwise. What counts is the "Verified" badge on GitHub for that commit. The author and the committer must both be the owner, as [`.claude/rules/git.md`](../../.claude/rules/git.md) requires.

If the variable is missing or the key does not work, stop and tell the owner. Do not commit unsigned as a workaround, and do not create a new key.
