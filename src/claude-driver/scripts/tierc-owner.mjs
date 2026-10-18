#!/usr/bin/env node
// This private owner starts no bridge itself; it owns one existing UI worker.
import {serveUiLeaseOwner} from '../lib/ui-lease-owner.mjs'
await serveUiLeaseOwner()
