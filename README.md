# The Last Alibi

A real-time, browser-based mystery and betrayal party game for 5–8 friends. Players join a room with a five-character code, receive secret identities, investigate evidence, discuss in public chat, and vote privately on who stole the Obsidian File.

## Features

- Create a room and share its code
- 5–8 players per room; the host starts the case
- Hidden roles: Thief, Accomplice (6+ players), Detective, and Guests
- Private player secrets and a one-use Detective instinct
- Host-controlled evidence reveals and final vote
- Public live chat and private accusation ballots
- Vote tally, role reveal, win/loss result, and replay
- Responsive dark mystery-themed UI

## Requirements

- Node.js 18 or newer
- Internet access for the first install, so npm can download Express and Socket.IO

## Run locally

1. Unzip the project.
2. Open Terminal in the `last-alibi` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open <http://localhost:3000> in a browser.
6. Create a room, then join from other browser tabs/devices using the room code. At least five distinct players are needed to start.

The room server is in-memory: active games live while the Node process is running. Restarting the server clears rooms.

## Play with friends on another network

The server must be hosted on a public Node.js host that supports persistent WebSocket connections. Deploy this folder as a Node web service, use `npm start` as the start command, and share the resulting HTTPS URL. A static hosting service alone cannot run the multiplayer server. For same-Wi-Fi play, run the server on a computer and use that computer's LAN IP with port `3000`, allowing inbound connections through the local firewall.

## Game rules

1. **Investigate:** The host starts the game and reveals up to three clues. Everyone can discuss theories in chat.
2. **Use your role:** The Thief tries to avoid suspicion. The Accomplice helps protect the Thief. The Detective can use one private instinct on a suspect. Guests compare stories and investigate.
3. **Vote:** The host opens the final vote. Every player chooses one other player; votes remain hidden until the reveal.
4. **Reveal:** A strict majority of the whole room must vote for the Thief to catch them. Otherwise, the Thief escapes. The host can reveal once at least half the room has voted, so the round can finish even if a player disconnects.
5. **Replay:** The host opens a new case and roles are reassigned.

## Project structure

```text
last-alibi/
├── server.js          # Express + Socket.IO room/game server
├── package.json
├── README.md
└── public/
    ├── index.html     # Landing page and game shell
    ├── style.css      # Visual design and responsive layout
    └── app.js         # Client UI and multiplayer events
```

## Notes

This is a playable MVP intended for friends and prototyping. Rooms are not password-protected, there is no persistent database, and room state is lost when the server restarts. For a public release, add rate limiting, moderation/report tools, persistent storage, stronger reconnect/session handling, and automated tests.
