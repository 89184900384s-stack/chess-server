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
    
    socket.to(roomId).emit('gameStarted', { 
      fen: gameData.chess.fen(),
      color: 'w'
    });

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
      // ИСПРАВЛЕНИЕ: копируем только from и to
      let cleanMove = { from: move.from, to: move.to };
      
      // Если это пешка на последнюю линию, добавляем превращение
      const piece = gameData.chess.get(move.from);
      if (piece && piece.type === 'p' && (move.to[1] === '8' || move.to[1] === '1')) {
        cleanMove.promotion = 'q';
      }

      const result = gameData.chess.move(cleanMove);
      if (!result) throw new Error('Нелегальный ход');

      io.to(roomId).emit('moveMade', { fen: gameData.chess.fen() });

      if (gameData.chess.isGameOver()) {
        let resultForWhite = 0.5;
        if (gameData.chess.isCheckmate()) {
          resultForWhite = gameData.chess.turn() === 'b' ? 1 : 0;
        }
        
        const whitePlayer = Object.values(gameData.players).find(p => p.color === 'w');
        const blackPlayer = Object.values(gameData.players).find(p => p.color === 'b');
        
        const [newWhiteRating, newBlackRating] = updateElo(
          whitePlayer.rating, 
          blackPlayer.rating, 
          resultForWhite
        );
        
        io.to(roomId).emit('gameOver', {
          result: resultForWhite === 1 ? 'Белые победили' : resultForWhite === 0 ? 'Черные победили' : 'Ничья',
          ratings: { white: newWhiteRating, black: newBlackRating }
        });
        delete games[roomId];
      }
    } catch (e) {
      socket.emit('error', 'Нелегальный ход');
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключился:', socket.id);
  });
});

// РАБОЧИЙ ВАРИАНТ ИЗ САМОГО НАЧАЛА
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
