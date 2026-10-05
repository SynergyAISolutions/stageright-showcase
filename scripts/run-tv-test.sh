#!/bin/bash
# Run N Living Room stagings and save results for TV-count analysis
set -e
export MSYS_NO_PATHCONV=1

HERO_KEY="tenants/anonymous/originals/testrun-1776314192/original.jpg"
BUCKET="stageright-images"
REGION="ap-southeast-2"
TABLE="stageright"
LAMBDA="stageright-staging-worker"
N=${1:-5}
LABEL=${2:-current}
OUTDIR="tv-test-results/$LABEL"
mkdir -p "$OUTDIR"
mkdir -p ./tmp

echo "Running $N test stagings with label '$LABEL'..."

JOB_IDS=()

# Invoke all in parallel
for i in $(seq 1 $N); do
  JOB_ID="tvtest-$LABEL-$(date +%s)-$i"
  JOB_IDS+=("$JOB_ID")
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  # Put job
  aws dynamodb put-item --region "$REGION" --table-name "$TABLE" --item "{
    \"pk\":{\"S\":\"JOB#$JOB_ID\"},
    \"sk\":{\"S\":\"META\"},
    \"jobId\":{\"S\":\"$JOB_ID\"},
    \"status\":{\"S\":\"pending\"},
    \"action\":{\"S\":\"stage\"},
    \"createdAt\":{\"S\":\"$NOW\"},
    \"updatedAt\":{\"S\":\"$NOW\"}
  }" > /dev/null

  # Invoke lambda async
  cat > ./tmp/payload-$i.json <<EOF
{"jobId":"$JOB_ID","action":"stage","params":{"heroS3Key":"$HERO_KEY","referenceS3Keys":[],"style":"Modern","model":"nano-banana-2","roomAnalysis":"","roomTypes":["Living Room"]}}
EOF
  aws lambda invoke --region "$REGION" --function-name "$LAMBDA" --invocation-type Event --payload "file://./tmp/payload-$i.json" --cli-binary-format raw-in-base64-out ./tmp/lambda-out-$i.json > /dev/null
  echo "  Invoked $JOB_ID"
done

echo "All invoked. Polling for results..."

for JOB_ID in "${JOB_IDS[@]}"; do
  for ATTEMPT in $(seq 1 40); do
    STATUS=$(aws dynamodb get-item --region "$REGION" --table-name "$TABLE" \
      --key "{\"pk\":{\"S\":\"JOB#$JOB_ID\"},\"sk\":{\"S\":\"META\"}}" \
      --query 'Item.status.S' --output text 2>/dev/null || echo "none")
    if [ "$STATUS" = "done" ]; then
      RESULT=$(aws dynamodb get-item --region "$REGION" --table-name "$TABLE" \
        --key "{\"pk\":{\"S\":\"JOB#$JOB_ID\"},\"sk\":{\"S\":\"META\"}}" \
        --query 'Item.result.S' --output text)
      S3KEY=$(echo "$RESULT" | python -c "import sys,json; print(json.load(sys.stdin)['s3Key'])")
      aws s3 cp "s3://$BUCKET/$S3KEY" "$OUTDIR/${JOB_ID}.jpg" --region "$REGION" > /dev/null
      echo "  $JOB_ID -> $OUTDIR/${JOB_ID}.jpg"
      break
    elif [ "$STATUS" = "error" ]; then
      echo "  $JOB_ID FAILED"
      break
    fi
    sleep 3
  done
done

echo "Done. Results in $OUTDIR"
ls -la "$OUTDIR"
