
import DDP2PClient from 'ddp2p/ddp2p-client.js';

const clients = {
    1: { client: null, connected: false, connectId: null, peerIp: null },
    2: { client: null, connected: false, connectId: null, peerIp: null }
};

// 日志记录
function log(message, type = 'info', clientId = null) {
    const logContainer = document.getElementById('logContainer');
    const timestamp = new Date().toLocaleTimeString();
    const clientPrefix = clientId ? `[客户端${clientId}] ` : '';
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${clientPrefix}${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 清空日志
function clearLog() {
    document.getElementById('logContainer').innerHTML = '';
}

// 更新客户端状态显示
function updateClientStatus(clientId) {
    const client = clients[clientId];
    const statusEl = document.getElementById(`status${clientId}`);
    const infoEl = document.getElementById(`clientInfo${clientId}`);
    const connectBtn = document.getElementById(`connectBtn${clientId}`);
    const disconnectBtn = document.getElementById(`disconnectBtn${clientId}`);
    const heartbeatBtn = document.getElementById(`heartbeatBtn${clientId}`);
    const sendBtn = document.getElementById(`sendBtn${clientId}`);
    const heartbeatStatus = document.getElementById(`heartbeatStatus${clientId}`);
    const sendTestBtn = document.getElementById('sendTestBtn');

    if (client.connected) {
        statusEl.textContent = '已连接';
        statusEl.className = 'status connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        heartbeatBtn.disabled = false;
        sendBtn.disabled = false;
        heartbeatStatus.textContent = '心跳状态: 已连接';
    } else {
        statusEl.textContent = client.client ? '连接中...' : '未连接';
        statusEl.className = client.client ? 'status connecting' : 'status disconnected';
        connectBtn.disabled = !!client.client;
        disconnectBtn.disabled = true;
        heartbeatBtn.disabled = true;
        sendBtn.disabled = true;
        heartbeatStatus.textContent = '心跳状态: 未连接';
    }

    // 更新客户端信息
    const status = client.connected ? '已连接' : (client.client ? '连接中' : '未连接');
    const connectId = client.connectId || '无';
    const peerIp = client.peerIp || '无';
    infoEl.textContent = `状态: ${status} | 连接ID: ${connectId} | 对端IP: ${peerIp}`;

    // 更新测试消息按钮状态
    sendTestBtn.disabled = !(clients[1].connected && clients[2].connected);
}

// 连接客户端
async function connectClient(clientId) {
    const serverUrl = document.getElementById(`serverUrl${clientId}`).value;
    const connectId = document.getElementById(`connectId${clientId}`).value;

    if (!serverUrl || !connectId) {
        alert('请填写服务器地址和连接ID');
        return;
    }

    const clientData = clients[clientId];
    
    try {
        log(`正在连接到服务器: ${serverUrl}`, 'info', clientId);

        // 创建 DDP2PClient 实例
        clientData.client = new DDP2PClient();
        clientData.connectId = connectId;
        updateClientStatus(clientId);

        // 设置事件处理器
        clientData.client.onMessage((data) => {
            log(`收到转发消息: ${JSON.stringify(data)}`, 'received', clientId);
        });

        clientData.client.onClose(() => {
            log('连接已关闭', 'info', clientId);
            clientData.connected = false;
            clientData.client = null;
            clientData.peerIp = null;
            updateClientStatus(clientId);
        });

        clientData.client.onDisConnected(() => {
            log('连接已中断', 'info', clientId);
            clientData.client.close();
            clientData.connected = false;
            clientData.client = null;
            clientData.peerIp = null;
            updateClientStatus(clientId);
        });

        clientData.client.onError((error) => {
            log(`连接错误: ${JSON.stringify(error)}`, 'error', clientId);
            clientData.connected = false;
            clientData.client = null;
            clientData.peerIp = null;
            updateClientStatus(clientId);
        });

        // 连接到服务器
        const response = await clientData.client.connect(serverUrl, connectId);
        
        // 连接成功
        clientData.connected = true;
        clientData.peerIp = response.peerIp;
        log(`连接成功! 对端IP: ${response.peerIp}`, 'info', clientId);
        updateClientStatus(clientId);
    } catch (error) {
        log(`连接失败: ${error.message}`, 'error', clientId);
        clientData.client = null;
        clientData.connected = false;
        clientData.peerIp = null;
        updateClientStatus(clientId);
    }
}

// 断开客户端连接
function disconnectClient(clientId) {
    const clientData = clients[clientId];
    
    if (clientData.client) {
        log('主动断开连接', 'info', clientId);
        clientData.client.close();
        clientData.client = null;
    }
    
    clientData.connected = false;
    clientData.connectId = null;
    clientData.peerIp = null;
    updateClientStatus(clientId);
}

// 发送消息
function sendMessage(clientId) {
    const clientData = clients[clientId];
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value;

    if (!clientData.connected || !clientData.client) {
        alert(`客户端${clientId}未连接`);
        return;
    }

    if (!message.trim()) {
        alert('请输入消息内容');
        return;
    }

    try {
        const data = {
            text: message,
            timestamp: new Date().toISOString(),
            from: `客户端${clientId}`
        };
        
        const success = clientData.client.sendMessage(data);
        if (success) {
            log(`发送消息: ${JSON.stringify(data)}`, 'sent', clientId);
        } else {
            log(`发送消息失败: 客户端未连接`, 'error', clientId);
        }
    } catch (error) {
        log(`发送消息失败: ${error.message}`, 'error', clientId);
    }
}

// 发送心跳 (注意：原始的客户端类已经自动处理心跳，这里作为手动测试)
function sendHeartbeat(clientId) {
    const clientData = clients[clientId];

    if (!clientData.connected || !clientData.client) {
        alert(`客户端${clientId}未连接`);
        return;
    }

    try {
        // 使用内部方法发送心跳测试
        const success = clientData.client._sendMessage('heartbeat-ping', { 
            timeoutId: Date.now()
        });
        
        if (success) {
            log(`发送心跳ping`, 'sent', clientId);
            document.getElementById(`heartbeatStatus${clientId}`).textContent = 
                `心跳状态: 已发送 (${new Date().toLocaleTimeString()})`;
        } else {
            log(`发送心跳失败: 客户端未连接`, 'error', clientId);
        }
    } catch (error) {
        log(`发送心跳失败: ${error.message}`, 'error', clientId);
    }
}

// 发送测试消息
function sendTestMessages() {
    if (!clients[1].connected || !clients[2].connected) {
        alert('请确保两个客户端都已连接');
        return;
    }

    const testMessages = [
        '这是一条测试消息',
        '测试中文字符: 你好世界！',
        'Test English message',
        'JSON格式测试: {"test": true, "number": 123}',
        '特殊字符测试: !@#$%^&*()_+-=[]{}|;:,.<>?'
    ];

    for (let i = 0; i < 1000; i++) {
        const senderId = (i % 2) + 1; // 交替发送
        const clientData = clients[senderId];
        const message = testMessages[i % testMessages.length];

        if (clientData.connected && clientData.client) {
            const data = {
                text: `[测试${i + 1}] ${message}`,
                timestamp: new Date().toISOString(),
                from: `客户端${senderId}`,
                testIndex: i + 1
            };
            
            const success = clientData.client.sendMessage(data);
            if (success) {
                log(`发送测试消息${i + 1}: ${JSON.stringify(data)}`, 'sent', senderId);
            }
        }
    }
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', () => {
    log('DD P2P 测试客户端已加载 (使用 DDP2PClient)', 'info');
    log('使用说明:', 'info');
    log('1. 设置两个客户端使用相同的连接ID', 'info');
    log('2. 先连接客户端1，再连接客户端2', 'info');
    log('3. 连接成功后可以相互发送消息', 'info');
    log('4. 可以使用测试消息功能进行批量测试', 'info');
    log('5. 现在使用 DDP2PClient 类进行连接管理', 'info');
    
    // 初始化状态
    updateClientStatus(1);
    updateClientStatus(2);
    
    // 回车键发送消息
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            // 如果两个客户端都连接了，默认用客户端1发送
            if (clients[1].connected) {
                sendMessage(1);
            } else if (clients[2].connected) {
                sendMessage(2);
            }
        }
    });
});

// 页面卸载时清理连接
window.addEventListener('beforeunload', () => {
    disconnectClient(1);
    disconnectClient(2);
});

window.connectClient = connectClient;
window.disconnectClient = disconnectClient;
window.sendMessage = sendMessage;
window.sendHeartbeat = sendHeartbeat;
window.sendTestMessages = sendTestMessages;
window.clearLog = clearLog;