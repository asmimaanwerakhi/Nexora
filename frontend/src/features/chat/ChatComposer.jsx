import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { Camera, ImagePlus, Mic, Paperclip, Send, Smile, Square, X } from 'lucide-react';

function ChatComposer({
  disabled,
  onSendFile,
  onSendText,
  onTypingStart,
  onTypingStop,
  replyTo,
  onCancelReply,
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);

  const stopTyping = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (typingActiveRef.current) onTypingStop?.();
    typingActiveRef.current = false;
  };

  const changeText = (value) => {
    setText(value);
    if (!value.trim() || disabled) {
      stopTyping();
      return;
    }
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingStart?.();
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(stopTyping, 2000);
  };

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingActiveRef.current) onTypingStop?.();
    },
    [onTypingStop],
  );

  const submit = (event) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || disabled) return;
    stopTyping();
    onSendText(message);
    setText('');
    onCancelReply();
  };

  const selectFile = (event) => {
    const [file] = event.target.files || [];
    if (file) {
      onSendFile(file, '');
      stopTyping();
      onCancelReply();
    }
    event.target.value = '';
  };

  const startRecording = async () => {
    setRecordingError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (chunks.length) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          onSendFile(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), '');
          onCancelReply();
        }
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      setRecordingError(error.message || 'Microphone access was not granted.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="relative border-t border-border bg-bg px-3 py-3 sm:px-5">
      {replyTo && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-heading">
              Replying to {replyTo.senderName || 'message'}
            </p>
            <p className="truncate text-text-muted">{replyTo.text || 'Attachment'}</p>
          </div>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply}>
            <X size={18} />
          </button>
        </div>
      )}
      {emojiOpen && (
        <div className="absolute bottom-20 left-4 z-20 shadow-xl">
          <EmojiPicker
            onEmojiClick={(emoji) => setText((current) => `${current}${emoji.emoji}`)}
            lazyLoadEmojis
          />
        </div>
      )}
      <form className="flex items-end gap-2" onSubmit={submit}>
        <button
          type="button"
          className="rounded-xl p-2.5 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
          aria-label="Add emoji"
          onClick={() => setEmojiOpen((open) => !open)}
          disabled={disabled}
        >
          <Smile size={20} />
        </button>
        <button
          type="button"
          className="rounded-xl p-2.5 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
          aria-label="Attach a file"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,application/pdf"
          className="hidden"
          onChange={selectFile}
        />
        <button
          type="button"
          className="rounded-xl p-2.5 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
          aria-label="Attach a photo"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled}
        >
          <Camera size={19} />
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={selectFile}
        />
        <textarea
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onBlur={stopTyping}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
          placeholder="Write a message…"
          aria-label="Message"
          rows={1}
          maxLength={10000}
          disabled={disabled || recording}
          className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-border bg-bg-subtle px-4 py-3 text-sm text-text outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
        />
        {recording ? (
          <button
            type="button"
            className="rounded-full bg-error p-3 text-white"
            aria-label="Stop voice recording"
            onClick={stopRecording}
          >
            <Square size={18} />
          </button>
        ) : text.trim() ? (
          <button
            type="submit"
            className="rounded-xl bg-brand-primary p-3 text-on-primary transition hover:bg-brand-primary-hover disabled:opacity-50"
            aria-label="Send message"
            disabled={disabled}
          >
            <Send size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="rounded-xl p-3 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text disabled:opacity-50"
            aria-label="Record a voice message"
            onClick={startRecording}
            disabled={disabled}
          >
            <Mic size={20} />
          </button>
        )}
      </form>
      {recordingError && <p className="mt-2 text-xs text-error">{recordingError}</p>}
      {recording && (
        <p className="mt-2 flex items-center gap-2 text-xs text-error">
          <ImagePlus size={14} /> Recording… select stop to send
        </p>
      )}
    </div>
  );
}

export default ChatComposer;
