# Harness AWS credential

`zdr-harness-logs-policy.json` is the inline policy for the IAM user
**`zdr-harness-logs`**, whose access key lets the harness read production Lambda
logs through `src/zdr-harness/mcps/kickoff-logs`. It is kept here as the
reviewable record of what that credential may do.

Read-only, production-only: log content comes from 221 of the account's 748
Lambda log groups (676 GB as of 2026-09-17), and no write action is granted
anywhere.

Two statements, because AWS would not accept one. `DescribeLogGroups` and
`StopQuery` refuse group-scoped ARNs in practice, even scoped to
`log-group:*` — `simulate-principal-policy` returns `implicitDeny` until their
resource is `*`. Both are safe to widen: one lists group names, sizes and
retention, the other cancels a query this credential started. Everything that
reads log *content* stays pinned to the production namespaces.

Verified with `simulate-principal-policy` after applying:

| Action | `/aws/lambda/kudos-node-production-graphql` | `/aws/lambda/kickoff-api-beta-*` |
|---|---|---|
| `FilterLogEvents`, `GetLogEvents`, `StartQuery`, `GetQueryResults`, `DescribeLogStreams` | allowed | implicitDeny |
| `PutLogEvents`, `DeleteLogGroup`, `s3:GetObject`, `rds:DescribeDBInstances` | implicitDeny | implicitDeny |

The user is created by hand, not by an agent. `dev-tools/scoped-role` in the
kickoff repo has no rule for this ARN, and `iam:CreateAccessKey` appears there
only as a re-permissioning action, so minting the key stays a human step.

The `file://` path is relative to the working directory, so use an absolute one
unless you are at the root of this repo:

```sh
aws iam create-user --user-name zdr-harness-logs --profile kickoff-prod
aws iam put-user-policy --user-name zdr-harness-logs \
  --policy-name read-production-lambda-logs \
  --policy-document file://"$HOME"/src/github/dotfiles/src/zdr-harness/iam/zdr-harness-logs-policy.json \
  --profile kickoff-prod
aws iam create-access-key --user-name zdr-harness-logs --profile kickoff-prod
```

Then put the key into the harness without it passing through a shell history or
a chat, and restart the server so it is read:

```sh
zdr-harness set-token KICKOFF_ZDR_AWS_ACCESS_KEY_ID
zdr-harness set-token KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY
```

The MCP server filters groups to the production namespaces regardless of what
IAM allows, so `list_groups` shows only those even though `DescribeLogGroups`
itself is account-wide.

## v2: transcripts and the database tunnel (2026-09-24)

`zdr-harness-policy.json` supersedes `zdr-harness-logs-policy.json`. It keeps
the two log statements unchanged and adds four:

| Sid | What | Why it is safe |
|---|---|---|
| `ReadArchivedCallTranscripts` | `s3:GetObject`, `s3:GetObjectVersion` on `kickoff-transcript-archive-production/transcripts/v1/*` | Read only, one bucket, one prefix; no `ListBucket`, so the credential cannot enumerate the archive, only fetch objects a database row names |
| `DecryptArchivedCallTranscripts` | `kms:Decrypt` on the archive key, only `ViaService: s3.us-west-1.amazonaws.com` | The key policy defers to IAM; the condition means the key is unusable outside an S3 read |
| `TunnelToProductionReadReplicaViaBastion` | `ssm:StartSession` on the Kickoff Bastion instance and the port-forward document only | Cannot open a shell (`AWS-StartInteractiveCommand`, `SSM-SessionManagerRunShell` are not granted), cannot reach any other instance |
| `ManageOwnTunnelSessions` | `ssm:TerminateSession`, `ssm:ResumeSession` on sessions named `zdr-harness-logs-*` | Its own sessions only |

The database credential itself is not in IAM: `kudos_ro` is a MySQL user, held
in `src/zdr-harness/.env` as `KICKOFF_ZDR_DB_URL`.

Apply, as the human with the prod profile (the policy name stays so nothing is
left behind):

```sh
aws iam put-user-policy --user-name zdr-harness-logs \
  --policy-name read-production-lambda-logs \
  --policy-document file://"$HOME"/src/github/dotfiles/src/zdr-harness/iam/zdr-harness-policy.json \
  --profile kickoff-prod
```

Then `zdr-harness tunnel start` runs under the harness key instead of a human's.
