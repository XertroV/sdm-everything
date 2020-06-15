#!/usr/bin/env bash

. ./env.sh


usage() {
  echo "$0 [--update-edge-version]"
  exit 1
}


# If this is a new deployment or you update the index-lambda, add `  Nonce=$RANDOM \`

PARAMS=""

while test $# != 0
do
  case "$1" in
    --update-edge-version)    PARAMS="$PARAMS Nonce=$RANDOM" ;;
    --help|-h)  usage ;;
    *)  usage ;;
  esac
  shift
done


aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name $STACK_NAME \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
  PreviewBucketName=$STACK_NAME-public \
  pHostedZoneName=flx.dev. \
  'pPreviewRecordSetDomain=*.preview.flx.dev.' \
  'pCertArn=arn:aws:acm:us-east-1:076866892044:certificate/049db79c-199d-4afd-91d7-1b391a63922e' \
  $PARAMS \
  --region us-east-1
