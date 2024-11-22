import { useState, useEffect, useCallback } from "react";
import "./App.css";
import { ArweaveWalletKit, ConnectButton } from "arweave-wallet-kit";
import { message, createDataItemSigner } from "@permaweb/aoconnect";

// AO Process ID for CrowdQuest
const AO_PROCESS = "YOUR_PROCESS_ID"; // Replace with actual process ID

// Configuration constant
const REQUIRED_PLAYERS = 2; // Default requirement of 2 players

// Add this near the top of the file with other functions
function BackButton({ onClick }) {
  return (
    <button className="back-button" onClick={onClick}>
      ← Back to Events
    </button>
  );
}

function App() {
  const [ws, setWs] = useState(null);
  const [events, setEvents] = useState([]);
  const [playerId] = useState(
    `Player_${Math.random().toString(36).substr(2, 9)}`
  );
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);

  // Modified to use AO instead of WebSocket
  useEffect(() => {
    // Initial fetch of games
    fetchActiveGames();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchActiveGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveGames = async () => {
    try {
      const response = await message({
        process: AO_PROCESS,
        tags: [{ name: "Action", value: "GetActiveGames" }],
        signer: createDataItemSigner(window.arweaveWallet),
      });

      // Handle response and update state
      if (response) {
        const games = JSON.parse(response);
        setEvents(games);
      }
    } catch (error) {
      console.error("Error fetching games:", error);
      setError("Failed to fetch games");
    }
  };

  const joinEvent = async (eventId) => {
    try {
      await message({
        process: AO_PROCESS,
        tags: [
          { name: "Action", value: "JoinGame" },
          { name: "gameId", value: eventId },
          { name: "playerId", value: playerId },
        ],
        signer: createDataItemSigner(window.arweaveWallet),
      });

      setSelectedEvent(eventId);
      // Fetch updated game state
      fetchActiveGames();
    } catch (error) {
      console.error("Error joining game:", error);
      setError("Failed to join game");
    }
  };

  // Modify handleMove to use AO
  const handleMove = async (eventId, moveType, moveData) => {
    try {
      await message({
        process: AO_PROCESS,
        tags: [
          { name: "Action", value: "SubmitMove" },
          { name: "gameId", value: eventId },
          { name: "playerId", value: playerId },
          { name: "moveType", value: moveType },
          { name: "moveData", value: JSON.stringify(moveData) },
        ],
        signer: createDataItemSigner(window.arweaveWallet),
      });

      // Fetch updated game state
      fetchActiveGames();
    } catch (error) {
      console.error("Error submitting move:", error);
      setError("Failed to submit move");
    }
  };

  // Add heartbeat to maintain active status
  useEffect(() => {
    if (selectedEvent) {
      const heartbeat = setInterval(async () => {
        try {
          await message({
            process: AO_PROCESS,
            tags: [
              { name: "Action", value: "PlayerHeartbeat" },
              { name: "gameId", value: selectedEvent },
              { name: "playerId", value: playerId },
            ],
            signer: createDataItemSigner(window.arweaveWallet),
          });
        } catch (error) {
          console.error("Heartbeat error:", error);
        }
      }, 15000); // Every 15 seconds

      return () => clearInterval(heartbeat);
    }
  }, [selectedEvent, playerId]);

  const handleBack = () => {
    setSelectedEvent(null); // This will return user to the events list
  };

  return (
    <ArweaveWalletKit
      config={{
        permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"],
        ensurePermissions: true,
      }}
    >
      <div className="App">
        <header className="app-header">
          <div className="header-left">
            <h1>CrowdQuest</h1>
          </div>
          <div className="header-right">
            <ConnectButton />
            <div className="player-info">
              <span className="player-id">{playerId}</span>
            </div>
          </div>
        </header>

        <main>
          {selectedEvent ? (
            <GameView
              event={events.find((e) => e.id === selectedEvent)}
              playerId={playerId}
              ws={ws}
              onBack={handleBack}
            />
          ) : (
            // Show events hub when no event is selected
            <div className="events-hub">
              <div className="hub-header">
                <h2>Crowd Events</h2>
                <div className="hub-stats">
                  <div className="stat">
                    <span className="stat-value">{events.length}</span>
                    <span className="stat-label">Active Events</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">
                      {events.reduce(
                        (sum, event) => sum + event.playerCount,
                        0
                      )}
                    </span>
                    <span className="stat-label">Total Players</span>
                  </div>
                </div>
              </div>

              <div className="events-grid">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onJoin={joinEvent}
                    isSelected={selectedEvent === event.id}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="error-message" onClick={() => setError(null)}>
              {error}
            </div>
          )}
        </main>

        {/* <div className="floating-stats">
          <div className="stat-item">
            <span className="stat-icon">🎮</span>
            <span className="stat-value">Next Event</span>
            <span className="stat-label">{getNextEventTime(events)}</span>
          </div>
        </div> */}
      </div>
    </ArweaveWalletKit>
  );
}

function EventCard({ event, onJoin, isSelected }) {
  const progress = (event.playerCount / REQUIRED_PLAYERS) * 100;

  return (
    <div className={`event-card ${isSelected ? "selected" : ""}`}>
      <div className="event-header">
        <div className="event-status">
          <span
            className={`status-dot ${
              event.status === "active" ? "active" : ""
            }`}
          />
          {event.status.toUpperCase()}
        </div>
        <h3>{event.name}</h3>
      </div>

      <div className="event-info">
        <div className="player-counter">
          <span className="current">{event.playerCount || 0}</span>
          <span className="separator">/</span>
          <span className="required">{REQUIRED_PLAYERS}</span>
          <span className="label">players</span>
        </div>

        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">
            {REQUIRED_PLAYERS - (event.playerCount || 0)} more needed
          </div>
        </div>

        <p className="event-description">{event.description}</p>
      </div>

      <button
        className={`join-button ${event.status === "active" ? "active" : ""}`}
        onClick={() => onJoin(event.id)}
        disabled={event.status === "ended"}
      >
        {getButtonText(event.status)}
      </button>
    </div>
  );
}

function getButtonText(status) {
  switch (status) {
    case "waiting":
      return "Join Queue";
    case "starting":
      return "Starting Soon";
    case "active":
      return "Join Now!";
    case "ended":
      return "Event Ended";
    default:
      return "Join Event";
  }
}

function getNextEventTime(events) {
  const nextEvent = events
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.startTime - b.startTime)[0];

  if (!nextEvent) return "Soon";

  const minutes = Math.floor((nextEvent.startTime - Date.now()) / 60000);
  return minutes > 0 ? `${minutes}m` : "Soon";
}

