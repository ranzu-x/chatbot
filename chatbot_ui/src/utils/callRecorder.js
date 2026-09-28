/**
 * Records a WhatsApp call in the agent's browser: the agent's microphone and
 * the customer's audio mixed into one track (Meta's Calling API has no
 * recording of its own — the media flows through our RTCPeerConnection).
 * Used for calls answered (Components/Calls/IncomingCallManager.jsx) and
 * placed (hooks/useWhatsAppCall.js) when "Record calls" is on for the number.
 *
 *   const rec = startCallRecording(localStream, pc);
 *   const blob = await rec.stop(); // null when nothing usable was recorded
 */
export function startCallRecording(localStream, pc) {
  if (typeof MediaRecorder === 'undefined' || !localStream) return null;
  let ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return null;
  }
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(localStream).connect(dest);

  const connected = new Set();
  const attach = (stream) => {
    if (!stream || connected.has(stream.id) || !stream.getAudioTracks().length) return;
    connected.add(stream.id);
    ctx.createMediaStreamSource(stream).connect(dest);
  };
  pc.getReceivers?.().forEach((r) => { if (r.track?.kind === 'audio') attach(new MediaStream([r.track])); });
  const onTrack = (e) => attach(e.streams?.[0] || new MediaStream([e.track]));
  pc.addEventListener('track', onTrack);

  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
  let recorder;
  try {
    recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
  } catch {
    ctx.close().catch(() => {});
    return null;
  }
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  recorder.start(5000);
  const startedAt = Date.now();

  return {
    startedAt,
    stop: () => new Promise((resolve) => {
      pc.removeEventListener('track', onTrack);
      const finish = () => {
        ctx.close().catch(() => {});
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob.size > 2000 ? blob : null);
      };
      if (recorder.state === 'inactive') { finish(); return; }
      recorder.onstop = finish;
      try { recorder.stop(); } catch { finish(); }
    }),
  };
}
