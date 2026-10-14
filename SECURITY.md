# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for anything security-related.

Use GitHub's private reporting instead: go to the [**Security** tab](https://github.com/kiwicro/valheim-nitrado-panel/security)
of this repository and click **Report a vulnerability**. That opens a private
advisory only you and the maintainer can see.

Please include:

- what the issue is and where in the code it lives,
- how to reproduce it (steps, requests, or a small proof of concept),
- the impact you think it has.

You can expect an acknowledgement within a few days. If the report is valid, a
fix and an advisory will be published, and you will be credited unless you ask
otherwise.

## Scope

This project is a **local** tool that talks to the Nitrado API on your behalf, so
the most valuable reports are ones about:

- the panel leaking a token (to the browser, a log, a URL, a screenshot, or a
  third party),
- the localhost live-map proxy forwarding somewhere it should not, or exposing
  the live-map token,
- the file browser or editor reading or writing outside the server's file tree,
- the panel being reachable from the network when it is configured for
  `127.0.0.1`.

Out of scope:

- **Anything that needs the token or FTP credentials.** Holding the Nitrado API
  token or the live-map token is equivalent to being the owner; that is by
  design, and rotating them is the intended remedy.
- **The fact that tokens are stored unencrypted in `data/config.json`.** This is
  documented behaviour — see the *Security and your token* section of the README.
- Vulnerabilities in Nitrado's own API, in the [ValheimOne](https://github.com/humangenome/ValheimOne)
  plugin, or in [valheim-map.world](https://valheim-map.world). Report those to
  their respective projects.

## How secrets are meant to be handled

The project ships **no secrets**. Tokens live only in the git-ignored
`data/config.json`, or in a local `.env`; both are excluded from version control.
If you find a committed credential anywhere in the repository or its history,
treat it as a reportable issue and use the private channel above.

## Supported versions

This is a small self-hosted tool, not a library. Only the latest commit on the
default branch is supported; there are no backports to older versions. The
fix for any reported issue lands there.
