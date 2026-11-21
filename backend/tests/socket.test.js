const http = require('node:http');
const { io: createClient } = require('socket.io-client');

jest.mock('../src/services/tokenService', () => ({
  authenticateAccessToken: jest.fn(async (token) => {
    const userId =
      token === 'second-user-token' ? '507f191e810c19729de860ea' : '507f1f77bcf86cd799439011';
    return {
      user: {
        _id: { toString: () => userId },
        privacy: { showOnlineStatus: true, lastSeenVisibility: 'everyone' },
      },
      claims: { exp: Math.floor(Date.now() / 1000) + 60 },
    };
  }),
}));
jest.mock('../src/models/user', () => ({
  updateOne: jest.fn(async () => ({ matchedCount: 1 })),
}));
jest.mock('../src/models/friendship', () => ({
  find: jest.fn(() => ({
    select: jest.fn(async () => [
      {
        requester: { toString: () => '507f1f77bcf86cd799439011' },
        recipient: { toString: () => '507f191e810c19729de860ea' },
      },
    ]),
  })),
}));

const createSocketServer = require('../src/sockets');

describe('Socket.IO foundation', () => {
  let httpServer;
  let ioServer;
  let clients;

  beforeEach(async () => {
    httpServer = http.createServer();
    ioServer = createSocketServer(httpServer);
    clients = [];

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients = [];

    if (ioServer) {
      await new Promise((resolve) => ioServer.close(resolve));
      ioServer = undefined;
    }
  });

  const createConnectedClient = async (token) => {
    const address = httpServer.address();
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      auth: token ? { token } : undefined,
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);

    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
      client.connect();
    });

    return client;
  };

  const waitForPresence = (client, predicate) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.off('presence:update', listener);
        reject(new Error('Presence event timed out'));
      }, 2000);
      const listener = (presence) => {
        if (predicate(presence)) {
          clearTimeout(timeout);
          client.off('presence:update', listener);
          resolve(presence);
        }
      };
      client.on('presence:update', listener);
    });

  test('connects a client and responds to a health ping', async () => {
    const client = await createConnectedClient('test-access-token');

    const response = await new Promise((resolve, reject) => {
      client.timeout(2000).emit('health:ping', { source: 'test' }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    });

    expect(response).toMatchObject({
      event: 'health:pong',
      ok: true,
    });
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });

  test('broadcasts online and offline presence between two authenticated users', async () => {
    const first = await createConnectedClient('first-user-token');
    const secondUserId = '507f191e810c19729de860ea';
    const onlineEvent = waitForPresence(first, (presence) => presence.userId === secondUserId);
    const second = await createConnectedClient('second-user-token');

    await expect(onlineEvent).resolves.toMatchObject({ userId: secondUserId, online: true });

    const offlineEvent = waitForPresence(
      first,
      (presence) => presence.userId === secondUserId && presence.online === false,
    );
    second.disconnect();
    await expect(offlineEvent).resolves.toMatchObject({ userId: secondUserId, online: false });
  });

  test('rejects clients without a handshake access token', async () => {
    const address = httpServer.address();
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);
    const error = await new Promise((resolve) => {
      client.once('connect_error', resolve);
      client.connect();
    });

    expect(error.message).toBe('Unauthorized');
  });
});
