# Releasing Markdownish

A release is a signed + notarized **Apple Silicon** macOS build (the only
architecture we ship) attached to a GitHub Release, plus a `latest.json`
manifest that drives the in-app auto-updater. The workflow does the heavy
lifting; you just push a tag.

```
git tag v0.1.0
git push origin v0.1.0
```

That triggers `.github/workflows/release.yml`, which:

1. Builds the frontend.
2. Compiles the Rust binary for `aarch64-apple-darwin`.
3. Codesigns the `.app` bundle with your Developer ID Application identity.
4. Notarizes the `.dmg` via `notarytool` and staples the ticket.
5. Signs the `.app.tar.gz` updater payload with the minisign key
   (`TAURI_SIGNING_PRIVATE_KEY`) and produces the `.sig` companion.
6. Drafts a GitHub Release with the `.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`
   and `latest.json` attached.

You then review the draft and click **Publish**.

The in-app auto-updater fetches
`https://github.com/Rohithgilla12/markdownish/releases/latest/download/latest.json`
on launch and prompts the user when a newer version is available.

If signing or notarization secrets aren't configured, the build still succeeds
— it just ships unsigned. Users will see the "unidentified developer" warning
on first launch.

## Secrets you need to add

Add these at
[Settings → Secrets and variables → Actions](https://github.com/Rohithgilla12/markdownish/settings/secrets/actions).

| Secret                                | What it is                                                        |
| ------------------------------------- | ----------------------------------------------------------------- |
| `APPLE_CERTIFICATE`                   | Base64-encoded `.p12` export of your Developer ID Application cert |
| `APPLE_CERTIFICATE_PASSWORD`          | Password you set when exporting the `.p12`                         |
| `APPLE_SIGNING_IDENTITY`              | `Developer ID Application: Your Name (TEAMID)`                     |
| `APPLE_ID`                            | Apple ID email used for notarization                               |
| `APPLE_PASSWORD`                      | App-specific password for that Apple ID                            |
| `APPLE_TEAM_ID`                       | 10-character team identifier                                       |
| `TAURI_SIGNING_PRIVATE_KEY`           | minisign private key from `pnpm tauri signer generate`             |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`  | password protecting the minisign key (optional — omit if none)     |

### 1. Export the Developer ID Application certificate

1. Open **Keychain Access**.
2. Locate **Developer ID Application: Your Name (TEAMID)** under
   **login → My Certificates**.
3. Right-click → **Export…** → save as `cert.p12`. Set a strong password —
   that's your `APPLE_CERTIFICATE_PASSWORD`.
4. Base64-encode the file:

   ```bash
   base64 -i cert.p12 -o cert.b64
   pbcopy < cert.b64        # copy to clipboard
   ```

5. Paste the contents into the `APPLE_CERTIFICATE` secret.

> The cert must include the private key. If the export option is greyed out,
> you're highlighting the wrong row — you want the cert, not just the key.

### 2. Get your signing identity string

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Copy the part inside the quotes (everything between the SHA and the trailing
`)`). It looks like:

```
Developer ID Application: Jane Doe (ABC1234DEF)
```

Add that as `APPLE_SIGNING_IDENTITY`.

### 3. Get your Team ID

The `(ABC1234DEF)` portion of the identity above. Also visible at
[developer.apple.com → Membership](https://developer.apple.com/account/#!/membership).

Add as `APPLE_TEAM_ID`.

### 4. Create an app-specific password for notarization

1. Go to [appleid.apple.com](https://appleid.apple.com/account/manage).
2. Under **Sign-In and Security → App-Specific Passwords**, generate one
   labeled `markdownish-notarize`.
3. Add the 16-character password as `APPLE_PASSWORD`.
4. Add your Apple ID email as `APPLE_ID`.

> Don't reuse your real Apple ID password — only app-specific passwords work
> with `notarytool`.

### Alternative: notarytool API key (optional, more secure)

If you'd rather use an App Store Connect API key instead of an app-specific
password, swap the last three secrets for:

| Secret               | What it is                                     |
| -------------------- | ---------------------------------------------- |
| `APPLE_API_KEY`      | Contents of the `.p8` private key (newlines OK) |
| `APPLE_API_ISSUER`   | The issuer UUID from App Store Connect          |
| `APPLE_API_KEY_ID`   | The 10-character key identifier                 |

And remove `APPLE_ID` / `APPLE_PASSWORD` from the workflow. The action picks
whichever pair is present.

### 5. Generate the updater signing key

The Tauri updater verifies each download against a minisign signature so a
compromised release host can't push malware. Generate the keypair once:

```bash
mkdir -p "$HOME/.config/markdownish/updater"
pnpm exec tauri signer generate \
  -w "$HOME/.config/markdownish/updater/key" \
  --ci --force
```

This produces:

- `~/.config/markdownish/updater/key` — **private**, never commit, treat
  like a password. Add as the `TAURI_SIGNING_PRIVATE_KEY` secret:
  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY \
    < ~/.config/markdownish/updater/key
  ```
- `~/.config/markdownish/updater/key.pub` — **public**, paste the contents
  (base64) into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

If you regenerate the keypair, **every existing installation stops receiving
updates** until users reinstall manually — the public key embedded in the
old binaries can no longer verify the new signatures. Don't do this lightly.

## Cutting a release

1. Make sure `main` is green.
2. Bump versions if needed:

   ```bash
   pnpm version 0.2.0 --no-git-tag-version   # writes package.json
   # also update src-tauri/Cargo.toml and src-tauri/tauri.conf.json by hand
   ```

3. Commit the bumps, push to main.
4. Tag and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. Watch the **Release** workflow at
   [Actions](https://github.com/Rohithgilla12/markdownish/actions).
6. When it finishes, go to
   [Releases](https://github.com/Rohithgilla12/markdownish/releases), edit
   the draft, paste release notes, click **Publish**.

## Smoke-testing the workflow without a tag

Use the **Run workflow** button on the **Release** workflow page with a
synthetic tag name (e.g. `v0.0.0-test`). The workflow will draft the release
under that name; delete the draft and the tag afterward.

## Troubleshooting

**`errSecInternalComponent` when signing.** The keychain unlock step inside
tauri-action sometimes races. Re-running the workflow usually fixes it.

**Notarization rejected.** Check the workflow logs for the notarytool log URL
— it'll tell you which file failed and why. Common causes: hardened runtime
not enabled, entitlements mismatch, or an unsigned dylib. Tauri 2 sets these
correctly by default; the issue is usually a custom Rust dep.

**`No identity found` even with the cert in place.** The cert is probably
missing its private key. Re-export from Keychain and make sure both the cert
and the key are highlighted before exporting.

**Build succeeds but no `.app` in the release.** Check the `args:` line in
`.github/workflows/release.yml`. If the target triple is wrong, tauri-action
silently skips bundle generation. Universal builds use
`--target universal-apple-darwin`.
