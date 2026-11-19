# Nexora

Nexora is a full-stack team communication workspace. It combines direct and group chat, voice and video calls, scheduled LiveKit meetings, stories, friend management, profiles and a real-time activity dashboard in a responsive React interface.

## Highlights

- Email/password authentication with verification, password recovery and secure refresh-session cookies
- Personal dashboard with recent conversations, upcoming meetings and pending friend requests
- Direct and group conversations with unread filters, typing indicators and presence
- Text and media messages, replies, editing, forwarding, reactions, pins, starred messages and message search
- Retryable optimistic sends, read receipts, file previews and delete-for-me/delete-for-everyone controls
- Group creation, avatars, member and admin management, send permissions and notification preferences
- One-to-one WebRTC voice and video calls with call history and configurable STUN/TURN servers
- Scheduled LiveKit meetings with invite links, host controls, access requests and automatic/live status updates
- Temporary image and video stories with viewer information
- Public profile slugs, cover and profile photos, privacy settings and account setup
- Friend requests, blocking, public profiles and content reporting
- Browser push notifications through Firebase Cloud Messaging
- Responsive light/dark UI built around reusable Tailwind CSS 4 design tokens

## Application pages

| Route | Purpose |
| --- | --- |
| `/` | Animated public landing page |
| `/login`, `/signup` | Authentication |
| `/verify-email` | Email OTP verification |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/dashboard` | Workspace overview and quick actions |
| `/chat`, `/chat/:conversationId` | Direct and group messaging |
| `/friends` | Friends, requests and blocked users |
| `/calls` | Voice/video call history |
| `/meetings` | Schedule and manage meetings |
| `/meet/:meetingLink` | Join or request access to a meeting |
| `/stories` | Create and view 24-hour stories |
| `/starred` | Saved/starred messages |
| `/profile` | Own profile |
| `/setup` | Profile and privacy settings |
| `/:profileSlug` | Public profile |

## Architecture

| Component | Location | Technology |
| --- | --- | --- |
| Web client | `frontend/` | React 19, Vite 8, React Router 7, Zustand, Tailwind CSS 4 |
| API | `backend/` | Node.js, Express 5, Mongoose |
| Database | MongoDB | Users, conversations, messages, meetings, stories and reports |
| Realtime | Socket.IO | Presence, chat events, typing, calls, pins and meeting updates |
| Media storage | Cloudinary | Avatars, cover photos, chat media and stories |
| Peer calls | WebRTC | STUN/TURN connectivity |
| Group meetings | LiveKit | Scheduled video rooms |
| Push notifications | Firebase Cloud Messaging | Browser delivery when permission is granted |

The HTTP API is rooted at `/api/v1`; `GET /api/health` is the unauthenticated backend health check.

## Requirements

- Node.js and npm
- MongoDB Atlas or a local MongoDB instance
- A modern browser for WebRTC and notification features

Feature-specific integrations:

- SMTP for email verification and password recovery
- Cloudinary for profile and media uploads
- LiveKit for scheduled group meetings
- TURN for reliable peer-to-peer calls across restrictive networks
- Redis/BullMQ for durable meeting reminders and automatic meeting end
- Firebase Cloud Messaging for browser push notifications

## Local development

### 1. Create environment files

PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

macOS/Linux:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

At minimum, configure the backend database and authentication values:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_ACCESS_SECRET=<long-random-secret>
JWT_REFRESH_SECRET=<different-long-random-secret>
```

Example local application settings:

```env
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Frontend settings:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

`VITE_API_URL` is the backend origin only; the client adds `/api/v1`. Never place secrets in `VITE_*` variables. URL-encode special characters in MongoDB credentials and keep `.env` files outside version control.

### 2. Start the backend

```sh
cd backend
npm install
npm run dev
```

The backend listens on port `5000` by default and requires MongoDB to become ready.

### 3. Start the frontend

In another terminal:

```sh
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. Verify the API at `http://localhost:5000/api/health`.

## Production deployment

Deploy `frontend/` and `backend/` as separate services.

- Host the Vite frontend on Vercel or another static-site provider.
- Host the backend on a persistent Node.js service such as Render Web Service. Do not use a standard serverless function: Socket.IO and background jobs require a running process.

