process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-nexora-authentication';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-nexora-authentication';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
jest.setTimeout(30000);

jest.mock('../src/services/emailService', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('cloudinary', () => {
  const { Writable } = require('node:stream');
  return {
    v2: {
      config: jest.fn(),
      uploader: {
        upload_stream: jest.fn((_options, callback) => {
          const stream = new Writable({
            write(_chunk, _encoding, done) {
              done();
            },
          });
          stream.on('finish', () => {
            callback(null, {
              secure_url: 'https://images.example.test/Nexora/cover.webp',
              public_id: 'Nexora/covers/test-cover',
            });
          });
          return stream;
        }),
        destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
      },
    },
  };
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const createApp = require('../src/app');
const cloudinary = require('cloudinary').v2;

const MONGODB_MEMORY_SERVER_VERSION = '7.0.14';
const User = require('../src/models/user');
const Otp = require('../src/models/otp');
const RefreshSession = require('../src/models/refreshSession');
const { sendOtpEmail } = require('../src/services/emailService');

const app = createApp();
let mongo;

const latestCode = () => sendOtpEmail.mock.calls[sendOtpEmail.mock.calls.length - 1][0].code;
const sessionCookie = (response) =>
  response.headers['set-cookie'].find((cookie) => cookie.startsWith('refreshToken=')).split(';')[0];

const registerAndVerify = async (email) => {
  const signup = await request(app).post('/api/v1/auth/signup').send({
    name: 'Test User',
    email,
    password: 'strong-test-password',
  });
  expect(signup.status).toBe(201);
  const code = latestCode();
  const verification = await request(app).post('/api/v1/auth/verify-otp').send({ email, code });
  expect(verification.status).toBe(200);
};

beforeAll(async () => {
  console.info('auth-test: starting MongoMemoryServer');
  mongo = await MongoMemoryServer.create({
    binary: { version: MONGODB_MEMORY_SERVER_VERSION },
  });
  console.info('auth-test: MongoMemoryServer started');
  mongoose.connection.on('error', (error) =>
    console.error('auth-test: mongo connection error', error),
  );
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 5000 });
  console.info('auth-test: Mongoose connected');
  await Promise.all([User.init(), Otp.init(), RefreshSession.init()]);
  console.info('auth-test: model indexes initialized');
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Otp.deleteMany({}), RefreshSession.deleteMany({})]);
  sendOtpEmail.mockClear();
  cloudinary.uploader.upload_stream.mockClear();
  cloudinary.uploader.destroy.mockClear();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('authentication API', () => {
  test('verifies email, signs in, returns profile and rotates refresh sessions', async () => {
    const email = 'first.user@example.com';
    await registerAndVerify(email);

    const login = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    expect(login.status).toBe(200);
    expect(login.body.data).toHaveProperty('accessToken');
    expect(login.body.data).not.toHaveProperty('refreshToken');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const oldCookie = sessionCookie(login);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user).toMatchObject({ email, name: 'Test User', isVerified: true });

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(refreshed.status).toBe(200);
    const newCookie = sessionCookie(refreshed);
    expect(newCookie).not.toBe(oldCookie);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    const revokedFamily = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie);
    expect(revokedFamily.status).toBe(401);
  });

  test('saves profile bio and uploads a persistent cover photo', async () => {
    const email = 'cover.photo@example.com';
    await registerAndVerify(email);
    const login = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    const authorization = `Bearer ${login.body.data.accessToken}`;

    const bioUpdate = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', authorization)
      .send({
        bio: 'Working together, one conversation at a time.',
        about: 'I enjoy building thoughtful tools and helping teams work better.',
      });
    expect(bioUpdate.status).toBe(200);
    expect(bioUpdate.body.data.user.bio).toBe('Working together, one conversation at a time.');
    expect(bioUpdate.body.data.user.about).toBe(
      'I enjoy building thoughtful tools and helping teams work better.',
    );

    const previousCloudinaryConfig = {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    };
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';

    let uploadedCover;
    try {
      uploadedCover = await request(app)
        .post('/api/v1/users/me/cover-photo')
        .set('Authorization', authorization)
        .attach('coverPhoto', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
          filename: 'cover.png',
          contentType: 'image/png',
        });
    } finally {
      if (previousCloudinaryConfig.cloudName === undefined) {
        delete process.env.CLOUDINARY_CLOUD_NAME;
      } else {
        process.env.CLOUDINARY_CLOUD_NAME = previousCloudinaryConfig.cloudName;
      }
      if (previousCloudinaryConfig.apiKey === undefined) {
        delete process.env.CLOUDINARY_API_KEY;
      } else {
        process.env.CLOUDINARY_API_KEY = previousCloudinaryConfig.apiKey;
      }
      if (previousCloudinaryConfig.apiSecret === undefined) {
        delete process.env.CLOUDINARY_API_SECRET;
      } else {
        process.env.CLOUDINARY_API_SECRET = previousCloudinaryConfig.apiSecret;
      }
    }

    expect(uploadedCover.status).toBe(200);
    expect(uploadedCover.body.data.user).toMatchObject({
      bio: 'Working together, one conversation at a time.',
      about: 'I enjoy building thoughtful tools and helping teams work better.',
      coverPhoto: 'https://images.example.test/Nexora/cover.webp',
    });
    expect(uploadedCover.body.data.user).not.toHaveProperty('coverPhotoPublicId');
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'Nexora/covers',
        resource_type: 'image',
      }),
      expect.any(Function),
    );

    const storedUser = await User.findOne({ email }).select('+coverPhotoPublicId');
    expect(storedUser.coverPhotoPublicId).toBe('Nexora/covers/test-cover');

    const invalidCover = await request(app)
      .post('/api/v1/users/me/cover-photo')
      .set('Authorization', authorization)
      .attach('coverPhoto', Buffer.from('not an image'), {
        filename: 'cover.png',
        contentType: 'image/png',
      });
    expect(invalidCover.status).toBe(400);
    expect(invalidCover.body.error.code).toBe('INVALID_IMAGE');
  });

  test('preserves existing long bios as about text when the user adds a short bio', async () => {
    const email = 'legacy.bio@example.com';
    await registerAndVerify(email);
    const longBio =
      'I am a passionate developer who loves creating useful software for people and teams. ' +
      'Outside work, I enjoy learning new technologies, solving challenging problems, and sharing what I learn.';
    await User.updateOne({ email }, { $set: { bio: longBio } });

    const login = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    expect(login.body.data.user.bio).toBe('');
    expect(login.body.data.user.about).toBe(longBio);

    const updatedProfile = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ bio: 'Building useful software for teams.' });

    expect(updatedProfile.status).toBe(200);
    expect(updatedProfile.body.data.user).toMatchObject({
      bio: 'Building useful software for teams.',
      about: longBio,
    });
  });

  test('locks an OTP after three incorrect attempts', async () => {
    const email = 'locked.user@example.com';
    await request(app).post('/api/v1/auth/signup').send({
      name: 'Locked User',
      email,
      password: 'strong-test-password',
    });
    const code = latestCode();
    const wrongCode = code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, code: wrongCode });
      expect(response.status).toBe(400);
    }

    const lockedAttempt = await request(app).post('/api/v1/auth/verify-otp').send({ email, code });
    expect(lockedAttempt.status).toBe(400);
    const otp = await Otp.findOne({ purpose: 'email_verification' });
    expect(otp.attempts).toBe(3);
  });

  test('resets the password and invalidates the previous credentials', async () => {
    const email = 'reset.user@example.com';
    await registerAndVerify(email);
    const resetRequest = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(resetRequest.status).toBe(202);

    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      email,
      code: latestCode(),
      password: 'new-strong-password',
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'new-strong-password',
    });
    expect(newLogin.status).toBe(200);
  });
});
