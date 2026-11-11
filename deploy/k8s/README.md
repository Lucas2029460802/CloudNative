# Kubernetes deployment

Kustomize manifests for the Venue Booking System: `web` and `api` Deployments, a `postgres`
StatefulSet with a PVC, the `venue-report` CronJob (also the template for manual report Jobs) and a
`fluent-bit` DaemonSet. Everything lives in the `venue-booking` namespace.

Tested with minikube (docker driver, one node, StorageClass `standard`) and kubectl's built-in Kustomize.

## Prerequisites

- A running cluster: `minikube start`
- A POSIX shell: the commands below assume Git Bash or WSL on Windows
- Docker, and a `.env` in the repository root (`cp .env.example .env`): Compose needs it to build

## Deploy

```bash
# 1. Build both images and load them into the cluster (no registry).
IMAGE_TAG=2.0.0 docker compose build api frontend
minikube image load venue-booking/api:2.0.0 venue-booking/frontend:2.0.0

# 2. Create the database credentials (gitignored); change the password.
cp deploy/k8s/secret.env.example deploy/k8s/secret.env

# 3. Apply everything.
kubectl apply -k deploy/k8s

# 4. Open the UI. On Windows the node IP is not routable; keep this terminal open.
minikube service web -n venue-booking --url
```

`images[].newTag` in `kustomization.yaml` must match `IMAGE_TAG`. For a rebuild, use a new tag in both
places and load the images again; the same tag would not roll the pods. ConfigMaps and the Secret get
a content hash in their name, so editing `config.env`, `secret.env` or the Fluent Bit pipeline also
rolls the affected pods. Exception: PostgreSQL reads `POSTGRES_PASSWORD` only when it initialises an
empty data directory, so changing it later needs `ALTER ROLE` (or deleting the PVC, which deletes the data).

## Verify

Set `URL` to the address printed by `minikube service`.

```bash
kubectl -n venue-booking rollout status deploy/api deploy/web sts/postgres
kubectl -n venue-booking get deploy,sts,ds,cronjob,job,svc,cm,secret,pvc,pod -o wide

# Several API replicas answer: expect more than one distinct pod name.
for i in $(seq 10); do curl -sI "$URL/api/venues" | grep -i x-served-by; done

# One-off report Job.
curl -s -X POST "$URL/api/reports" -H 'content-type: application/json' \
  -d '{"from":"2026-11-12","to":"2026-11-18"}'
kubectl -n venue-booking get jobs -L venue-booking/report-id
kubectl -n venue-booking logs job/<job-name>
curl -s "$URL/api/reports"

# CronJob: runs every 2 minutes (demo cadence); wait, then expect new Jobs and one scheduled report row.
kubectl -n venue-booking get cronjob venue-report
kubectl -n venue-booking get jobs --watch

# DaemonSet: DESIRED = READY = number of nodes; its stdout shows the app's container logs.
kubectl -n venue-booking get ds fluent-bit
kubectl -n venue-booking logs ds/fluent-bit --tail=5

# PVC: data survives deleting the database pod.
kubectl -n venue-booking get pvc
kubectl -n venue-booking delete pod postgres-0
kubectl -n venue-booking rollout status sts/postgres
curl -s "$URL/api/venues"

# RBAC: the api ServiceAccount can create Jobs but not delete pods.
kubectl -n venue-booking auth can-i create jobs --as=system:serviceaccount:venue-booking:api
kubectl -n venue-booking auth can-i delete pods --as=system:serviceaccount:venue-booking:api
```

## Tear down

```bash
kubectl delete -k deploy/k8s   # also deletes the namespace, and with it the PVC and all data
```
