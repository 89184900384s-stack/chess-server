const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const games = {};

io.on('connection', (socket) => {
  console.log('Подключился:', socket.id);

  socket.on('createGame', (playerName) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new Chess();
    games[roomId] = { chess: game, players: { [socket.id]: { color: 'w' } } };
    socket.join(roomId);
    socket.emit('gameCreated', { roomId, color: 'w', fen: game.fen() });
  });

  socket.on('joinGame', ({ roomId }) => {
    const gameData = games[roomId];
    if (!gameData) return socket.emit('error', 'Комната не найдена');
    gameData.players[socket.id] = { color: 'b' };
    socket.join(roomId);
    socket.to(roomId).emit('gameStarted', { fen: gameData.chess.fen(), color: 'w' });
    socket.emit('gameStarted', { fen: gameData.chess.fen(), color: 'b' });
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const gameData = games[roomId];
    if (!gameData) return;
    const player = gameData.players[socket.id];
    if (!player || player.color !== gameData.chess.turn()) return;

    try {
      // Просто передаем ход. Если он нелегальный, chess.js кинет ошибку
      gameData.chess.move(move);
      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });
    } catch (e) {
      socket.emit('error', 'Нелегальный ход');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));
