# Fixed upstream image; this image never embeds Tailnet state or credentials.
FROM tailscale/tailscale:v1.102.4@sha256:2667499ed87ae29218f292556ba062918402dd5e92e93637af14867e4df12dd3
RUN apk add --no-cache python3=3.12.15-r0
LABEL com.taylor.ios-agent.component="developer-reflection"
