#!/usr/bin/env bash
# From a trusted shell with gcloud installed and an authorized Google Cloud project.
# Requires human provisioning/consent of the billing account. Never run from the PWA.
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
: "${MEDUSA_CLOUD_SHARED_SECRET:?Set a fresh 48-128 char random base64url secret}"
if [[ ! "$MEDUSA_CLOUD_SHARED_SECRET" =~ ^[A-Za-z0-9_-]{48,128}$ ]]; then
  echo "Cloud shared secret must be random URL-safe characters, length 48-128." >&2
  exit 1
fi
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE="medusa-cloud"
SERVICE_ACCOUNT="$SERVICE@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"
WORKDIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
cleanup() { rm -f "$ENV_FILE"; }
trap cleanup EXIT
printf 'MEDUSA_CLOUD_SHARED_SECRET: "%s"\n' "$MEDUSA_CLOUD_SHARED_SECRET" > "$ENV_FILE"

# A dedicated service account: no application-specific IAM roles.
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" \
    --project "$GOOGLE_CLOUD_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE" \
    --project "$GOOGLE_CLOUD_PROJECT" --display-name="Medusa isolated runtime"
fi
# Cloud Run sandboxes require second-generation execution environment.
gcloud beta run deploy "$SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$REGION" \
  --source "$WORKDIR" --sandbox-launcher --execution-environment gen2 \
  --service-account "$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --memory 512Mi --cpu 1 --concurrency 1 \
  --min-instances 0 --max-instances 1 --timeout 20s \
  --env-vars-file "$ENV_FILE"
echo "Cloud Run deployed. HTTPS URL:"
gcloud run services describe "$SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$REGION" \
  --format='value(status.url)'
echo "KEEP MEDUSA_ENABLED and MEDUSA_FAMILY_ENABLED disabled in Railway until the"
echo "isolated live smoke test, secret pairing, permissions, and spend cap are verified."
