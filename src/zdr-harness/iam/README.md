# Harness AWS credential

`zdr-harness-logs-policy.json` is the inline policy for the IAM user
**`zdr-harness-logs`**, whose access key lets the harness read production Lambda
logs through `src/zdr-harness/mcps/kickoff-logs`. It is kept here as the
reviewable record of what that credential may do.

Read-only, production-only: it covers 221 of the account's 748 Lambda log
groups (676 GB as of 2026-09-17) and grants no write action anywhere.

The user is created by hand, not by an agent. `dev-tools/scoped-role` in the
kickoff repo has no rule for this ARN, and `iam:CreateAccessKey` appears there
only as a re-permissioning action, so minting the key stays a human step.

```sh
aws iam create-user --user-name zdr-harness-logs --profile kickoff-prod
aws iam put-user-policy --user-name zdr-harness-logs \
  --policy-name read-production-lambda-logs \
  --policy-document file://src/zdr-harness/iam/zdr-harness-logs-policy.json \
  --profile kickoff-prod
aws iam create-access-key --user-name zdr-harness-logs --profile kickoff-prod
```

Then put the key into the harness without it passing through a shell history or
a chat, and restart the server so it is read:

```sh
zdr-harness set-token KICKOFF_ZDR_AWS_ACCESS_KEY_ID
zdr-harness set-token KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY
```

If AWS rejects the resource scoping on `logs:DescribeLogGroups` or
`logs:GetQueryResults`, widen only those two actions to
`arn:aws:logs:us-west-1:414993717154:log-group:*`. Both return metadata and
query results rather than log content, and the MCP server filters groups to the
production namespaces regardless of what IAM allows.
