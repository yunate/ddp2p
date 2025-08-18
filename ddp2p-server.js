import { WebSocketServer } from 'ws';

const TIMEOUT = 30000;

// 1. client 和 server 建立连接后, server 会等待 client 发送 connect-id,
//    如果在TIMEOUT内没有收到, 则发送`connect-timeout`给client并关闭连接
// 2. client 发送 `connect` 消息给server, server 会做一系列的检查,
//    如果失败则发送 `connect-error` 给client, 如果成功则等待另外一个peer连接
// 3. 当两个peer都连接成功后, server 会发送 `connect-successful` 消息给两个peer
// 4. 两个peer连接成功后, 如果其中一个peer异常断开连接,
//    server 会发送 `connect-disrupted` 消息给另一个peer
// 5. client 可以发送 `transfer` 消息给server, server会转发给另一个peer, 如果另一个peer不在线则发送 `transfer-error`
// 6. client 可以发送 `heartbeat-ping` 消息给server, server会回复 `heartbeat-pong`, 并将原始消息返回给 client
// 7. server 会定时发送 `heartbeat-ping`, client 应该在收到 `heartbeat-ping`后回复`heartbeat-pong`
//    如果在TIMEOUT时间内没有收到 `heartbeat-pong` 则关闭连接

// 消息类型定义:
// - `connect`:
//   C->S: { 'type': 'connect', 'connectId': string }
// - `connect-successful`:
//   S->C: { 'type': 'connect-successful', 'connectId': string, 'peerIp': string }
// - `connect-error`:
//   S->C: { 'type': 'connect-error', 'message': string }
// - `connect-disrupted`:
//   S->C: { 'type': 'connect-disrupted', 'connectId': string }
// - `connect-timeout`:
//   S->C: { 'type': 'connect-timeout', 'message': string }
//
// - `transfer`:
//   C->S->C: { 'type': 'transfer', 'data': any }
//
// - `transfer-error`:
//   S->C: { 'type': 'transfer-error', 'message': string }
//
// - `heartbeat-ping`:
//   C->S/S->C: { 'type': 'heartbeat-ping' }
// - `heartbeat-pong`:
//   S->C/C->S: { 'type': 'heartbeat-pong' }
export default class DDP2PServer {
  constructor(port = 8080) {
    this._port = port;

    this._heartbeatTimer = new Set();

    // key: connectId; value: { id: connectId, peer1: ws1, peer2: ws2 }
    this._connections = new Map();

    // key: ws; value: { connectId: connectId }
    this.peerInfos = new Map();

    this._wss = null;
  }

  start() {
    this._init();
  }

  close() {
    if (this._wss) {
      this._wss.close(() => {
        console.log('Server closed successfully');
      });
    }
  }

  _init() {
    try {
      this._wss = new WebSocketServer({
        port: this._port,
        perMessageDeflate: false
      });
      this._wss.on('connection', (ws, request) => this._onWSConnection(ws, request));
      this._heartbeat();
      console.log(`DDP2P server started on port ${this._port}`);
    } catch (error) {
      console.error(`Error initializing DDP2P server: ${error}`);
      throw new Error(`Failed to start DDP2P server: ${error.message}`);
    }
  }

  _addToConnections(ws, connectId) {
    if (this.peerInfos.has(ws)) {
      throw new Error(`WebSocket already connected: ${ws._socket.remoteAddress}`);
    }

    if (!this._connections.has(connectId)) {
      this._connections.set(connectId, {
        connectId: connectId,
        peer1: null,
        peer2: null,
      });
    }

    const connection = this._connections.get(connectId);
    if (!connection.peer1) {
      connection.peer1 = ws;
    } else if (!connection.peer2) {
      connection.peer2 = ws;
    } else {
      throw new Error(`Too many connections for connectId: ${connectId}`);
    }
    this.peerInfos.set(ws, { connectId: connectId });
  }

  _removeFromConnections(ws) {
    const connectId = this.peerInfos.get(ws)?.connectId;
    if (!connectId) return;
    this.peerInfos.delete(ws);

    const connection = this._connections.get(connectId);
    if (!connection) return;

    if (connection.peer1 === ws) {
      connection.peer1 = null;
    } else if (connection.peer2 === ws) {
      connection.peer2 = null;
    }

    if (!connection.peer1 && !connection.peer2) {
      this._connections.delete(connectId);
    }
  }

  _getConnection(ws) {
    const connectId = this.peerInfos.get(ws)?.connectId;
    if (!connectId) return null;
    return this._connections.get(connectId);
  }

