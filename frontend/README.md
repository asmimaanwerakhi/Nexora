# CorpTalk frontend

The CorpTalk web client is a responsive React application built with Vite, React Router, Zustand and Tailwind CSS 4.

## Development

```powershell
npm install
npm run dev
```

Create `.env` from `.env.example` and set:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

These values are public browser configuration. Never put API secrets or private service credentials in `VITE_*` variables.

## Main areas

- **Dashboard:** workspace overview, recent conversations, friend requests and upcoming meetings
- **Chat:** direct/group conversations, typing indicators, presence, optimistic sends and unread filtering
- **Friends:** exact-username search, requests, accepted friendships and blocked users
- **Calls:** one-to-one WebRTC calls and call history
- **Meetings:** scheduling, invite links, access requests and LiveKit rooms
- **Stories:** image/video updates that expire after 24 hours
- **Starred:** a dedicated view of saved messages
- **Profile:** public profiles, cover/profile photos and account setup
- **Setup:** personal information and privacy preferences

## Chat behavior

The authenticated chat experience is available at `/chat` and `/chat/:conversationId`.

- Direct conversations are created after a friend request is accepted.
- Conversations can be filtered by direct/group type and unread state.
- History is loaded in pages of 30 messages.
- Text and media messages support replies, editing, forwarding, reactions and pinning.
- Messages can be starred for the dedicated `/starred` page.
- Media uploads use Cloudinary, with the limits configured by the backend.
- Pending sends are optimistic and can be retried after a failed request.
- Read receipts, typing state and pin updates arrive through Socket.IO.
- Group owners/admins can manage members, admins, group avatars and send permissions.

## Group meetings

Scheduled meetings are available at `/meetings`, while `/meet/:meetingLink` provides a host or guest meeting room. Hosts can invite users, edit or cancel meetings, approve join requests and remove participants. LiveKit credentials and room media remain server-side.

## Stories

The `/stories` page supports image and video uploads with optional captions. Story content expires after 24 hours and viewers are available for the author's own story entries.

## Push notifications

Offline notification support is optional and uses Firebase Cloud Messaging.

1. Set `VITE_FIREBASE_*` and `VITE_FCM_VAPID_KEY` in `frontend/.env`.
2. Set `FCM_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in the backend environment.
3. Serve the app over HTTPS in production; `localhost` is allowed for local development.
4. Sign in and use the notification control in the app header to grant browser permission.

## UI and theming

The brand palette is defined in `src/index.css` with Tailwind CSS 4 `@theme` tokens and CSS variables.

Shared utilities include `bg-brand-primary`, `text-heading`, `bg-surface` and `text-text-muted`. Light mode is the default. The UI follows the operating-system preference unless the app's theme state explicitly selects a palette.

## Validation

```sh
npm run lint
npm run format:check
npm run build
```
