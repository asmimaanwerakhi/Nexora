import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference, useParticipants } from '@livekit/components-react';
import { useRoomContext } from '@livekit/components-react';
import '@livekit/components-styles';
import { emitChatEvent } from '../services/chatSocket.js';
import {
  endMeeting,
  extendMeeting,
  muteMeetingParticipant,
  removeMeetingParticipant,
} from '../services/meetingApi.js';

function MeetingRoomPanel({ meeting, user, socket, credentials, onExit }) {
  const participants = useParticipants();
  const [waitingForHost, setWaitingForHost] = useState(credentials.waitingForHost);
  const [muted, setMuted] = useState({});
  const [raisedHands, setRaisedHands] = useState({});
  const [reactions, setReactions] = useState([]);
  const [panelError, setPanelError] = useState('');
  const [durationNotice, setDurationNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleJoined = (event) => {
      if (event.meetingId === meeting.id && event.user.id === meeting.host?.id) {
        setWaitingForHost(false);
      }
    };
    const handleStarted = (event) => {
      if (event.meetingId === meeting.id) setWaitingForHost(false);
    };
    const handleHand = (event) => {
      if (event.meetingId !== meeting.id) return;
      setRaisedHands((current) => ({ ...current, [event.userId]: event.name }));
    };
    const handleReaction = (event) => {
      if (event.meetingId !== meeting.id) return;
      const id = `${Date.now()}-${Math.random()}`;
      setReactions((current) => [...current, { ...event, id }]);
      setTimeout(
        () => setReactions((current) => current.filter((reaction) => reaction.id !== id)),
        3000,
      );
    };
    const handleClosed = (event) => {
      if (event.meetingId === meeting.id) onExit();
    };
    const handleDurationWarning = (event) => {
      if (event.meetingId === meeting.id) {
        setDurationNotice('The meeting ends in 5 minutes. The host can extend it.');
      }
    };
    socket.on('meeting:participant-joined', handleJoined);
    socket.on('meeting:started', handleStarted);
    socket.on('meeting:hand-raised', handleHand);
    socket.on('meeting:reaction', handleReaction);
    socket.on('meeting:ended', handleClosed);
    socket.on('meeting:cancelled', handleClosed);
    socket.on('meeting:participant-removed', handleClosed);
    socket.on('meeting:access-revoked', handleClosed);
    socket.on('meeting:duration-warning', handleDurationWarning);
    return () => {
      socket.off('meeting:participant-joined', handleJoined);
      socket.off('meeting:started', handleStarted);
      socket.off('meeting:hand-raised', handleHand);
      socket.off('meeting:reaction', handleReaction);
      socket.off('meeting:ended', handleClosed);
      socket.off('meeting:cancelled', handleClosed);
      socket.off('meeting:participant-removed', handleClosed);
      socket.off('meeting:access-revoked', handleClosed);
      socket.off('meeting:duration-warning', handleDurationWarning);
    };
  }, [meeting.id, meeting.host?.id, onExit, socket]);

  const room = useRoomContext();

  const raiseHand = async () => {
    try {
      await emitChatEvent(socket, 'meeting:raise-hand', { meetingId: meeting.id });
      setRaisedHands((current) => ({ ...current, [user.id]: user.name }));
    } catch (actionError) {
      setPanelError(actionError.message);
    }
  };

  const sendReaction = async (emoji) => {
    try {
      await emitChatEvent(socket, 'meeting:reaction', { meetingId: meeting.id, emoji });
    } catch (actionError) {
      setPanelError(actionError.message);
    }
  };

  const toggleMute = async (participant) => {
    const shouldMute = !muted[participant.identity];
    setBusy(true);
    setPanelError('');
    try {
      await muteMeetingParticipant(meeting.id, participant.identity, shouldMute);
      setMuted((current) => ({ ...current, [participant.identity]: shouldMute }));
    } catch (actionError) {
      setPanelError(actionError.response?.data?.error?.message || actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (participant) => {
    setBusy(true);
    setPanelError('');
    try {
      await removeMeetingParticipant(meeting.id, participant.identity);
    } catch (actionError) {
      setPanelError(actionError.response?.data?.error?.message || actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setPanelError('');
    try {
      await endMeeting(meeting.id);
      onExit();
    } catch (actionError) {
      setPanelError(actionError.response?.data?.error?.message || actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    setBusy(true);
    setPanelError('');
    try {
      await extendMeeting(meeting.id, 15);
    } catch (actionError) {
      setPanelError(actionError.response?.data?.error?.message || actionError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-[min(78vh,900px)] min-h-[560px] flex-col overflow-hidden rounded-2xl bg-[#111]">
      <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="rounded-xl bg-black/70 px-3 py-2 text-sm font-semibold text-white">
          {meeting.title} · {participants.length} participant{participants.length === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void raiseHand()}
            className="rounded-xl bg-black/70 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            ✋ Raise hand
          </button>
          {['👏', '❤️', '😂', '🎉', '👍'].map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => void sendReaction(emoji)}
              className="rounded-xl bg-black/70 px-2.5 py-2 text-white hover:bg-black"
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          {meeting.isHost && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void extend()}
                className="rounded-xl bg-black/70 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                +15 min
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="rounded-xl bg-error px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                End for everyone
              </button>
            </>
          )}
        </div>
      </div>
      {waitingForHost && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-white">
          Waiting for the host to start the meeting…
        </div>
      )}
      {durationNotice && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl bg-warning px-4 py-3 text-center text-sm font-medium text-charcoal-900">
          {durationNotice}
        </div>
      )}
      {panelError && (
        <p
          role="alert"
          className="absolute bottom-20 left-3 right-3 z-30 rounded-xl bg-error px-3 py-2 text-sm text-white"
        >
          {panelError}
        </p>
      )}
      <div className="absolute bottom-20 left-3 z-20 flex flex-wrap gap-1">
        {Object.entries(raisedHands).map(([userId, name]) => (
          <span key={userId} className="rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">
            ✋ {name}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute right-3 top-20 z-20 flex flex-col gap-1">
        {reactions.map((reaction) => (
          <span key={reaction.id} className="rounded-full bg-black/70 px-3 py-2 text-sm text-white">
            {reaction.emoji} {reaction.name}
          </span>
        ))}
      </div>
      <VideoConference className="min-h-0 flex-1" />
      {meeting.isHost && participants.length > 1 && (
        <details className="absolute bottom-20 right-3 z-20 max-h-56 w-64 overflow-y-auto rounded-xl bg-black/80 p-3 text-white">
          <summary className="cursor-pointer text-sm font-semibold">Host controls</summary>
          <div className="mt-2 space-y-2">
            {participants
              .filter((participant) => participant.identity !== user.id)
              .map((participant) => (
                <div
                  key={participant.identity}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">{participant.name || participant.identity}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleMute(participant)}
                      className="rounded-md bg-white/15 px-2 py-1"
                    >
                      {muted[participant.identity] ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(participant)}
                      className="rounded-md bg-error px-2 py-1"
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
          </div>
        </details>
      )}
      <button
        type="button"
        onClick={() => {
          room.disconnect();
          onExit();
        }}
        className="absolute bottom-3 right-3 z-30 rounded-xl border border-white/30 bg-black/70 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
      >
        Leave meeting
      </button>
    </div>
  );
}

function MeetingRoom({ meeting, user, socket, credentials, onExit, onError }) {
  const handleConnected = async () => {
    try {
      await emitChatEvent(socket, 'meeting:join', { meetingId: meeting.id });
      await emitChatEvent(socket, 'meeting:room-joined', { meetingId: meeting.id });
    } catch (error) {
      onError(error.message);
    }
  };

  return (
    <LiveKitRoom
      token={credentials.token}
      serverUrl={credentials.serverUrl}
      connect
      onConnected={() => void handleConnected()}
      onError={(error) => onError(error.message)}
      onDisconnected={() => {
        void emitChatEvent(socket, 'meeting:leave', { meetingId: meeting.id }).catch(() => {});
      }}
      options={{ adaptiveStream: true, dynacast: true }}
      data-lk-theme="default"
      className="mt-6 overflow-hidden rounded-2xl"
    >
      <MeetingRoomPanel
        meeting={meeting}
        user={user}
        socket={socket}
        credentials={credentials}
        onExit={onExit}
        onError={onError}
      />
    </LiveKitRoom>
  );
}

export default MeetingRoom;
