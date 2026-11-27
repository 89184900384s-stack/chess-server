const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const games = {};

io.on('connection', (socket) => {
  console.log('Подключился игрок:', socket.id);

  socket.on('createGame', (playerName) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new Chess();
    games[roomId] = { 
      chess: game, 
      players: { [socket.id]: { name: playerName, color: 'w' } } 
    };
    socket.join(roomId);
    socket.emit('gameCreated', { roomId, color: 'w', fen: game.fen() });
    console.log(`Игра создана: ${roomId}`);
  });

  socket.on('joinGame', ({ roomId, playerName }) => {
    const gameData = games[roomId];
    if (!gameData) return socket.emit('error', 'Комната не найдена');
    if (Object.keys(gameData.players).length >= 2) return socket.emit('error', 'Комната полна');

    gameData.players[socket.id] = { name: playerName, color: 'b' };
    socket.join(roomId);

    // Отправляем цвета
    socket.to(roomId).emit('gameStarted', { fen: gameData.chess.fen(), color: 'w' });
    socket.emit('gameStarted', { fen: gameData.chess.fen(), color: 'b' });
    console.log(`Игрок ${playerName} присоединился к ${roomId}`);
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const gameData = games[roomId];
    if (!gameData) return;
    const player = gameData.players[socket.id];
    
    // Проверка очереди хода
    if (!player || player.color !== gameData.chess.turn()) return;

    try {
      // Пытаемся сделать ход (chess.js сам проверит легальность)
      const result = gameData.chess.move(move);
      if (!result) throw new Error('Нелегальный ход');

      // Рассылаем новую позицию
      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });

      // Если игра окончена, отправляем уведомление (упрощённо, без рейтинга)
      if (gameData.chess.isGameOver()) {
        io.to(roomId).emit('gameOver', { result: 'Игра окончена' });
      }
    } catch (e) {
      socket.emit('error', 'Нелегальный ход');
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключился:', socket.id);
  });
});

// КРИТИЧЕСКИ ВАЖНО ДЛЯ ENZONIC:
// 1. Используем SERVER_PORT (платформа передает порт через неё)
// 2. Слушаем 0.0.0.0, чтобы платформа могла достучаться до приложения
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT} и слушает 0.0.0.0`);
});
