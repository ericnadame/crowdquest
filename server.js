const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8080 });

// Configuration constants
const DEFAULT_REQUIRED_PLAYERS = 2; // Set default requirement to 2 players

// Track active games, events, and players
const activeGames = new Map();
const activeEvents = new Map();
const connectedPlayers = new Map();

// Modify EVENT_TYPES to include game-specific logic
const EVENT_TYPES = {
  MEMORY: {
    id: "memory",
    name: "Memory Masters Tournament",
    minPlayers: DEFAULT_REQUIRED_PLAYERS,
    description: "Test your memory skills against other players",
    duration: 300000,
    gameType: "memory",
    initGame: () => ({
      cards: createShuffledMemoryCards(),
      flipped: [],
      matched: [],
      scores: new Map(),
    }),
  },
  TYPING: {
    id: "typing",
    name: "Speed Typing Championship",
    minPlayers: DEFAULT_REQUIRED_PLAYERS,
    description: "Race against others in typing challenges",
    duration: 180000,
    gameType: "typing",
    initGame: () => ({
      currentText: getRandomText(),
      playerProgress: new Map(),
      scores: new Map(),
    }),
  },
  PUZZLE: {
    id: "puzzle",
    name: "Puzzle Rush Royale",
    minPlayers: DEFAULT_REQUIRED_PLAYERS,
    description: "Solve puzzles faster than your opponents",
    duration: 240000,
    gameType: "puzzle",
    initGame: () => ({
      puzzle: generatePuzzle(),
      solutions: new Map(),
      scores: new Map(),
    }),
  },
};

function initializeDefaultEvents() {
  Object.entries(EVENT_TYPES).forEach(([type, config]) => {
    const eventId = `${type}_${Math.random().toString(36).substr(2, 9)}`;
    const event = {
      id: eventId,
      name: config.name,
      type: type,
      status: "waiting",
      players: new Set(),
      minPlayers: DEFAULT_REQUIRED_PLAYERS,
      description: config.description,
      startTime: Date.now(),
      scores: new Map(),
      ...config.initGame(),
    };
    activeEvents.set(eventId, event);
  });
}

server.on("connection", (ws) => {
  console.log("Player connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    console.log("Received:", data);

    switch (data.type) {
      case "REQUEST_EVENTS":
        console.log("Sending events list");
        sendEventsList(ws);
        break;
      case "JOIN_EVENT":
        console.log("Player joining event:", data.eventId);
        handleEventJoin(ws, data);
        break;
      case "PLAY_MOVE":
        console.log("Player made move:", data);
        handleMove(ws, data);
        break;
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });

  // Send initial events list when client connects
  sendEventsList(ws);
});

function sendEventsList(ws) {
  const eventsData = Array.from(activeEvents.values()).map((event) => ({
    id: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    playerCount: event.players.size,
    minPlayers: event.minPlayers,
    description: event.description,
    startTime: event.startTime,
    cards: event.cards,
    currentText: event.currentText,
    puzzle: event.puzzle,
    scores: Array.from(event.scores || new Map()),
    flipped: event.flipped,
    matched: event.matched,
  }));

  ws.send(
    JSON.stringify({
      type: "EVENTS_LIST",
      events: eventsData,
    })
  );
}

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
    cards: [],
    flipped: [],
    matched: [],
    lastMove: null,
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
  if (!playerInfo) return;

  const event = activeEvents.get(data.eventId);
  if (!event || event.status !== "active") return;

  switch (event.type) {
    case "MEMORY":
      handleMemoryMove(event, playerInfo.playerId, data.move);
      break;
    case "TYPING":
      handleTypingMove(event, playerInfo.playerId, data.move);
      break;
    case "PUZZLE":
      handlePuzzleMove(event, playerInfo.playerId, data.move);
      break;
  }

  broadcastEventUpdate(data.eventId);
}

function handleMemoryMove(event, playerId, move) {
  if (move.type !== "FLIP_CARD") return;

  // Don't allow flipping if card is already matched
  if (event.matched.includes(move.cardIndex)) return;

  // Don't allow flipping if card is already flipped
  if (event.flipped.includes(move.cardIndex)) return;

  // Add card to flipped array
  event.flipped.push(move.cardIndex);

  // Check for matches when 2 cards are flipped
  if (event.flipped.length === 2) {
    const [first, second] = event.flipped;

    // If cards match
    if (event.cards[first] === event.cards[second]) {
      event.matched.push(first, second);
      const currentScore = event.scores.get(playerId) || 0;
      event.scores.set(playerId, currentScore + 1);
    }

    // Clear flipped cards after a delay
    setTimeout(() => {
      event.flipped = [];
      broadcastEventUpdate(event.id);
    }, 1000);
  }

  // Broadcast the updated state immediately
  broadcastEventUpdate(event.id);
}

function handleTypingMove(event, playerId, move) {
  if (move.type !== "TYPE_PROGRESS") return;

  event.playerProgress.set(playerId, move.progress);
  if (move.progress === 100) {
    const currentScore = event.scores.get(playerId) || 0;
    event.scores.set(playerId, currentScore + 1);

    // Generate new text for next round
    event.currentText = getNextTypingText(event);

    // Reset progress for all players
    event.playerProgress.clear();

    // Notify players of new round
    broadcastToEventPlayers(event.id, {
      type: "NEW_ROUND",
      message: "New typing challenge!",
      currentText: event.currentText,
    });
  }
}

