const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } 
});

const games = {};

io.on('connection', (socket) => {
  console.log('Подключился игрок:', socket.id);

  socket.on('createGame', (playerName) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new Chess();
    
    games[roomId] = {
      chess: game,
      players: {
        [socket.id]: { name: playerName, color: 'w' }
      },
      status: 'waiting'
    };
    
    socket.join(roomId);
    socket.emit('gameCreated', { roomId, color: 'w', fen: game.fen() });
  });

  socket.on('joinGame', ({ roomId, playerName }) => {
    const gameData = games[roomId];
    if (!gameData) return socket.emit('error', 'Комната не найдена');
    if (Object.keys(gameData.players).length >= 2) return socket.emit('error', 'Комната полна');
    
    gameData.players[socket.id] = { name: playerName, color: 'b' };
    gameData.status = 'playing';
    
    socket.join(roomId);
    
    // Отдаем цвета
    socket.to(roomId).emit('gameStarted', { fen: gameData.chess.fen(), color: 'w' });
    socket.emit('gameStarted', { fen: gameData.chess.fen(), color: 'b' });
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const gameData = games[roomId];
    if (!gameData) return;
    
    const player = gameData.players[socket.id];
    if (!player || player.color !== gameData.chess.turn()) return;

    try {
      // Пытаемся сделать ход
      const result = gameData.chess.move(move);
      
      // Если ход не удался (result === null), chess.js выдаст ошибку, и мы ее поймаем
      if (!result) throw new Error('Нелегальный ход');

      // Рассылаем новую позицию
      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });

      // Проверка на конец игры (если нужно)
      if (gameData.chess.isGameOver()) {
         // Просто отправляем, что игра окончена, без рейтинга, чтобы не усложнять
         io.to(roomId).emit('gameOver', { result: 'Игра окончена', ratings: { white: 1200, black: 1200 } });
      }
    } catch (e) {
      // Если ход нелегальный, chess.js кидает исключение, мы его ловим и отправляем ошибку клиенту
      socket.emit('error', 'Нелегальный ход');
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
