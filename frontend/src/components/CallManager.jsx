import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  PictureInPicture,
  SwitchCamera,
  Video,
} from 'lucide-react';
import { emitChatEvent } from '../services/chatSocket.js';

const stopStream = (stream) => stream?.getTracks().forEach((track) => track.stop());

function CallAvatar({ peer }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-primary/30 text-3xl font-semibold">
      {peer?.avatar && !imageFailed ? (
        <img
          src={peer.avatar}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        peer?.name?.slice(0, 1)?.toUpperCase() || '?'
      )}
    </div>
  );
}

function CallManager({ socket, user }) {
  const [call, setCall] = useState(null);
  const [callError, setCallError] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const callRef = useRef(call);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const fallbackRemoteStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const startedAtRef = useRef(null);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const clearMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    fallbackRemoteStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    startedAtRef.current = null;
  }, []);

  const endLocally = useCallback(() => {
    clearMedia();
    setCall(null);
    setCallError('');
    setConnectionState('connecting');
    setElapsedSeconds(0);
    setMuted(false);
    setCameraEnabled(true);
  }, [clearMedia]);

  const startPeer = useCallback(
    async (acceptedCall, isCaller) => {
      if (peerRef.current) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
          throw new Error('Voice and video calls are not supported by this browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: acceptedCall.type === 'video',
        });
        if (callRef.current?.callId !== acceptedCall.callId) {
          stopStream(stream);
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        const peer = new RTCPeerConnection({ iceServers: acceptedCall.iceServers || [] });
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peer.ontrack = (event) => {
          let streamFromPeer = event.streams[0];
          if (!streamFromPeer) {
            streamFromPeer = fallbackRemoteStreamRef.current || new MediaStream();
            fallbackRemoteStreamRef.current = streamFromPeer;
            if (!streamFromPeer.getTracks().some((track) => track.id === event.track.id)) {
              streamFromPeer.addTrack(event.track);
            }
          }
          setRemoteStream(streamFromPeer);
        };
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            void emitChatEvent(socket, 'webrtc:ice', {
              callId: acceptedCall.callId,
              candidate: event.candidate.toJSON(),
            }).catch((error) => setCallError(error.message));
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') {
            startedAtRef.current ||= Date.now();
            setConnectionState('connected');
            setCall((current) => (current ? { ...current, status: 'connected' } : current));
          } else if (peer.connectionState === 'disconnected') {
            setConnectionState('reconnecting');
          } else if (peer.connectionState === 'failed') {
            setConnectionState('failed');
            setCallError('The call connection failed. Check your network and try again.');
          } else if (peer.connectionState === 'connecting') {
            setConnectionState('connecting');
          }
        };
        setConnectionState('connecting');

        const pendingOffer = pendingOfferRef.current;
        if (!isCaller && pendingOffer) {
          await peer.setRemoteDescription(pendingOffer);
          pendingOfferRef.current = null;
          for (const candidate of pendingCandidatesRef.current.splice(0)) {
            await peer.addIceCandidate(candidate);
          }
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await emitChatEvent(socket, 'webrtc:answer', {
            callId: acceptedCall.callId,
            description: peer.localDescription.toJSON(),
          });
        } else if (isCaller) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await emitChatEvent(socket, 'webrtc:offer', {
            callId: acceptedCall.callId,
            description: peer.localDescription.toJSON(),
          });
        }
      } catch (error) {
        setCallError(
          error.name === 'NotAllowedError' || error.name === 'SecurityError'
            ? 'Allow microphone and camera access in your browser to continue.'
            : error.message || 'Could not start the call.',
        );
        setConnectionState('failed');
        if (callRef.current?.callId === acceptedCall.callId) {
          void emitChatEvent(socket, 'call:end', { callId: acceptedCall.callId }).catch(() => {});
        }
      }
    },
    [socket],
  );

  const handleOffer = useCallback(
    async ({ callId, description }) => {
      if (callRef.current?.callId !== callId) return;
      const peer = peerRef.current;
      if (!peer) {
        pendingOfferRef.current = description;
        return;
      }
      try {
        await peer.setRemoteDescription(description);
        for (const candidate of pendingCandidatesRef.current.splice(0)) {
          await peer.addIceCandidate(candidate);
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await emitChatEvent(socket, 'webrtc:answer', {
          callId,
          description: peer.localDescription.toJSON(),
        });
      } catch (error) {
        setCallError(error.message || 'Could not establish the call.');
      }
    },
    [socket],
  );

  const handleAnswer = useCallback(async ({ callId, description }) => {
    if (callRef.current?.callId !== callId || !peerRef.current) return;
    try {
      await peerRef.current.setRemoteDescription(description);
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peerRef.current.addIceCandidate(candidate);
      }
    } catch (error) {
      setCallError(error.message || 'Could not establish the call.');
    }
  }, []);

  const handleIce = useCallback(async ({ callId, candidate }) => {
    if (callRef.current?.callId !== callId) return;
    if (!peerRef.current?.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await peerRef.current.addIceCandidate(candidate);
    } catch (error) {
      setCallError(error.message || 'Could not connect to the other device.');
    }
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const handleInvite = (incoming) => {
      if (callRef.current) return;
      setCallError('');
      setCall({
        callId: incoming.callId,
        type: incoming.type,
        peer: incoming.caller,
        status: 'incoming',
        role: 'receiver',
      });
    };
    const handleRinging = (outgoing) => {
      setCall((current) =>
        current
          ? {
              ...current,
              callId: outgoing.callId,
              type: outgoing.type,
              peer: outgoing.recipient,
              status: 'ringing',
              role: 'caller',
            }
          : current,
      );
    };
    const handleAccept = (accepted) => {
      const isCaller = accepted.caller.id === user?.id;
      if (!callRef.current || callRef.current.callId !== accepted.callId) return;
      const peer = isCaller ? accepted.receiver : accepted.caller;
      const nextCall = {
        ...accepted,
        peer,
        status: 'connecting',
        role: isCaller ? 'caller' : 'receiver',
      };
      setCall(nextCall);
      setCallError('');
      void startPeer(nextCall, isCaller);
    };
    const handleReject = ({ callId }) => {
      if (callRef.current?.callId === callId) endLocally();
    };
    const handleEnd = ({ callId }) => {
      if (callRef.current?.callId === callId) endLocally();
    };
    const handleMissed = ({ callId }) => {
      if (callRef.current?.callId === callId) endLocally();
    };
    const handleStartRequest = async (event) => {
      const { recipientId, recipient, type } = event.detail || {};
      if (callRef.current) return;
      setCallError('');
      const startingCall = {
        callId: null,
        type,
        peer: recipient,
        status: 'starting',
        role: 'caller',
      };
      setCall(startingCall);
      try {
        const result = await emitChatEvent(socket, 'call:invite', { recipientId, type });
        setCall((current) =>
          current?.status === 'starting'
            ? { ...current, callId: result.callId, peer: result.recipient, status: 'ringing' }
            : current,
        );
      } catch (error) {
        setCall(null);
        setCallError(error.message);
      }
    };
    socket.on('call:invite', handleInvite);
    socket.on('call:ringing', handleRinging);
    socket.on('call:accept', handleAccept);
    socket.on('call:reject', handleReject);
    socket.on('call:end', handleEnd);
    socket.on('call:missed', handleMissed);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice', handleIce);
    window.addEventListener('nexora:call-invite', handleStartRequest);
    return () => {
      socket.off('call:invite', handleInvite);
      socket.off('call:ringing', handleRinging);
      socket.off('call:accept', handleAccept);
      socket.off('call:reject', handleReject);
      socket.off('call:end', handleEnd);
      socket.off('call:missed', handleMissed);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice', handleIce);
      window.removeEventListener('nexora:call-invite', handleStartRequest);
      clearMedia();
    };
  }, [socket, user?.id, startPeer, handleOffer, handleAnswer, handleIce, endLocally, clearMedia]);

  useEffect(() => {
    if (!call || call.status !== 'incoming') return undefined;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    const context = new AudioContextClass();
    let active = true;
    const playTone = () => {
      if (!active || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 480;
      gain.gain.value = 0.045;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    };
    void context
      .resume()
      .then(playTone)
      .catch(() => {});
    const interval = window.setInterval(playTone, 1300);
    return () => {
      active = false;
      window.clearInterval(interval);
      void context.close();
    };
  }, [call]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      if (remoteStream) {
        void remoteVideoRef.current.play().catch((error) => {
          if (error.name !== 'AbortError') {
            setCallError(
              error.name === 'NotAllowedError'
                ? 'Tap the call video to allow playback.'
                : error.message || 'Could not play the remote video.',
            );
          }
        });
      }
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      if (remoteStream) {
        void remoteAudioRef.current.play().catch((error) => {
          if (error.name !== 'AbortError') {
            setCallError(
              error.name === 'NotAllowedError'
                ? 'Allow audio playback in your browser to hear the call.'
                : error.message || 'Could not play remote call audio.',
            );
          }
        });
      }
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      if (localStream) {
        void localVideoRef.current.play().catch((error) => {
          if (error.name !== 'AbortError') {
            setCallError(error.message || 'Could not play the local camera preview.');
          }
        });
      }
    }
  }, [remoteStream, localStream]);

  useEffect(() => {
    if (connectionState !== 'connected') return undefined;
    const interval = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [connectionState]);

  const acceptCall = async () => {
    if (!call?.callId) return;
    setCallError('');
    try {
      await emitChatEvent(socket, 'call:accept', { callId: call.callId });
    } catch (error) {
      setCallError(error.message);
    }
  };

  const rejectCall = async () => {
    if (!call?.callId) return;
    try {
      await emitChatEvent(socket, 'call:reject', { callId: call.callId });
    } catch (error) {
      setCallError(error.message);
    }
  };

  const endCall = async () => {
    if (!call?.callId) {
      endLocally();
      return;
    }
    try {
      await emitChatEvent(socket, 'call:end', { callId: call.callId });
      endLocally();
    } catch (error) {
      setCallError(error.message);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraEnabled(next);
  };

  const switchCamera = async () => {
    const currentTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!currentTrack) return;
    try {
      const facingMode = currentTrack.getSettings().facingMode === 'user' ? 'environment' : 'user';
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
      const replacement = replacementStream.getVideoTracks()[0];
      const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(replacement);
      const stream = localStreamRef.current;
      stream.removeTrack(currentTrack);
      stream.addTrack(replacement);
      currentTrack.stop();
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (error) {
      setCallError(error.message || 'Could not switch camera.');
    }
  };

  const togglePictureInPicture = async () => {
    const video = remoteVideoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      setCallError(error.message || 'Picture-in-Picture is unavailable.');
    }
  };

  if (!call && !callError) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 text-white">
      {call ? (
        <div className="relative flex h-full w-full max-w-5xl flex-col items-center justify-center p-5 text-center sm:p-8">
          <audio ref={remoteAudioRef} autoPlay />
          {call.type === 'video' && (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                muted
                playsInline
                onClick={() => {
                  void remoteVideoRef.current?.play().catch((error) => {
                    setCallError(error.message || 'Could not play the remote video.');
                  });
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="absolute right-4 top-4 z-10 h-28 w-20 rounded-xl bg-slate-800 object-cover sm:right-8 sm:top-8 sm:h-40 sm:w-32"
              />
            </>
          )}
          {call.type === 'video' && connectionState === 'connected' && remoteStream ? (
            <div className="absolute left-4 top-4 z-10 rounded-xl bg-slate-950/65 px-3 py-2 text-left backdrop-blur-sm sm:left-8 sm:top-8">
              <h2 className="text-sm font-semibold">{call.peer?.name || 'Contact'}</h2>
              <p className="mt-0.5 text-xs text-slate-200">
                {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
              </p>
            </div>
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-3 rounded-3xl bg-slate-950/75 px-8 py-10 backdrop-blur-sm">
              <CallAvatar key={call.callId || call.peer?.id} peer={call.peer} />
              <h2 className="text-2xl font-semibold">{call.peer?.name || 'Contact'}</h2>
              <p className="text-sm text-slate-200">
                {call.status === 'incoming'
                  ? `Incoming ${call.type} call`
                  : connectionState === 'connected'
                    ? `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
                    : call.status === 'ringing' || call.status === 'starting'
                      ? 'Calling…'
                      : connectionState === 'reconnecting'
                        ? 'Reconnecting…'
                        : connectionState === 'failed'
                          ? 'Connection failed'
                          : 'Connecting…'}
              </p>
            </div>
          )}
          {callError && (
            <p
              role="alert"
              className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-lg bg-slate-950/80 px-4 py-2 text-sm text-red-300 backdrop-blur-sm"
            >
              {callError}
            </p>
          )}
          <div className="absolute bottom-8 z-20 flex items-center gap-4">
            {call.status === 'incoming' ? (
              <>
                <button
                  type="button"
                  onClick={() => void rejectCall()}
                  aria-label="Reject call"
                  className="grid h-14 w-14 place-items-center rounded-full bg-red-600 hover:bg-red-500"
                >
                  <PhoneOff />
                </button>
                <button
                  type="button"
                  onClick={() => void acceptCall()}
                  aria-label="Accept call"
                  className="grid h-14 w-14 place-items-center rounded-full bg-green-600 hover:bg-green-500"
                >
                  <Phone />
                </button>
              </>
            ) : (
              <>
                {call.type === 'video' && connectionState === 'connected' && (
                  <button
                    type="button"
                    onClick={() => void togglePictureInPicture()}
                    aria-label="Toggle picture-in-picture"
                    disabled={!document.pictureInPictureEnabled}
                    className="grid h-12 w-12 place-items-center rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                  >
                    <PictureInPicture />
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  className="grid h-12 w-12 place-items-center rounded-full bg-slate-700 hover:bg-slate-600"
                >
                  {muted ? <MicOff /> : <Mic />}
                </button>
                {call.type === 'video' && (
                  <>
                    <button
                      type="button"
                      onClick={toggleCamera}
                      aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                      className="grid h-12 w-12 place-items-center rounded-full bg-slate-700 hover:bg-slate-600"
                    >
                      {cameraEnabled ? <Camera /> : <CameraOff />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void switchCamera()}
                      aria-label="Switch camera"
                      className="grid h-12 w-12 place-items-center rounded-full bg-slate-700 hover:bg-slate-600"
                    >
                      <SwitchCamera />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void endCall()}
                  aria-label="End call"
                  className="grid h-14 w-14 place-items-center rounded-full bg-red-600 hover:bg-red-500"
                >
                  <PhoneOff />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          role="alert"
          className="mx-5 flex max-w-lg flex-col items-center gap-5 rounded-3xl bg-slate-900 p-8 text-center"
        >
          <Video size={36} className="text-red-300" />
          <p>{callError}</p>
          <button
            type="button"
            className="rounded-xl bg-slate-700 px-5 py-2"
            onClick={() => setCallError('')}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default CallManager;
