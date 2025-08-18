
import DDP2PServer from 'ddp2p/ddp2p-server.js';

const port = process.env.PORT || 8888;
const server = new DDP2PServer(port);
server.start();

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT signal');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM signal');
  server.close();
  process.exit(0);
});
