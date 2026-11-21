@echo off
REM ============================================================
REM  Chat App - Backend dependency installer
REM  Put this file inside the server folder (next to package.json)
REM  and double-click it, or run it from a terminal.
REM ============================================================

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist package.json (
  echo [INFO] No package.json found, creating one...
  call npm init -y
)

echo.
echo [1/7] Core + Auth (Phase 0-1)
call npm install express mongoose dotenv cors cookie-parser helmet morgan compression jsonwebtoken bcryptjs zod express-rate-limit express-mongo-sanitize nodemailer socket.io
if errorlevel 1 ( echo [ERROR] Step 1 failed & pause & exit /b 1 )

echo.
echo [2/7] Chat, media, push (Phase 2)
call npm install multer cloudinary firebase-admin
if errorlevel 1 ( echo [ERROR] Step 2 failed & pause & exit /b 1 )

echo.
echo [3/7] Meetings + group call + reminders (Phase 5)
REM nanoid@3 on purpose: newer versions are ESM-only and break require()
call npm install livekit-server-sdk nanoid@3 bullmq ioredis
if errorlevel 1 ( echo [ERROR] Step 3 failed & pause & exit /b 1 )

echo.
echo [4/7] Advanced features: link preview, logging, error tracking (Phase 6)
call npm install open-graph-scraper pino pino-http @sentry/node
if errorlevel 1 ( echo [ERROR] Step 4 failed & pause & exit /b 1 )

echo.
echo [5/7] AI features (Phase 7)
call npm install @anthropic-ai/sdk openai
if errorlevel 1 ( echo [ERROR] Step 5 failed & pause & exit /b 1 )

echo.
echo [6/7] Dev dependencies
call npm install -D nodemon
if errorlevel 1 ( echo [ERROR] Step 6 failed & pause & exit /b 1 )

echo.
echo [7/7] Testing + code quality (dev)
call npm install -D jest supertest mongodb-memory-server socket.io-client eslint prettier
if errorlevel 1 ( echo [ERROR] Step 7 failed & pause & exit /b 1 )

echo.
echo ============================================================
echo  All backend packages installed successfully.
echo ============================================================
pause