For a Render monorepo service using `backend` as the root directory:

- Build command: `npm ci`
- Start command: `npm start`
- Port: supplied by the platform through `PORT`

Set these frontend build variables to the deployed backend origin:

```env
VITE_API_URL=https://<backend-host>
VITE_SOCKET_URL=https://<backend-host>
```

Set these backend variables for production:

```env
NODE_ENV=production
APP_URL=https://<frontend-host>
CORS_ORIGINS=https://<frontend-host>
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```

Use a comma-separated list of exact frontend origins in `CORS_ORIGINS`, without trailing slashes. Leave `COOKIE_DOMAIN` empty for unrelated frontend/backend hostnames. For cross-site deployments, configure `COOKIE_SAME_SITE=none` together with secure cookies. Custom subdomains under one parent domain are preferable for cookie and CORS reliability.

The health endpoint should return HTTP `200`:

```text
https://<backend-host>/api/health
```

## Optional integrations

The complete backend key list is in [`backend/.env.example`](./backend/.env.example), and browser Firebase keys are in [`frontend/.env.example`](./frontend/.env.example).

- **Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- **Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Firebase push:** frontend `VITE_FIREBASE_*` and `VITE_FCM_VAPID_KEY`; backend `FCM_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS`
- **LiveKit:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- **TURN:** set `CALL_TURN_URLS` and either `CALL_TURN_SHARED_SECRET` or a static `CALL_TURN_USERNAME`/`CALL_TURN_CREDENTIAL` pair. Keep shared secrets server-only.
- **Redis:** set `REDIS_URL` for durable meeting reminders and automatic meeting end. Redis-backed jobs are disabled without it.

To run Coturn on a Linux host:

1. Copy [`infra/coturn/.env.example`](./infra/coturn/.env.example) to `infra/coturn/.env`.
2. Set `TURN_REALM` to the TURN hostname and `TURN_EXTERNAL_IP` to the public IPv4 address.
3. Replace `TURN_SHARED_SECRET` with a strong random value.
4. Open UDP/TCP `3478` and UDP `49160-49200` in the host firewall.
5. Start Coturn:

   ```sh
   docker compose --env-file infra/coturn/.env -f infra/coturn/compose.yml up -d
   ```

6. Configure the backend with matching TURN URLs and shared secret, then restart it.

Peer calls require HTTPS in deployed environments because browsers restrict camera and microphone access. Test across separate devices and networks because localhost does not validate NAT traversal.

## API overview

All application endpoints use `/api/v1`.

| Feature | Prefix |
| --- | --- |
| Authentication | `/auth` |
| Users and profiles | `/users` |
| Friends and blocks | `/friends` |
| Conversations and messages | `/conversations`, `/messages` |
| Calls | `/calls` |
| Scheduled meetings | `/meetings` |
| Stories | `/stories` |
| Reports | `/reports` |

Protected operations require authentication and enforce friendship, membership, blocking, privacy and meeting-access rules.

## Project structure

```text
backend/
  src/
    config/
    constants/
    controllers/
    jobs/
    middlewares/
    models/
    routes/
    services/
    sockets/
    utils/
    validators/
  tests/
frontend/
  src/
    app/
    assets/
    components/
    constants/
    context/
    features/
    hooks/
    layouts/
    pages/
    routes/
    services/
    stores/
    styles/
    utils/
    validators/
infra/
  coturn/
docs/
tests/
```

Production startup disables Mongoose automatic index creation. Review schema indexes and apply index changes as a migration or deployment operation.

## Validation

Run checks from the relevant package directory.

Backend:

```sh
npm test
npm run lint
npm run format:check
```

Frontend:

```sh
npm run lint
npm run format:check
npm run build
```

## Operational notes

- Run a single realtime backend instance until presence and active-call state use shared storage and Socket.IO is configured with an adapter.
- Store passwords, OTP codes and refresh tokens only as hashes; never log or commit credentials.
- MongoDB TTL cleanup is asynchronous. Queries must still check story and OTP expiration times in application logic.
- Configure MongoDB Atlas network access for the backend hosting provider.
- Camera/microphone calls and push notifications are browser-permission features and require appropriate HTTPS and service configuration.

For client-specific details, see [`frontend/README.md`](./frontend/README.md).
