# Vendored prerelease SDK

The Connect SDK tarballs make coordinated prerelease changes installable.
`mdbase-connect-sdk.json` records the immutable source revision, byte sizes,
and SHA-512 digests.

Refresh them from the Connect worktree with:

```sh
pnpm package:consumer --destination /path/to/pickle-android/vendor --packages connect,devkit,protocol,pickle,testing
```

Then update the `file:` references and run `pnpm install`. Return to exact npm
versions after the coordinated release is published.
