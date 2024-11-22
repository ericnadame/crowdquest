const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8080 });

// Track active games and players
const activeGames = new Map();
const connectedPlayers = new Map();

server.on("connection", (ws) => {
  console.log("Player connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    console.log("Received:", data);

    switch (data.type) {
      case "CREATE_GAME":
        createGame(ws, data);
        break;
      case "JOIN_GAME":
        joinGame(ws, data);
        break;
      case "PLAY_MOVE":
        handleMove(ws, data);
        break;
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });
});

function createGame(ws, data) {
  const gameId = Math.random().toString(36).substr(2, 9);

  const gameState = {
    id: gameId,
    creator: data.playerId,
    players: new Map([[data.playerId, ws]]),
    status: "waiting",
    board: Array(12).fill(null),
    currentTurn: data.playerId,
    scores: new Map([[data.playerId, 0]]),
  };

  activeGames.set(gameId, gameState);
  connectedPlayers.set(ws, { gameId, playerId: data.playerId });

  // Notify creator
  ws.send(
    JSON.stringify({
      type: "GAME_CREATED",
      gameId,
      playerId: data.playerId,
    })
  );

  broadcastGameState(gameId);
}

function joinGame(ws, data) {
  const game = activeGames.get(data.gameId);

  if (!game) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Game not found" }));
    return;
  }

  if (game.players.size >= 2) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Game is full" }));
    return;
  }

  game.players.set(data.playerId, ws);
  game.scores.set(data.playerId, 0);
  game.status = "active";

  connectedPlayers.set(ws, { gameId: data.gameId, playerId: data.playerId });

  broadcastGameState(data.gameId);
}

function handleMove(ws, data) {
  const playerInfo = connectedPlayers.get(ws);
  const game = activeGames.get(playerInfo.gameId);

  if (!game || game.status !== "active") return;
  if (game.currentTurn !== playerInfo.playerId) return;

  // Process the move
  if (isValidMove(game, data.position)) {
    makeMove(game, data.position, playerInfo.playerId);
    broadcastGameState(playerInfo.gameId);
  }
}

function handleDisconnect(ws) {
  const playerInfo = connectedPlayers.get(ws);
  if (!playerInfo) return;

  const game = activeGames.get(playerInfo.gameId);
  if (game) {
    game.players.delete(playerInfo.playerId);
    game.status = "ended";
    broadcastGameState(playerInfo.gameId);

    if (game.players.size === 0) {
      activeGames.delete(playerInfo.gameId);
    }
  }

  connectedPlayers.delete(ws);
}

function broadcastGameState(gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;

  const gameState = {
    id: game.id,
    status: game.status,
    board: game.board,
    currentTurn: game.currentTurn,
    scores: Array.from(game.scores),
    playerCount: game.players.size,
  };

  game.players.forEach((ws) => {
    ws.send(
      JSON.stringify({
        type: "GAME_STATE",
        state: gameState,
      })
    );
  });
}

console.log("Game server running on port 8080");
