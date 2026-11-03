# Releases and k3s deployment

Production: **https://cary.lant.rip**. Source: `lantrip/cary-explorer`, default
branch `dev`. Upstream: `SAMEERSMR/cary-explorer`, branch `dev`.

GitHub Actions publishes private `ghcr.io/lantrip/cary-explorer:vX.Y.Z` images.
Flux scans stable versions, commits the selected tag and digest to
`lantrip/infastructure`, and k3s rolls out the Deployment. Branch pushes and
upstream synchronization run checks but never deploy. Actions needs no kubeconfig,
Keycloak secret, or infrastructure-repository write token.

## Update from upstream

Use Node 24 (Node >=22.12 is supported locally), npm, Git, and Bash.

```sh
git switch dev
scripts/sync-upstream.sh
git log --oneline origin/dev..HEAD
git push origin dev
```

The sync script requires a clean checkout and the expected remotes. It first
fast-forwards from your fork, then merges upstream without fetching upstream tags.
Your deployment additions remain part of the fork. It never pushes or force-resets.
If either merge stops, resolve the conflicts, `git add` the resolved files and
`git commit`, then run `scripts/check.sh` before pushing. Use `git merge --abort`
to cancel an in-progress merge. A failed check leaves the merge local for repair.

## Publish a release

Commit your changes and push `dev` before releasing:

```sh
scripts/release.sh v0.1.0
```

Use a new, strictly increasing stable version each time, such as `v0.1.1` next.
The script requires local HEAD to match `origin/dev`, runs the application checks,
creates an annotated tag, and pushes only that tag. It refuses dirty worktrees,
wrong remotes/branches, leading-zero or prerelease versions, and reused tags.
If a tag push fails, the local tag remains; inspect the remote before retrying the
printed push command. Never retag a published version.

The workflow validates that the tagged commit belongs to `dev`, checks the app,
builds linux/amd64, and smoke-tests the exact image before pushing it. GitHub
packages are private on first publication; the workflow verifies visibility and
refuses to publish into an existing public package. Keep the package connected to
this repository so its `GITHUB_TOKEN` can publish.

```sh
gh run list --repo lantrip/cary-explorer --limit 5
gh run watch RUN_ID --repo lantrip/cary-explorer
kubectl -n flux-system get imagerepository,imagepolicy cary-explorer
kubectl -n cary-explorer rollout status deployment/cary-explorer --timeout=120s
kubectl -n cary-explorer get deployment cary-explorer -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Allow several minutes for the image scan, shared image updater, and Flux source
reconciliation. A successful image push alone does not confirm deployment. Check
the Flux image reference and Deployment readiness. Publishing another version
repeats this same path; no direct `kubectl set image` is needed.

## Authentication and infrastructure

Manifests live under `apps/cary-explorer`, `apps/auth/keycloak/realms`, and
`apps/networking/gateway` in `lantrip/infastructure`. Existing wildcard DNS/TLS and
the shared image automation are reused. The Service is ClusterIP only.

Envoy protects the entire hostname, including `/data/` and `/assets/`, with the
`cary-explorer` Keycloak realm. Administrators create enabled users in that realm
at https://keycloak.lant.rip; self-registration and email password resets are off.
Assign a temporary initial password and require the user to change it on login.
Accounts in other realms do not automatically gain access.

Client: `cary-explorer-oidc-proxy`; callback:
`https://cary.lant.rip/oauth2/callback`; gateway logout:
`https://cary.lant.rip/oauth2/logout`. Gateway logout clears its session, but an
existing Keycloak SSO session may sign the user back in; end that session in
Keycloak when a full sign-out is needed.

Client secrets exist as SOPS-encrypted Secrets in both `auth` and `cary-explorer`.
The versioned reconciliation Job creates or updates only this client. Realm
imports are create-time only: never delete an existing realm to apply changes.
For client changes or secret rotation, update both encrypted Secrets and bump the
Job name version. Cluster GHCR credentials must have read access to the private
package in both the app namespace and `flux-system`.

First bootstrap publishes the image, provisions authentication and the private
workload, waits for the client Job and Deployment, then enables the HTTPRoute
against its already-existing SecurityPolicy. Confirm unauthenticated requests
redirect to Keycloak before considering the rollout complete.

## Roll back

In the infrastructure repo, make one commit changing both:

1. The `cary-explorer` ImagePolicy semver range to the exact previous version,
   such as `0.1.0`.
2. The Deployment image to that version and its recorded digest, retaining its
   `$imagepolicy` marker.

Push to infrastructure `main` and wait for Flux and Deployment readiness. This
holds the rollback even while the shared image updaters run. Do not suspend a
shared updater or run `kubectl rollout undo`: other apps share the updater, and
GitOps would revert a live-only change. Once a fixed higher version is published,
restore `>=0.1.0` to resume normal promotion. Retain old GHCR versions for rollback.

## Local verification

```sh
scripts/check.sh
bash tests/release-scripts.sh
docker build --platform linux/amd64 -t cary-explorer:check .
scripts/smoke-container.sh cary-explorer:check
```

The container smoke test verifies non-root execution with a read-only root
filesystem, health, catalog JSON, SPA fallback, missing-file 404s, and caching.
Shell tests use temporary Git repositories and stub npm; they never publish.

The release packages the checked-in catalog. Building a data pipeline and replacing
the current development basemap provider remain separate work.
