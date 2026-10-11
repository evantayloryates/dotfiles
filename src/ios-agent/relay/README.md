# Developer reflection deployment

The nearby managed `ios_web_open` path passed on the physical phone. The
Wi-Fi-off endpoint returned TCP RST/ACK; cellular Inspector is not delivered.
This setup does not affect the ordinary enrolled-page or native app drivers.

## Current approved infrastructure

`runner-relay-test` advertises only `10.7.0.1/32` in Taylor's existing personal
tailnet. It has no exit-node, SSH, Serve or Funnel service. Taylor approved retaining this same node for personal DEV; adoption and
readback passed with restart policy `unless-stopped`. The node state stays in the private service state
directory; no credential enters this repository or image.

`ios-agent reflection-admin plan` independently verifies the exact private
container/image pins, read-only probe mount, state mount, startup command,
personal account, route, no-SNAT and disabled optional services. It prints a
sanitized node ID and whether promotion is still needed. It never changes
network settings or creates a node.

## Guarded adoption

For an explicitly approved existing node, the agent can
run `ios-agent reflection-admin adopt --allow-persistent-node --expected-node
<node ID from the reviewed plan>` at an idle service point. This changes only
the exact existing container's restart policy to `unless-stopped` and private
configuration scope to `personal-dev`. It does not restart/replace the container,
alter routes, log in, enable Funnel or recreate pairing. Readback checks the
node and restart policy. An uncertain failure requires a new read-only plan;
it is never automatically replayed.

Docker Desktop and the Mac must remain awake/running. This is not a promise
of unattended login after a Mac restart. An explicit container stop stays
stopped; temporary per-session packet reflection still expires after 60 seconds.

## Rebuild recipe

`Dockerfile` pins the official Tailscale image by version and digest and pins
Python's Alpine package version. It includes no state and uses the upstream
entrypoint unless an operator deliberately supplies the qualified `tailscaled`
command. The initial reproducible build is locally tagged
`runner-packet-relay:1.0.0`; it does not replace the approved live container.
A replacement/migration must preserve the exact private node state and verify
identity; the adoption command intentionally cannot perform one.

The built image passed an isolated network-disabled Linux smoke: create TUN,
run the real bounded reflector, exit, and independently confirm the TUN is gone.
No Tailscale daemon or new account/node was started for that smoke. It proves
the image runtime, not another iPhone network condition.

References:
[Official Docker parameters](https://tailscale.com/docs/features/containers/docker/docker-params),
[Subnet routing](https://tailscale.com/docs/features/subnet-routers),
[SNAT configuration](https://tailscale.com/docs/reference/troubleshooting/network-configuration/disable-subnet-route-masquerading).
