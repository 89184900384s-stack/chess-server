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
        [socket.id]: { name: playerName, color: 'w', rating: 1200 }
      },
      status: 'waiting'
    };
    
    socket.join(roomId);
    socket.emit('gameCreated', { roomId, color: 'w', fen: game.fen() });
    console.log(`Игра создана: ${roomId}`);
  });

  socket.on('joinGame', ({ roomId, playerName }) => {
    const gameData = games[roomId];
    
    if (!gameData) return socket.emit('error', 'Комната не найдена');
    if (Object.keys(gameData.players).length >= 2) return socket.emit('error', 'Комната полна');
    
    gameData.players[socket.id] = { name: playerName, color: 'b', rating: 1200 };
    gameData.status = 'playing';
    
    socket.join(roomId);
    
    // Отправляем ПЕРВОМУ игроку (белые)
    socket.to(roomId).emit('gameStarted', { 
      fen: gameData.chess.fen(),
      color: 'w'
    });

    // Отправляем ВТОРОМУ игроку (черные)
    socket.emit('gameStarted', { 
      fen: gameData.chess.fen(),
      color: 'b'
    });
    
    console.log(`Игрок ${playerName} присоединился к ${roomId}`);
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const gameData = games[roomId];
    if (!gameData) return;
    
    const player = gameData.players[socket.id];
    if (!player || player.color !== gameData.chess.turn()) return;

    try {
      // Убираем лишний параметр promotion, который ломал ход
      const cleanMove = { from: move.from, to: move.to };
      
      // Если пешка идет на последнюю линию, добавляем превращение
      const piece = gameData.chess.get(move.from);
      if (piece && piece.type === 'p' && (move.to[1] === '8' || move.to[1] === '1')) {
        cleanMove.promotion = 'q';
      }

      gameData.chess.move(cleanMove);
      
      // Рассылаем ОБОИМ игрокам
      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });

    } catch (e) {
      socket.emit('error', 'Нелегальный ход');
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключился:', socket.id);
  });
});

// УБРАЛИ '0.0.0.0', как было в рабочей версии!
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