// Add these new game-specific components
function MemoryGame({ event, playerId, ws }) {
  const handleCardClick = (index) => {
    if (!ws || event.status !== "active") return;
    ws.send(
      JSON.stringify({
        type: "PLAY_MOVE",
        eventId: event.id,
        playerId,
        move: { type: "FLIP_CARD", cardIndex: index },
      })
    );
  };

  return (
    <div className="memory-game">
      <div className="memory-grid">
        {event.cards.map((symbol, index) => (
          <div
            key={index}
            className={`memory-card ${
              event.flipped?.includes(index) ? "flipped" : ""
            } ${event.matched?.includes(index) ? "matched" : ""}`}
            onClick={() => handleCardClick(index)}
          >
            <div className="memory-card-inner">
              <div className="memory-card-front">?</div>
              <div className="memory-card-back">{symbol}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypingGame({ event, playerId, ws }) {
  const [typedText, setTypedText] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Reset typed text when new text is received
    setTypedText("");
  }, [event.currentText]);

  const handleTyping = (e) => {
    const newText = e.target.value;
    setTypedText(newText);

    const progress = Math.floor(
      (newText.length / event.currentText.length) * 100
    );

    ws.send(
      JSON.stringify({
        type: "PLAY_MOVE",
        eventId: event.id,
        playerId,
        move: { type: "TYPE_PROGRESS", progress },
      })
    );

    if (progress === 100) {
      setMessage("Round Complete! New text incoming...");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  return (
    <div className="typing-game">
      {message && <div className="round-message">{message}</div>}
      <div className="typing-target">
        <p>{event.currentText}</p>
      </div>
      <div className="typing-input">
        <textarea
          value={typedText}
          onChange={handleTyping}
          placeholder="Start typing here..."
        />
      </div>
      <div className="typing-stats">
        {Array.from(event.playerProgress || []).map(([player, progress]) => (
          <div key={player} className="player-progress">
            <span>{player === playerId ? "You" : "Opponent"}</span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>{progress}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PuzzleGame({ event, playerId, ws }) {
  const [message, setMessage] = useState("");

  const handleAnswer = (answer) => {
    ws.send(
      JSON.stringify({
        type: "PLAY_MOVE",
        eventId: event.id,
        playerId,
        move: { type: "SUBMIT_ANSWER", answer },
      })
    );

    if (answer === event.puzzle.answer) {
      setMessage("Correct! New puzzle incoming...");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  return (
    <div className="puzzle-game">
      {message && <div className="round-message">{message}</div>}
      <div className="puzzle-question">
        <h3>{event.puzzle?.question}</h3>
      </div>
      <div className="puzzle-options">
        {event.puzzle?.options?.map((option, index) => (
          <button
            key={index}
            className="puzzle-option"
            onClick={() => handleAnswer(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="puzzle-scores">
        {Array.from(event.scores || new Map()).map(([player, score]) => (
          <div key={player} className="player-score">
            <span>{player === playerId ? "You" : "Opponent"}</span>
            <span>{score} points</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modify the GameView component to include the back button
function GameView({ event, playerId, ws, onBack }) {
  if (!event) return null;

  const scoresMap = event.scores ? new Map(event.scores) : new Map();

  if (event.status === "waiting") {
    return (
      <div className="waiting-screen">
        <BackButton onClick={onBack} />
        <h2>Waiting for Players...</h2>
        <div className="player-count">
          {event.playerCount} / {REQUIRED_PLAYERS} Players
        </div>
      </div>
    );
  }

  return (
    <div className="game-view">
      <BackButton onClick={onBack} />
      <div className="game-header">
        <div className="event-info">
          <h3>{event.name}</h3>
          <div className="player-count">{event.playerCount} Players Active</div>
        </div>
        <div className="game-stats">
          <div className="score">
            Your Score: {scoresMap.get(playerId) || 0}
          </div>
        </div>
      </div>

      {/* Render different game types */}
      {event.type === "MEMORY" && (
        <MemoryGame
          event={{ ...event, scores: scoresMap }}
          playerId={playerId}
          ws={ws}
        />
      )}
      {event.type === "TYPING" && (
        <TypingGame
          event={{ ...event, scores: scoresMap }}
          playerId={playerId}
          ws={ws}
        />
      )}
      {event.type === "PUZZLE" && (
        <PuzzleGame
          event={{ ...event, scores: scoresMap }}
          playerId={playerId}
          ws={ws}
        />
      )}
    </div>
  );
}

export default App;