function handlePuzzleMove(event, playerId, move) {
  if (move.type !== "SUBMIT_ANSWER") return;

  event.solutions.set(playerId, move.answer);
  if (move.answer === event.puzzle.answer) {
    const currentScore = event.scores.get(playerId) || 0;
    event.scores.set(playerId, currentScore + 1);

    // Generate new puzzle for next round
    event.puzzle = getNextPuzzle();

    // Clear previous solutions
    event.solutions.clear();

    // Notify players of new round
    broadcastToEventPlayers(event.id, {
      type: "NEW_ROUND",
      message: "New puzzle!",
      puzzle: event.puzzle,
    });
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

// Add these functions to handle event activation
function handleEventJoin(ws, data) {
  const event = activeEvents.get(data.eventId);
  if (!event) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Event not found" }));
    return;
  }

  // Add player to event
  event.players.add(data.playerId);
  connectedPlayers.set(ws, {
    playerId: data.playerId,
    currentEvent: data.eventId,
  });

  // Important: Check if event should start
  if (
    event.players.size >= DEFAULT_REQUIRED_PLAYERS &&
    event.status === "waiting"
  ) {
    startEvent(event.id);
  }

  broadcastEventUpdate(event.id);
}

function startEvent(eventId) {
  const event = activeEvents.get(eventId);
  if (!event) return;

  event.status = "active";
  event.startTime = Date.now();

  // Initialize game state based on game type
  const gameType = EVENT_TYPES[event.type];
  const gameState = gameType.initGame();
  Object.assign(event, gameState);

  // Broadcast to all players that game is starting
  Array.from(event.players).forEach((playerId) => {
    const playerWs = Array.from(connectedPlayers.entries()).find(
      ([_, info]) => info.playerId === playerId
    )?.[0];

    if (playerWs) {
      playerWs.send(
        JSON.stringify({
          type: "GAME_STARTED",
          eventId,
          gameState: {
            ...gameState,
            gameType: gameType.gameType,
            players: Array.from(event.players),
            status: "active",
          },
        })
      );
    }
  });

  broadcastEventUpdate(eventId);
}

// Helper functions for different game types
function createShuffledMemoryCards() {
  const symbols = ["🎮", "🎲", "🎯", "🎪", "🎨", "🎭"];
  const cards = [...symbols, ...symbols];
  return cards.sort(() => Math.random() - 0.5);
}

function getRandomText() {
  const texts = [
    "The quick brown fox jumps over the lazy dog",
    "Pack my box with five dozen liquor jugs",
    "How vexingly quick daft zebras jump",
  ];
  return texts[Math.floor(Math.random() * texts.length)];
}

function generatePuzzle() {
  return {
    question: "What number comes next in the sequence: 2, 4, 8, 16, __?",
    answer: "32",
    options: ["24", "28", "32", "36"],
  };
}

// Modify the broadcastEventUpdate function to include more game state
function broadcastEventUpdate(eventId) {
  const event = activeEvents.get(eventId);
  if (!event) return;

  const eventData = {
    id: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    playerCount: event.players.size,
    minPlayers: DEFAULT_REQUIRED_PLAYERS,
    startTime: event.startTime,
    description: event.description,
    cards: event.cards,
    currentText: event.currentText,
    puzzle: event.puzzle,
    flipped: event.flipped,
    matched: event.matched,
    scores: Array.from(event.scores || new Map()),
    players: Array.from(event.players),
    playerProgress: event.playerProgress
      ? Array.from(event.playerProgress)
      : [],
  };

  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "EVENT_UPDATE",
          event: eventData,
        })
      );
    }
  });
}

// Add this function to generate new typing text
function getNextTypingText(event) {
  const texts = [
    "The quick brown fox jumps over the lazy dog",
    "Pack my box with five dozen liquor jugs",
    "How vexingly quick daft zebras jump",
    "Sphinx of black quartz, judge my vow",
    "Two driven jocks help fax my big quiz",
    "The five boxing wizards jump quickly",
  ];

  // Get a different text than the current one
  let newText;
  do {
    newText = texts[Math.floor(Math.random() * texts.length)];
  } while (newText === event.currentText);

  return newText;
}

// Add this function to generate new puzzles
function getNextPuzzle() {
  const puzzles = [
    {
      question: "What number comes next in the sequence: 2, 4, 8, 16, __?",
      answer: "32",
      options: ["24", "28", "32", "36"],
    },
    {
      question: "Complete the pattern: 1, 3, 6, 10, __?",
      answer: "15",
      options: ["13", "14", "15", "16"],
    },
    {
      question: "What's the next letter: A, C, F, J, __?",
      answer: "O",
      options: ["M", "N", "O", "P"],
    },
    {
      question: "Find the missing number: 3, 6, 12, 24, __?",
      answer: "48",
      options: ["36", "42", "48", "54"],
    },
  ];

  return puzzles[Math.floor(Math.random() * puzzles.length)];
}

// Helper function to broadcast to all players in an event
function broadcastToEventPlayers(eventId, message) {
  const event = activeEvents.get(eventId);
  if (!event) return;

  Array.from(event.players).forEach((playerId) => {
    const playerWs = Array.from(connectedPlayers.entries()).find(
      ([_, info]) => info.playerId === playerId
    )?.[0];

    if (playerWs && playerWs.readyState === WebSocket.OPEN) {
      playerWs.send(JSON.stringify(message));
    }
  });
}

initializeDefaultEvents();

console.log("Game server running on port 8080");
