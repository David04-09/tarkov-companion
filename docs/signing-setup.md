# Code signing setup (SignPath Foundation)

The release workflow already contains the signing steps; they switch on as soon as the secret and
variables below exist. Until then every release is built unsigned, exactly as before.

## 1. Before applying

- Turn on two-factor authentication for your GitHub account (Settings → Password and authentication). SignPath requires it for everyone in the project.
- The project must already be public on GitHub with at least one release (it is).

## 2. Apply

Apply at <https://signpath.org/apply> (SignPath Foundation, free for open-source projects). Useful answers:

| Question | Answer |
| --- | --- |
| Project name | Tarkov Companion |
| Repository | https://github.com/David04-09/tarkov-companion |
| Licence | GPL-3.0-or-later (OSI approved), no commercial dual licensing |
| What it does | Free companion app for Escape from Tarkov: quest tracking, interactive maps, item and hideout planning, a stash screenshot scanner and automatic quest completion read from the game's own log files. It never touches the game process, memory, input or network traffic. |
| Download page | https://github.com/David04-09/tarkov-companion/releases |
| Build system | GitHub Actions, `.github/workflows/release.yml`, on version tags only |
| Files to sign | `TarkovCompanion-Setup-<version>.exe` (NSIS installer) and `TarkovCompanion-<version>-portable.exe` |
| Code signing policy | README → "Code signing policy" |
| Privacy policy | PRIVACY.md |
| Team | David04-09: author, reviewer and approver |
| Third-party / non-OSS parts | None inside the signed files. The Lighthouse map tiles (CC BY-NC-SA) and the scanner data (made from game item pictures) are separate downloads ("content packs") that the program fetches and checks by SHA-256; they contain no code. |

## 3. After approval (in SignPath)

1. Connect the GitHub repository as a trusted build system (SignPath shows the steps; it uses the "GitHub.com" connector).
2. Create (or check) the project and a **release-signing** policy with manual approval, with you as approver.
3. Artifact configuration (the workflow uploads a zip with the two exe files at the top level):

```xml
<?xml version="1.0" encoding="utf-8" ?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="TarkovCompanion-Setup-*.exe" max-matches="1">
      <authenticode-sign />
    </pe-file>
    <pe-file path="TarkovCompanion-*-portable.exe" max-matches="1">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

4. Create an API token for a CI user that may submit signing requests.

## 4. Switch it on (GitHub → repository → Settings → Secrets and variables → Actions)

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `SIGNPATH_API_TOKEN` | the API token |
| Variable | `SIGNPATH_ORGANIZATION_ID` | your SignPath organization id |
| Variable | `SIGNPATH_PROJECT_SLUG` | the project slug (e.g. `tarkov-companion`) |
| Variable | `SIGNPATH_POLICY_SLUG` | the signing policy slug (e.g. `release-signing`) |

From the next version tag on, the build waits (up to about 5.5 hours) for your approval e-mail;
click Approve and the signed release is published. If the wait runs out, re-run the workflow.

## 5. After the first signed release

Tell Claude to turn on update signature checks (`publisherName` = the certificate's subject,
`verifyUpdateCodeSignature` back on), so the app only accepts updates signed with the same certificate.
