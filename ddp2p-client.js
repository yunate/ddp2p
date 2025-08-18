
const TIMEOUT = 30000;

export default class DDP2PClient {
  constructor() {
    this._serverUrl = null;
    this._ws = null;
    this._isConnected = false;

    // event handlers
    this._onMessageCallback = null;
    this._onErrorCallback = null;
    this._onCloseCallback = null;
    this._onDisConnected = null;
  }

  async connect(serverUrl, connect_id, timeout = Infinity) {
    this._serverUrl = serverUrl;
    if (!serverUrl || !connect_id) {
      throw new Error('Server URL and connect ID are required');
    }

    const rejectHandler = (reject, message) => {
      console.log(`connection error:`, message);
      if (this._ws) {
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.close();
        }
        this._ws = null;
      }
      reject(new Error(message));
    }

    return new Promise((resolve, reject) => {
      try {
        if (timeout != Infinity) {
          setTimeout(() => {
            if (!this._isConnected) {
              rejectHandler(reject, `Connection timeout after ${timeout}ms`);
            }
          }, timeout);
        }

        this._ws = new WebSocket(this._serverUrl);
        this._ws.onopen = () => {
          console.log(`connected to server`);
          this._sendMessage('connect', { connectId: connect_id });
        };

        this._ws.onmessage = (event) => {
          const data = event.data;
          const message = JSON.parse(data);
          if (message.type === 'connect-successful') {
            this._isConnected = true;
            this._registerHandler();
            resolve(message);
          } else if (
            message.type === 'connect-error' ||
            message.type === 'connect-disrupted' ||
            message.type === 'connect-timeout') {
            rejectHandler(reject, data);
          }
        };

        this._ws.onclose = (event) => {
          rejectHandler(reject, `close (code: ${event.code}, reason: ${event.reason})`);
        };

        this._ws.onerror = (event) => {
          rejectHandler(reject, `error (message: ${event.message})`);
        };
      } catch (error) {
        rejectHandler(reject, `error (message: ${error.message})`);
      }
    });
  }

  sendMessage(data) {
    if (!this._isConnected) {
      console.log(`not connected to server.`);
      return false;
    }
    return this._sendMessage('transfer', { data });
  }

  close() {
    console.log('close.');

    if (this._ws) {
      if (this._ws.readyState === WebSocket.OPEN) {
        this._ws.close();
      }
      if (this._onCloseCallback) {
        this._onCloseCallback();
      }
    }
    this._ws = null;
    this._isConnected = false;
  }

  onMessage(callback) {
    this._onMessageCallback = callback;
  }

  onDisConnected(callback) {
    this._onDisConnected = callback;
  }

  onClose(callback) {
    this._onCloseCallback = callback;
  }

  onError(callback) {
    this._onErrorCallback = callback;
  }

  _sendMessage(type, data) {
    try {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        const message = { type, ...data };
        this._ws.send(JSON.stringify(message));
        return true;
      }
      console.log(`not connected to server.`);
      return false;
    } catch (error) {
      console.log(`error sending message:`, error);
      return false;
    }
  }

  _registerHandler() {
    this._ws.onmessage = (event) => { this._onMessage(event.data) };
    this._ws.onclose = (event) => { this._onClose(event.code, event.reason) };
    this._ws.onerror = (event) => { this._onError(event) };
  }

  _onMessage(data) {
    const message = JSON.parse(data);
    switch (message.type) {
      case 'connect-disrupted':
        this._onDisrupted(message);
        break;
      case 'transfer':
        console.log(`transfer`);
        if (this._onMessageCallback) {
          this._onMessageCallback(message.data);
        }
        break;
      case 'transfer-error':
        if (this._onErrorCallback) {
          this._onErrorCallback(message);
        }
        console.log(`transfer-error:`, message);
        break;
      case 'heartbeat-ping':
        this._onPing(message);
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  _onPing(message) {
    console.log(`_onPing:`, message);
    const pongMessage = {};
    for (const key in message) {
      if (key !== 'type') {
        pongMessage[key] = message[key];
      }
    }
    this._sendMessage('heartbeat-pong', { ...pongMessage });
  }

  _onDisrupted(message) {
    console.log(`_onDisrupted: ${message}`);
    if (this._onDisConnected) {
      this._onDisConnected(message);
    }
  }

  _onClose(code, reason) {
    console.log(`disconnected (code: ${code}, reason: ${reason})`);
    this.close();
  }

  _onError(error) {
    this.close();
  }
}

