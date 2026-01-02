> [!WARNING]  
> This is the **legacy** version of Starfish, deprecated in favor of the rewritten premium Starfish v2 (still in development). This version will not receive further updates. This project is considered unfinished. Only the proxy loaded with official plugins can be guaranteed functional; parts of the legacy plugin API are untested and/or locked. The new plugin API of Starfish v2 has been overhauled with full unlocked support for world data, inventories, and even an injectable overlay module for rendering over your game.

# Starfish Proxy

A Minecraft proxy server for Hypixel with an advanced plugin system, packet modification capabilities, and built-in security features. Designed to provide an alternative to Forge mods or Raven's scripting API, but for legit players and on any client. 

## Quick Start

### For Users

1. Download the latest release from the [Releases](https://github.com/Hexze/Starfish-Proxy/releases) tab
2. Extract the ZIP file and run `starfish-proxy.exe`
3. Connect with Minecraft 1.8.9:
   - Add server: `localhost`
   - Complete Microsoft authentication on first connect
   - Reconnect after authentication

### For Developers

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start the proxy:

```bash
npm start
```

4. Connect with Minecraft 1.8.9 to `localhost`

## Commands

All commands use the format `/module command [args]`. Use `/proxy help` to get started.

### Core Proxy Commands

- `/proxy help` - Show all proxy commands
- `/proxy server` - List available servers
- `/proxy server <name|host:port>` - Switch server target
- `/proxy addserver <name> <host:port>` - Save a server
- `/proxy removeserver <name>` - Remove saved server
- `/proxy reauth` - Force re-authentication
- `/proxy plugins` - List loaded plugins

### Plugin Commands

Each plugin includes these commands by default:

- `/<plugin> help` - Show plugin-provided commands
- `/<plugin> config` - Open configuration UI

## Configuration

Configuration files are stored in:

- `config/starfish-config.json` - Main proxy settings
- `config/plugins/*.config.json` - Plugin configurations
- `data/*.data.json` - Plugin persistent data

### Main Configuration

```json
{
  "proxyPort": 25565,
  "targetHost": "mc.hypixel.net",
  "targetPort": 25565,
  "servers": {
    "hypixel": { "host": "mc.hypixel.net", "port": 25565 }
  }
}
```

## Creating Plugins

Plugins are JavaScript files placed in the `plugins/` directory. I would suggest looking at the existing plugins in this project for more advanced usage, but here's a minimal example:

```javascript
module.exports = (api) => {
  // Plugin metadata
  api.metadata({
    name: "example",
    displayName: "Example Plugin",
    prefix: "§cEX", // [Starfish-EX]
    version: "1.0.0",
    author: "Your Name",
    description: "A simple example plugin",
  });

  // Configuration schema
  api.configSchema([
    {
      label: "Settings",
      settings: [
        {
          key: "enabled",
          type: "toggle",
          description: "Enable the plugin",
        },
      ],
      defaults: { enabled: true },
    },
  ]);

  // Register commands
  api.commands((registry) => {
    registry
      .command("test")
      .description("Test command")
      .handler((ctx) => {
        ctx.send("§aHello");
      });
  });

  // Listen to events
  api.on("chat", (event) => {
    if (event.message.includes("Hello")) {
      api.chat("§eHi");
    }
  });
};
```


### Plugin API Reference

#### Core Methods

- `api.metadata(config)` - Define plugin metadata
- `api.configSchema(schema)` - Define configuration options
- `api.commands(callback)` - Register commands
- `api.on(event, handler)` - Listen to events
- `api.intercept(event, handler)` - Intercept and modify packets

#### Communication

- `api.chat(message)` - Send chat message
- `api.sound(name, x?, y?, z?)` - Play sound
- `api.sendTitle(title, subtitle?)` - Display title
- `api.sendActionBar(text)` - Show action bar text

#### Player Information

- `api.getPlayers()` - Get all players
- `api.getPlayerByName(name)` - Find player by name
- `api.getCurrentPlayer()` - Get the proxy user
- `api.getPlayerTeam(name)` - Get player's team

#### Hypixel API
// haven't reviewed yet

- `api.getPartyInfo(callback, timeout?)` - Get current party information
- `api.getPartyInfoAsync(timeout?)` - Get party info with Promise support
- `api.isInParty(callback, timeout?)` - Check if player is in a party
- `api.getPlayerRole(callback, timeout?)` - Get player's party role (LEADER, MOD, MEMBER)
- `api.getPing(callback, timeout?)` - Test Hypixel API ping with latency measurement
- `api.getPingAsync(timeout?)` - Get ping info with Promise support

#### Display Names

- `api.setDisplayNamePrefix(uuid, prefix)` - Set a prefix before player name
- `api.appendDisplayNamePrefix(uuid, prefix)` - Add to existing prefix
- `api.prependDisplayNamePrefix(uuid, prefix)` - Add before existing prefix
- `api.setDisplayNameSuffix(uuid, suffix)` - Set a suffix after player name
- `api.appendDisplayNameSuffix(uuid, suffix)` - Add to existing suffix
- `api.prependDisplayNameSuffix(uuid, suffix)` - Add before existing suffix
- `api.clearDisplayNamePrefix(uuid)` - Remove prefix for player
- `api.clearDisplayNameSuffix(uuid)` - Remove suffix for player
- `api.clearAllDisplayNames()` - Clear all custom prefixes/suffixes
- `api.getDisplayNamePrefix(uuid)` - Get current prefix for player
- `api.getDisplayNameSuffix(uuid)` - Get current suffix for player

### Available Events

- `chat` - Chat messages received
- `player_join` - Player joins the game
- `player_leave` - Player leaves the game
- `respawn` - Player respawns or changes servers
- `player_move` - Player movement
- `entity_spawn` - Entity spawns
- `plugin_restored` - Plugin re-enabled

### Packet Events

For advanced usage, you can intercept packets:

```javascript
api.intercept("packet:server:chat", (event) => {
  // read packet data
  console.log(event.data);

  // cancel packet (safe packets only)
  event.cancel();

  // modify packet (safe packets only)
  event.modify({ ...event.data, message: "Modified!" });
});
```

## Hypixel Integration

The proxy includes built-in support for Hypixel's custom packet APIs:

### Party Information API

```javascript
// get party information
api.getPartyInfo((result) => {
  if (result.success) {
    console.log(`In party: ${result.inParty}`);
    console.log(`Members: ${result.members.length}`);
    result.members.forEach((member) => {
      console.log(`${member.uuid}: ${member.role}`);
    });
  }
});

// check if someone is party leader
api.getPlayerRole((role) => {
  if (role === "LEADER") {
    console.log("You are the party leader!");
  }
});
```

### Ping API

```javascript
// get hypixel ping
api.getPing((result) => {
  if (result.success) {
    console.log(`Latency: ${result.latency}ms`);
  }
});
```

## Security & Safety

The proxy enforces packet safety to maintain compatibility with Hypixel:

**Safe to Modify:**

- Chat messages, sounds, titles, particles
- Tab list display names
- Scoreboard data

**Read-Only:**

- Player movement and rotation
- Combat actions
- Block interactions
- Inventory actions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Credits

- Created by Hexze assisted by Claude Code 
- Special thanks to J0nahG for starting the project and assisting me, and to Desiyn and nilsraccoon for contributing to development.

## Support

For issues, questions, or suggestions:

- Open an issue on GitHub
- Join the [Discord server](https://discord.gg/urchin)
