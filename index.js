const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
  console.log('Кто-то подключился:', socket.id);
  socket.on('test', (msg) => {
    console.log('Пришло сообщение:', msg);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});
