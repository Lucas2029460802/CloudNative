# Lab 3 TODO

## Stop writing the namespace into the nginx upstream

`deploy/k8s/web.yaml` sets `API_UPSTREAM=http://api.venue-booking.svc.cluster.local:3000`. The full name is needed because nginx's own `resolver` (added in Lab 1 so nginx re-resolves the api container's IP) ignores the DNS search domains, so the short name `api` fails with `api could not be resolved` (502).

Options, smallest first:

1. Downward API: add env `POD_NAMESPACE` from `fieldRef: metadata.namespace`, then `API_UPSTREAM=http://api.$(POD_NAMESPACE).svc.cluster.local:3000`. The `$(VAR)` pattern is already used for `DATABASE_URL` in `deploy/k8s/api.yaml`. YAML only, no image change.
2. Skip nginx's own resolver on Kubernetes (a Service's ClusterIP never changes), so plain `http://api:3000` works. Needs a template change shared with Compose.

Decided 2026-11-27 to leave it for Lab 3: nothing is broken and there was no time before the 2026-11-30 presentation.
