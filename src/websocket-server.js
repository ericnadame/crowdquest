const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const gameRooms = new Map();

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "JOIN_GAME":
        handleJoinGame(ws, data);
        break;
      case "CARD_FLIP":
        handleCardFlip(ws, data);
        break;
      case "GAME_ACTION":
        handleGameAction(ws, data);
        break;
    }
  });

  ws.on("close", () => {
    // Handle player disconnect
    handlePlayerDisconnect(ws);
  });
});

function handleJoinGame(ws, data) {
  const { gameId, player } = data;

  if (!gameRooms.has(gameId)) {
    gameRooms.set(gameId, {
      players: new Map(),
      gameState: {
        cards: [],
        currentTurn: null,
        scores: new Map(),
      },
    });
  }

  const room = gameRooms.get(gameId);
  room.players.set(player.address, { ws, ...player });

  // Notify all players in the room
  broadcastToRoom(gameId, {
    type: "PLAYER_JOINED",
    playerCount: room.players.size,
    players: Array.from(room.players.values()).map((p) => ({
      address: p.address,
      score: room.gameState.scores.get(p.address) || 0,
    })),
  });
}

function handleCardFlip(ws, data) {
  const { gameId, cardIndex, player } = data;
  const room = gameRooms.get(gameId);

  if (!room) return;

  // Broadcast card flip to all players
  broadcastToRoom(gameId, {
    type: "CARD_FLIPPED",
    cardIndex,
    player: player.address,
  });
}

function handleGameAction(ws, data) {
  const { gameId, action, player } = data;
  const room = gameRooms.get(gameId);

  if (!room) return;

  switch (action) {
    case "SCORE_UPDATE":
      room.gameState.scores.set(player.address, data.score);
      broadcastToRoom(gameId, {
        type: "SCORE_UPDATED",
        player: player.address,
        score: data.score,
      });
      break;
  }
}

function handlePlayerDisconnect(ws) {
  // Remove player from their game room
  gameRooms.forEach((room, gameId) => {
    room.players.forEach((player, address) => {
      if (player.ws === ws) {
        room.players.delete(address);
        broadcastToRoom(gameId, {
          type: "PLAYER_LEFT",
          player: address,
          playerCount: room.players.size,
        });
      }
    });
  });
}

function broadcastToRoom(gameId, message) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  room.players.forEach((player) => {
    player.ws.send(JSON.stringify(message));
  });
}
