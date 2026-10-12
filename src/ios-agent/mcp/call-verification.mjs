// Fixed DEV call projection only. Never return identities, tokens, SDP or content.
export function callObservation(value, runtime, phase, {priorConnected=false}={}) {
  const call = value?.domains?.meet, media = value?.domains?.media;
  const count = n => Number.isSafeInteger(n) && n >= 0 ? Math.min(n, 1000) : null;
  const oneOf = (v, choices) => choices.includes(v) ? v : 'unknown';
  const domainPresent = !!call && typeof call.connected === 'boolean' && typeof call.ready === 'boolean';
  const pending = count(media?.requests?.pending);
  const base = {
    foregroundOwned: value?.visible === true && value?.secureContext === true && value?.indicator === true,
    sameRuntime: ['browser', 'boot', 'version'].every(k => typeof runtime?.[k] === 'string' && runtime[k].length > 0 && value?.[k] === runtime[k]),
    callContextObserved: domainPresent || (phase === 'released' && priorConnected),
    mediaRequestsSettled: pending === 0,
  };
  const healthy = domainPresent && call.supported === true && call.meetingNotFound === false && call.meetingLoadFailed === false && call.loading === false;
  const joined = healthy && call.ready === true && call.connected === true && call.connecting === false && call.roomState === 'connected';
  const observations = phase === 'released' ? {
    callDisconnected: domainPresent ? call.connected === false && call.connecting === false : priorConnected,
    observedTracksStopped: media?.hooks?.microphone === true && Array.isArray(media.tracks) && media.tracks.every(t => t.readyState === 'ended'),
    observedPeersClosed: media?.hooks?.peer === true && Array.isArray(media.connections) && media.connections.length === 0,
    callTracksStopped: domainPresent ? ['audio', 'video', 'screenShare'].every(k => call.tracks?.[k]?.present === false || call.tracks?.[k]?.state === 'ended') : priorConnected,
  } : phase === 'lobby' ? {
    lobbyReady: healthy && call.ready === true && call.connected === false && call.connecting === false,
  } : {
    callConnected: joined,
    ...(phase === 'paired' ? {remoteParticipantPresent: count(call?.participants) !== null && call.participants > 0} : {}),
  };
  const observation = {...base, ...observations};
  const ok = Object.values(observation).every(v => v === true);
  const liveTracksObserved = (Array.isArray(media?.tracks) && media.tracks.some(t=>t.readyState==='live')) ||
    ['audio','video','screenShare'].some(k=>call?.tracks?.[k]?.present===true&&call.tracks[k].state==='live');
  const reason = ok ? undefined : !base.sameRuntime ? 'call_runtime_changed' : !base.foregroundOwned ? 'call_foreground_required' : !base.callContextObserved ? 'call_domain_unavailable' : pending === null ? 'media_observation_incomplete' : pending > 0 ? 'media_requests_pending' : phase === 'released' ? 'call_media_release_unconfirmed' : phase === 'lobby' ? 'call_lobby_not_ready' : phase === 'paired' && joined ? 'remote_participant_absent' : 'call_not_connected';
  return {observation, reason, diagnostics: {
    phase, pendingMediaRequests: pending, remoteParticipants: count(call?.participants),
    microphoneTrackState: oneOf(call?.tracks?.audio?.state, ['live', 'ended']),
    microphoneTrackEnabled: typeof call?.tracks?.audio?.enabled === 'boolean' ? call.tracks.audio.enabled : null,
    cameraTrackState: oneOf(call?.tracks?.video?.state, ['live', 'ended']),
    releaseState: phase === 'released' ? ok ? 'released' : observations.callDisconnected && liveTracksObserved ? 'disconnected_with_live_tracks' : 'unconfirmed' : 'not_checked',
    microphonePermission: oneOf(call?.permissions?.microphone, ['granted', 'prompt', 'denied']),
    cameraPermission: oneOf(call?.permissions?.camera, ['granted', 'prompt', 'denied']),
    microphoneError: oneOf(call?.mediaErrors?.microphone, [null, 'blocked', 'dismissed', 'missing', 'in-use']),
    cameraError: oneOf(call?.mediaErrors?.camera, [null, 'blocked', 'dismissed', 'missing', 'in-use']),
  }};
}
