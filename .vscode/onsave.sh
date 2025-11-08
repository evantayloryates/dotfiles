#!/bin/bash

# Format: MM/DD H:MM.SSam/pm
TIMESTAMP=$(TZ=EST date "+%m/%d %-I:%M.%S%p")

CHANGES_PUSHED=0

git add . > /dev/null 2>&1

if git commit -m "$TIMESTAMP" > /dev/null 2>&1; then
  git push > /dev/null 2>&1
  CHANGES_PUSHED=1
fi

if [ $CHANGES_PUSHED -eq 1 ]; then
  echo "Pushed commit: $TIMESTAMP"
fi

