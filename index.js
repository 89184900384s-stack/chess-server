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

function updateElo(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  const k = 32;
  const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));
  return [newRatingA, newRatingB];
}

io.on('connection', (socket) => {
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
  });

  socket.on('joinGame', ({ roomId, playerName }) => {
    const gameData = games[roomId];
    if (!gameData) return socket.emit('error', 'Комната не найдена');
    if (Object.keys(gameData.players).length >= 2) return socket.emit('error', 'Комната полна');
    
    gameData.players[socket.id] = { name: playerName, color: 'b', rating: 1200 };
    gameData.status = 'playing';
    
    socket.join(roomId);
    
    socket.to(roomId).emit('gameStarted', { fen: gameData.chess.fen(), color: 'w' });
    socket.emit('gameStarted', { fen: gameData.chess.fen(), color: 'b' });
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const gameData = games[roomId];
    if (!gameData) return;

    try {
      const cleanMove = { from: move.from, to: move.to };
      const piece = gameData.chess.get(move.from);
      if (piece && piece.type === 'p' && (move.to[1] === '8' || move.to[1] === '1')) {
        cleanMove.promotion = 'q';
      }

      gameData.chess.move(cleanMove);
      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });
    } catch (e) {
      socket.emit('error', 'Нелегальный ход');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
