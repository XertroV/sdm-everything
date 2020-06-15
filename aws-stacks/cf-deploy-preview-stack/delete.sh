#!/usr/bin/env bash

. ./env.sh

aws cloudformation delete-stack --stack-name $STACK_NAME
