const { createHmac } = require('node:crypto');
const callService = require('../src/services/callService');

const turnEnvironmentKeys = [
  'CALL_STUN_URL',
  'CALL_TURN_URLS',
  'CALL_TURN_SHARED_SECRET',
  'CALL_TURN_USERNAME',
  'CALL_TURN_CREDENTIAL',
];

describe('call ICE server configuration', () => {
  let originalEnvironment;

  beforeEach(() => {
    originalEnvironment = Object.fromEntries(
      turnEnvironmentKeys.map((key) => [key, process.env[key]]),
    );
    turnEnvironmentKeys.forEach((key) => delete process.env[key]);
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    turnEnvironmentKeys.forEach((key) => {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    });
  });

  test('creates short-lived per-user Coturn credentials', () => {
    process.env.CALL_TURN_URLS =
      'turn:turn.example.com:3478?transport=udp, turn:turn.example.com:3478?transport=tcp';
    process.env.CALL_TURN_SHARED_SECRET = 'test-turn-shared-secret';
    const username = '1700003600:user-id';
    const credential = createHmac('sha1', process.env.CALL_TURN_SHARED_SECRET)
      .update(username)
      .digest('base64');

    expect(callService.getIceServers('user-id')).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [
          'turn:turn.example.com:3478?transport=udp',
          'turn:turn.example.com:3478?transport=tcp',
        ],
        username,
        credential,
      },
    ]);
  });

  test('supports providers with static credentials', () => {
    process.env.CALL_TURN_URLS = 'turn:turn.example.com:3478';
    process.env.CALL_TURN_USERNAME = 'provider-user';
    process.env.CALL_TURN_CREDENTIAL = 'provider-password';

    expect(callService.getIceServers('user-id')[1]).toMatchObject({
      username: 'provider-user',
      credential: 'provider-password',
    });
  });

  test('rejects TURN URLs without credentials', () => {
    process.env.CALL_TURN_URLS = 'turn:turn.example.com:3478';

    expect(() => callService.getIceServers('user-id')).toThrow(
      expect.objectContaining({ code: 'TURN_CONFIG_INVALID' }),
    );
  });
});