  _onWSConnection(ws, request) {
    console.log(`New client connected from ${request.socket.remoteAddress}`);
    ws.on('message', (data) => this._onMessage(ws, data));
    ws.on('close', (code, reason) => this._onClose(ws, code, reason));
    ws.on('error', (error) => this._onError(ws, error));

    // Set a timeout to close the connection if not joined within TIMEOUT
    setTimeout(() => {
      if (!this._getConnection(ws)) {
        try {
          const message = `Connection timeout for ${request.socket.remoteAddress}`;
          console.log(message);
          this._sendMessage(ws, 'connect-timeout', { message });
          ws.close();
        } catch (error) {
          console.error(`Error handling connection timeout: ${error}`);
        }
      }
    }, TIMEOUT);
  }

  _onMessage(ws, message) {
    try {
      const data = JSON.parse(message.toString());
      switch (data.type) {
        case 'connect':
          this._onConnect(ws, data.connectId);
          break;
        case 'transfer':
          this._onTransfer(ws, data);
          break;
        case 'heartbeat-ping':
          this._onHeartbeatPing(ws, data);
          break;
        case 'heartbeat-pong':
          this._onHeartbeatPong(ws, data);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  _onConnect(ws, connectId) {
    try {
      this._addToConnections(ws, connectId);
      const connection = this._getConnection(ws);
      if (connection && connection.peer1 && connection.peer2) {
        this._sendMessage(connection.peer1, 'connect-successful', { connectId: connectId, peerIp: connection.peer2._socket.remoteAddress });
        this._sendMessage(connection.peer2, 'connect-successful', { connectId: connectId, peerIp: connection.peer1._socket.remoteAddress });
        console.log(`Connected ${connectId} with peers: ${connection.peer1._socket.remoteAddress}, ${connection.peer2._socket.remoteAddress}`);
      }
    } catch (error) {
      console.error(`_onConnect ${error}`);
      this._sendMessage(ws, 'connect-error', { message: error.message });
      ws.close();
      return;
    }
  }

  _onTransfer(ws, data) {
    try {
      const connection = this._getConnection(ws);
      if (!connection || !connection.peer1 || !connection.peer2) {
        throw new Error(`No connected peers found for connectId: ${data.connectId}`);
      }
      const targetPeer = connection.peer1 === ws ? connection.peer2 : connection.peer1;
      this._sendMessage(targetPeer, data.type, { data: data.data });
    } catch (error) {
      console.error(`_onTransfer: ${error}:`);
      this._sendMessage(ws, 'transfer-error', { message: error.message });
    }
  }

  _onClose(ws, code, reason) {
    console.log(`Client disconnected from ${ws._socket.remoteAddress}: code: ${code}, reason: ${reason}`);
    this._onDisrupted(ws);
  }

  _onError(ws, error) {
    console.error(`WebSocket error from ${ws._socket.remoteAddress}:`, error);
    this._onDisrupted(ws);
  }

  _onDisrupted(ws) {
    const connection = this._getConnection(ws);
    if (connection) {
      const targetPeer = connection.peer1 === ws ? connection.peer2 : connection.peer1;
      if (targetPeer) {
        this._sendMessage(targetPeer, 'connect-disrupted', { connectId: connection.connectId });
      }
    }
    this._removeFromConnections(ws);
  }

  _onHeartbeatPing(ws, message) {
    const timeoutId = message.timeoutId;
    const pongMessage = {};
    for (const key in message) {
      if (key !== 'type') {
        pongMessage[key] = message[key];
      }
    }
    this._sendMessage(ws, 'heartbeat-pong', { ...pongMessage });
  }

  _onHeartbeatPong(ws, message) {
    this._heartbeatTimer.delete(ws);
  }

  _heartbeat() {
    setInterval(() => {
      this._wss.clients.forEach((ws) => {
        this._heartbeatTimer.add(ws);
        globalThis.setTimeout(() => {
          if (!this._heartbeatTimer.has(ws)) return;

          console.warn(`Heartbeat timeout for ${ws._socket.remoteAddress}`);
          this._heartbeatTimer.delete(ws);
          ws.close();
          this._onDisrupted(ws);
        }, TIMEOUT);
        this._sendMessage(ws, 'heartbeat-ping', { });
      });
    }, TIMEOUT);
  }

  _sendMessage(ws, type, message) {
    try{
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...message }));
      } else {
        console.error(`WebSocket not connected: ${ws._socket.remoteAddress}`);
      }
    } catch (error) {
      console.error(`Error sending message to ${ws._socket.remoteAddress}:`, error);
    }
  }
}
