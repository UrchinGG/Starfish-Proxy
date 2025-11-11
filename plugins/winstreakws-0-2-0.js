// Winstreakws Integration Plugin
// Tab list stats + Commands
// Enables automatic checking and displaying winstreak.ws's data of players.

const https = require('https');
const { URL } = require('url');

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Starfish-Proxy-Winstreak-Plugin/0.2.0 (WinstreakWS)'
            }
        };

        const req = https.get(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ data: jsonData, status: res.statusCode });
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function httpsPost(url, postData) {
    return new Promise((resolve, reject) => {
        const postDataString = JSON.stringify(postData);
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postDataString),
                'User-Agent': 'Starfish-Proxy-Winstreak-Plugin/0.0.2 (WinstreakWS)'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ data: jsonData, status: res.statusCode });
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postDataString);
        req.end();
    });
}

const BASE_URL = 'https://api.winstreak.ws/';

module.exports = (api) => {
    api.metadata({
        name: 'winstreak',
        displayName: 'Winstreak.ws Integration',
        prefix: '§9W§fS',
        version: '0.2.0',
        author: 'Qetrox@Winstreak.ws',
        minVersion: '0.1.7',
        description: 'Tab list stats + Enables automatic checking and displaying winstreak.ws\'s data of players.',
        dependencies: [
            { name: 'denicker', minVersion: '1.1.0' }
        ]
    });

    const plugin = new WinstreakwsPlugin(api);

    const configSchema = [
        {
            label: 'API Key',
            description: 'Set your Winstreak API key for plugin authentication.',
            defaults: {
                api: {
                    apiKey: '',
                    keyValid: false
                }
            },
            settings: [
                {
                    type: 'text',
                    key: 'ws_pl.api.apikey',
                    description: 'Enter your Winstreak API key.',
                    placeholder: 'API key',
                    
                }
            ]
        },
        {
            label: 'Alerts',
            description: 'Manage chat and audio alerts for players.',
            defaults: {
                ws_pl: {
                    alerts: {
                        enabled: true,
                        audioAlerts: { enabled: true },
                        alertDelay: 0
                    }
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.alerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable all chat alerts.'
                },
                {
                    type: 'soundToggle',
                    key: 'ws_pl.alerts.audioAlerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable sounds on chat alert.'
                }
            ]
        },
        {
            label: 'Tab List Tags',
            description: 'Display winstreak.ws tags in the tab list.',
            defaults: {
                ws_pl: { tablist: { enabled: true } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tablist.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable winstreak.ws tags in the tab list.',
                    onChange: (enabled) => {
                        if (plugin.taggedPlayers && plugin.taggedPlayers.size > 0) {
                            for (const uuid of plugin.taggedPlayers.keys()) {
                                plugin.updateTabListDisplay(uuid);
                            }
                        }
                        if (plugin.playerStats && plugin.playerStats.size > 0) {
                            for (const uuid of plugin.playerStats.keys()) {
                                if (!plugin.taggedPlayers.has(uuid)) {
                                    plugin.updateTabListDisplay(uuid);
                                }
                            }
                        }
                    }
                }
            ]
        },
        {
            label: 'Tab List Stats',
            description: 'Display winstreak.ws player stats in the tab list.',
            defaults: {
                ws_pl: { tablist_stats: { enabled: true } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tablist_stats.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable player stats in the tab list.',
                    onChange: (enabled) => {
                        if (plugin.playerStats && plugin.playerStats.size > 0) {
                            for (const uuid of plugin.playerStats.keys()) {
                                plugin.updateTabListDisplay(uuid);
                            }
                        }
                        if (plugin.taggedPlayers && plugin.taggedPlayers.size > 0) {
                            for (const uuid of plugin.taggedPlayers.keys()) {
                                if (!plugin.playerStats.has(uuid)) {
                                    plugin.updateTabListDisplay(uuid);
                                }
                            }
                        }
                        if (!enabled) {
                            const allUUIDs = new Set([
                                ...(plugin.playerStats ? plugin.playerStats.keys() : []),
                                ...(plugin.taggedPlayers ? plugin.taggedPlayers.keys() : [])
                            ]);
                            for (const uuid of allUUIDs) {
                                plugin.updateTabListDisplay(uuid);
                            }
                        }
                    }
                }
            ]
        },
        {
            label: 'Color Settings',
            description: 'Customize the colors used.',
            defaults: {
                ws_pl: { customcolors: { enabled: true } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.customcolors.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable custom colors. If disabled, brand colors will be used.',
                }
            ]
        },
        {
            label: 'Blacklist Tag',
            description: 'Enable or disable Winstreak\'s blacklist tags.',
            defaults: {
                ws_pl: { tags: { blacklist: { enabled: true } } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.blacklist.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable Winstreak\'s blacklist tags.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Gap Tag',
            description: 'Enable or disable the gap tag.',
            defaults: { ws_pl: { tags: { gaps: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.gaps.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the gap tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'New Account Tag',
            description: 'Enable or disable the new account tag.',
            defaults: { ws_pl: { tags: { nacc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.nacc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the new account tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Ping Tag',
            description: 'Enable or disable the ping tag.',
            defaults: { ws_pl: { tags: { ping: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.ping.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the ping tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Radar Tag',
            description: 'Enable or disable the seen on private server tag.',
            defaults: { ws_pl: { tags: { radar: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.radar.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the seen on private server tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Recent Name Change Tag',
            description: 'Enable or disable the recent name change tag.',
            defaults: { ws_pl: { tags: { rnc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.rnc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the recent name change tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Statistic Account Tag',
            description: 'Enable or disable the likely statistic account tag.',
            defaults: { ws_pl: { tags: { statacc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.statacc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the likely statistic account tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Level Stat',
            description: 'Enable or disable the level stat in tab list.',
            defaults: { ws_pl: { stats: { level: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.level.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the level stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'FKDR Stat',
            description: 'Enable or disable the Final Kill/Death Ratio stat in tab list.',
            defaults: { ws_pl: { stats: { fkdr: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.fkdr.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the Final Kill/Death Ratio stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'WLR Stat',
            description: 'Enable or disable the Win/Loss Ratio stat in tab list.',
            defaults: { ws_pl: { stats: { wlr: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.wlr.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the Win/Loss Ratio stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'BBLR Stat',
            description: 'Enable or disable the Bed Break/Loss Ratio stat in tab list.',
            defaults: { ws_pl: { stats: { bblr: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.bblr.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the Bed Break/Loss Ratio stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Winstreak Stat',
            description: 'Enable or disable the winstreak stat in tab list.',
            defaults: { ws_pl: { stats: { winstreak: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.winstreak.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the winstreak stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Finals Stat',
            description: 'Enable or disable the final kills stat in tab list.',
            defaults: { ws_pl: { stats: { finals: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.finals.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the final kills stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Wins Stat',
            description: 'Enable or disable the wins stat in tab list.',
            defaults: { ws_pl: { stats: { wins: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.wins.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the wins stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Kills Stat',
            description: 'Enable or disable the kills stat in tab list.',
            defaults: { ws_pl: { stats: { kills: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.kills.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the kills stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Deaths Stat',
            description: 'Enable or disable the deaths stat in tab list.',
            defaults: { ws_pl: { stats: { deaths: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.deaths.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the deaths stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'KDR Stat',
            description: 'Enable or disable the Kill/Death Ratio stat in tab list.',
            defaults: { ws_pl: { stats: { kdr: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.kdr.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the Kill/Death Ratio stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        },
        {
            label: 'Beds Stat',
            description: 'Enable or disable the beds broken stat in tab list.',
            defaults: { ws_pl: { stats: { beds: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.stats.beds.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the beds broken stat in tab list.',
                    onChange: () => plugin.onStatsConfigChanged()
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);
    api.configSchema(configSchema);

    api.commands((registry) => {
        registry.command('setkey')
            .description('Set your Winstreak API key.')
            .argument('<apikey>', 'Your Winstreak API key')
            .handler((ctx) => plugin.handleSetKeyCommand(ctx.args.apikey));

        registry.command('check')
            .description('Check a specific player for tags.')
            .argument('<username>', 'The username to check')
            .handler((ctx) => plugin.handleCheckPlayerCommand(ctx.args.username));
    });

    plugin.registerHandlers();
    return plugin;

}

class WinstreakwsPlugin {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.cache = new WinstreakCache(this);
        this.taggedPlayers = new Map();
        this.playerStats = new Map();
    }

    registerHandlers() {
        this.api.on('respawn', this.onRespawn.bind(this));
        this.api.on('plugin_restored', this.onPluginRestored.bind(this));
        this.api.on('chat', this.onChat.bind(this));
    }

    updateTabListDisplay(uuid) {
        if (!uuid) return;
        
        const tagsEnabled = this.api.config.get('ws_pl.tablist.enabled');
        const statsEnabled = this.api.config.get('ws_pl.tablist_stats.enabled');
        const tags = this.taggedPlayers.get(uuid);
        const stats = this.playerStats.get(uuid);
        
        let suffix = '';
        
        // Create tags section if enabled and tags exist
        if (tagsEnabled && tags && tags.length > 0) {
            const customColors = this.api.config.get('ws_pl.customcolors.enabled');
            const tagText = tags.map(tag => {
                let color = getMinecraftColorByNumber(tag.color);
                if (!customColors) color = '§9';
                return `${color}${tag.name}`;
            }).join(' §7| §r');
            suffix += ' ' + tagText;
        }
        
        // Create stats section if enabled and stats exist
        if (statsEnabled && stats) {
            const statsText = this.formatStatsForTabList(stats);
            if (statsText) {
                suffix += ' ' + statsText;
            }
        }
        
        if (suffix) {
            this.api.appendDisplayNameSuffix(uuid, suffix);
        } else {
            this.api.clearDisplayNameSuffix(uuid);
        }
    }

    updatePlayerTags(uuid, tags) {
        if (tags && tags.length > 0) {
            this.taggedPlayers.set(uuid, tags);
        } else {
            this.taggedPlayers.delete(uuid);
        }
        this.updateTabListDisplay(uuid);
    }
    
    updatePlayerStats(uuid, stats) {
        if (stats) {
            this.playerStats.set(uuid, stats);
        } else {
            this.playerStats.delete(uuid);
        }
        this.updateTabListDisplay(uuid);
    }


    async handleSetKeyCommand(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            this.sendMessage('§7Usage: /winstreak setkey <your-api-key>');
            return;
        }

        this.api.config.set('ws_pl.api.apikey', apiKey.trim());
        this.api.config.set('ws_pl.api.keyValid', false);
        this.sendMessage('§eTesting API connection...');

        const isConnected = await this.testApiConnection();
        if (isConnected) {
            this.api.config.set('ws_pl.api.keyValid', true);
            this.sendMessage('§2Succesfully connected to Winstreak API.')
            this.sendMessage('§aAPI key set successfully.');
        } else {
            this.api.config.set('ws_pl.api.keyValid', false);
            this.sendMessage('§cCouldn\'t connect to Winstreak API. Check your key!')
        }
    }

    async handleCheckPlayerCommand(username) {
        if (!username || username.trim() === '') {
            this.sendMessage('§7Usage: /winstreak check <username>');
            return;
        }

        const apiKey = this.api.config.get('ws_pl.api.apikey');
        const keyValid = this.api.config.get('ws_pl.api.keyValid');
        
        if (!apiKey || apiKey === '') {
            this.sendMessage('§cNo API key set. Use /winstreak setkey <your-api-key> to set it.');
            return;
        }
        
        if (!keyValid) {
    this.sendMessage('§cAPI key is not valid. Please set a valid API key using /winstreak setkey <your-api-key>');
            return;
        }

        this.sendMessage(`§eChecking tags and stats for ${username}...`);

        try {
            const [tags, stats] = await Promise.all([
                this.fetchPlayerTags(username.trim()),
                this.fetchPlayerStats(username.trim())
            ]);

            if (tags && tags.length > 0) {
                let formattedTags = [];
                tags.forEach(tag => {
                    let color = getMinecraftColorByNumber(tag.color);
                    if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                    formattedTags.push({
                        text: `${color}${tag.name}§r`,
                        hoverEvent: tag.description ? {
                            action: 'show_text',
                            value: tag.description
                        } : undefined
                    });
                });

                let message = {
                    text: `${this.PLUGIN_PREFIX}§r ${username} has the following tags: `,
                    extra: []
                };
                formattedTags.forEach((tagObj, idx) => {
                    if (idx > 0) message.extra.push({ text: ' §7| §r' });
                    message.extra.push(tagObj);
                });
                this.api.chat(message);
            } else {
                this.sendMessage(`§7No tags found for ${username}.`);
            }

            // Display stats if available
            if (stats) {
                this.sendMessage(`§eStats for §b${username}§e:`);
                
                if (stats.level !== undefined && stats.level !== null) {
                    const starFormatted = this.getStarColor(stats.level);
                    this.sendMessage(`§7Level: ${starFormatted}`);
                }
                
                if (stats.fkdr !== undefined && stats.fkdr !== null) {
                    this.sendMessage(`§7FKDR: §a${stats.fkdr.toFixed(2)}`);
                }
                
                if (stats.wlr !== undefined && stats.wlr !== null) {
                    this.sendMessage(`§7WLR: §a${stats.wlr.toFixed(2)}`);
                }
                
                if (stats.bblr !== undefined && stats.bblr !== null) {
                    this.sendMessage(`§7BBLR: §a${stats.bblr.toFixed(2)}`);
                }
                
                if (stats.winstreak !== undefined && stats.winstreak !== null) {
                    this.sendMessage(`§7Winstreak: §a${stats.winstreak}`);
                }
                
                if (stats.finals !== undefined && stats.finals !== null) {
                    this.sendMessage(`§7Final Kills: §a${stats.finals.toLocaleString()}`);
                }
                
                if (stats.wins !== undefined && stats.wins !== null) {
                    this.sendMessage(`§7Wins: §a${stats.wins.toLocaleString()}`);
                }
                
                if (stats.kills !== undefined && stats.kills !== null) {
                    this.sendMessage(`§7Kills: §a${stats.kills.toLocaleString()}`);
                }
                
                if (stats.deaths !== undefined && stats.deaths !== null) {
                    this.sendMessage(`§7Deaths: §a${stats.deaths.toLocaleString()}`);
                }
                
                if (stats.kdr !== undefined && stats.kdr !== null) {
                    this.sendMessage(`§7KDR: §a${stats.kdr.toFixed(2)}`);
                }
                
                if (stats.beds !== undefined && stats.beds !== null) {
                    this.sendMessage(`§7Beds Broken: §a${stats.beds.toLocaleString()}`);
                }
            } else {
                this.sendMessage(`§7No stats found for ${username}.`);
            }
        } catch (error) {
            this.sendMessage(`§cError checking ${username}: ${error.message}`);
        }
    }

    sendMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX}§r ${message}`);
    }

    async onRespawn() {
        this.api.clearAllDisplayNames();
    };

    onChat(event) {
        if (event.position === 2) return;

        const cleanText = event.message.replace(/§[0-9a-fk-or]/g, '');

        if (cleanText.startsWith('ONLINE:')) {
            const apiKey = this.api.config.get('ws_pl.api.apikey');
            const keyValid = this.api.config.get('ws_pl.api.keyValid');

            if (!apiKey || apiKey.trim() === '' || !keyValid) {
                return;
            }

            let usernames = cleanText
                .replace('ONLINE:', '')
                .split(',')
                .map(name => name.trim())
                .filter(name => name.length > 0);

            const denickerPlugin = this.api.getPluginInstance('denicker');
            if (denickerPlugin) {
                const resolvedNicks = [];
                const nicks = []
                const nickMappings = new Map();

                for (const username of usernames) {
                    const realName = denickerPlugin.getRealName(username);
                    if (realName) {
                        nicks.push(username);
                        resolvedNicks.push(realName);
                        nickMappings.set(realName, username);
                    }
                }

                // Collect all players to fetch
                const playersToFetch = [];
                const playerMappings = new Map(); // maps player identifier to player object

                // Add resolved nicks (use UUIDs)
                if (resolvedNicks.length > 0) {
                    resolvedNicks.forEach(realName => {
                        const player = this.api.getPlayerByName(realName);
                        if (player && player.uuid) {
                            playersToFetch.push(player.uuid);
                            playerMappings.set(player.uuid, { player, isNick: true });
                        }
                    });
                }

                // Add unnicked players (use usernames)
                const unnickedPlayers = usernames.filter(name => !nicks.includes(name));
                if (unnickedPlayers.length > 0) {
                    unnickedPlayers.forEach(name => {
                        const player = this.api.getPlayerByName(name);
                        if (player) {
                            playersToFetch.push(name);
                            playerMappings.set(name, { player, isNick: false });
                        }
                    });
                }

                // Use batch fetch methods
                if (playersToFetch.length > 0) {
                    Promise.all([
                        this.fetchMultiplePlayerTags(playersToFetch),
                        this.fetchMultiplePlayerStats(playersToFetch)
                    ]).then(([allTags, allStats]) => {
                        let playersWithTags = 0;
                        
                        for (const [playerIdentifier, results] of Object.entries(allTags)) {
                            const mapping = playerMappings.get(playerIdentifier);
                            
                            if (!mapping) continue;

                            const { player } = mapping;
                            const tags = results;
                            const stats = allStats[playerIdentifier];

                            // Update player data
                            if (player.uuid) {
                                this.updatePlayerTags(player.uuid, tags);
                                if (stats) {
                                    this.updatePlayerStats(player.uuid, stats);
                                }
                            }

                            // Show alerts for players with tags
                            if (tags && tags.length > 0) {
                                playersWithTags++;

                                let formattedTags = [];
                                tags.forEach(tag => {
                                    let color = getMinecraftColorByNumber(tag.color);
                                    if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                                    formattedTags.push({
                                        text: `${color}${tag.name}§r`,
                                        hoverEvent: tag.description ? {
                                            action: 'show_text',
                                            value: tag.description
                                        } : undefined
                                    });
                                });

                                if (this.api.config.get('ws_pl.alerts.enabled')) {
                                    // Chat message with hover for each tag
                                    const playerName = player.username || player.name || playerIdentifier;
                                    let message = {
                                        text: `${this.PLUGIN_PREFIX}§r ${playerName} has the following tags: `,
                                        extra: []
                                    };
                                    formattedTags.forEach((tagObj, idx) => {
                                        if (idx > 0) message.extra.push({ text: ' §7| §r' });
                                        message.extra.push(tagObj);
                                    });
                                    this.api.chat(message);
                                    if (this.api.config.get('ws_pl.alerts.audioAlerts.enabled')) {
                                        this.api.sound('note.pling');
                                    }
                                }
                            }
                        }

                        if (playersWithTags === 0 && this.api.config.get('ws_pl.alerts.enabled')) {
                            this.sendMessage('§7No players with tags found.');
                        }
                    }).catch(error => {
                        console.error('Error processing batch player data:', error);
                        this.sendMessage(`§cError processing player data: ${error.message}`);
                    });
                }
            }
        }
    }

    async onPluginRestored() {
        const apiKey = this.api.config.get('ws_pl.api.apikey');
        if (!apiKey || apiKey.trim() === '') {
            this.api.config.set('ws_pl.api.keyValid', false);
            this.sendMessage('§cNo API key set. Use /winstreak setkey <your-api-key> to set it.');
            return;
        }

        const isConnected = await this.testApiConnection();
        if (isConnected) {
            this.api.config.set('ws_pl.api.keyValid', true);
        } else {
            this.api.config.set('ws_pl.api.keyValid', false);
            this.sendMessage('§cCouldn\'t connect to Winstreak API. Check your key!');
        }
    }

    async testApiConnection() {

        const apiKey = this.api.config.get('ws_pl.api.apikey');
        const url = `${BASE_URL}v1/user?key=${encodeURIComponent(apiKey)}`;

        try {
            const response = await httpsGet(url);
            if (response && response.data) {
                return response.data.current_key === apiKey;
            }
            return false;
        } catch (error) {
            console.error('Error connecting to Winstreak API:', error);
            return false;
        }
    }

    async fetchPlayerTags(player) {
        const cacheKey = `tags:${player}`;
        const cached = await this.cache.getKey(cacheKey);
        if (cached) {
            return cached;
        }

        const apiKey = this.api.config.get('ws_pl.api.apikey');

        if (!apiKey || apiKey.trim() === '') {
            this.sendMessage('§cNo API key set. Use /winstreak setkey <your-api-key> to set it.');
            return null;
        }

        let url = `${BASE_URL}` + `v1/player/tags?player=${encodeURIComponent(player)}&key=${encodeURIComponent(apiKey)}&color=true`;

        // Add disabling tags
        const blacklistEnabled = this.api.config.get('ws_pl.tags.blacklist.enabled');
        const gapsEnabled = this.api.config.get('ws_pl.tags.gaps.enabled');
        const naccEnabled = this.api.config.get('ws_pl.tags.nacc.enabled');
        const pingEnabled = this.api.config.get('ws_pl.tags.ping.enabled');
        const radarEnabled = this.api.config.get('ws_pl.tags.radar.enabled');
        const rncEnabled = this.api.config.get('ws_pl.tags.rnc.enabled');
        const stataccEnabled = this.api.config.get('ws_pl.tags.statacc.enabled');

        if (!blacklistEnabled) url += '&blacklist=false';
        if (!gapsEnabled) url += '&gaps=false';
        if (!naccEnabled) url += '&nacc=false';
        if (!pingEnabled) url += '&ping=false';
        if (!radarEnabled) url += '&radar=false';
        if (!rncEnabled) url += '&rnc=false';
        if (!stataccEnabled) url += '&statacc=false';

        try {
            const response = await httpsGet(url);
            const tags = response.data.tags;
            // Cache for 30 minutes (1800000 ms)
            await this.cache.addKey(cacheKey, tags, 30 * 60 * 1000);
            return tags;
        } catch (error) {
            console.error(`Error fetching tags for player ${player}:`);
            return null;
        }
    }

    async fetchPlayerStats(player) {
        const cacheKey = `stats:${player}`;
        const cached = await this.cache.getKey(cacheKey);
        if (cached) {
            return cached;
        }

        const apiKey = this.api.config.get('ws_pl.api.apikey');

        if (!apiKey || apiKey.trim() === '') {
            return null;
        }

        let url = `${BASE_URL}v1/player/bedwars/tabstats?player=${encodeURIComponent(player)}&key=${encodeURIComponent(apiKey)}`;

        try {
            const response = await httpsGet(url);
            const stats = response.data;
            // Cache for 30 minutes (1800000 ms)
            await this.cache.addKey(cacheKey, stats, 30 * 60 * 1000);
            return stats;
        } catch (error) {
            console.error(`Error fetching stats for player ${player}:`);
            return null;
        }
    }

    async fetchMultiplePlayerTags(players) {
        const apiKey = this.api.config.get('ws_pl.api.apikey');

        if (!apiKey || apiKey.trim() === '') {
            console.error('No API key set for batch tags request');
            return {};
        }

        // Check cache first for all players
        const results = {};
        const playersToFetch = [];
        
        for (const player of players) {
            const cacheKey = `tags:${player}`;
            const cached = await this.cache.getKey(cacheKey);
            if (cached) {
                results[player] = cached;
            } else {
                playersToFetch.push(player);
            }
        }

        // If all players are cached, return early
        if (playersToFetch.length === 0) {
            return results;
        }

        // Prepare URL with query parameters for tag settings
        let url = `${BASE_URL}v1/player/tags?key=${encodeURIComponent(apiKey)}&color=true`;

        // Add disabling tags
        const blacklistEnabled = this.api.config.get('ws_pl.tags.blacklist.enabled');
        const gapsEnabled = this.api.config.get('ws_pl.tags.gaps.enabled');
        const naccEnabled = this.api.config.get('ws_pl.tags.nacc.enabled');
        const pingEnabled = this.api.config.get('ws_pl.tags.ping.enabled');
        const radarEnabled = this.api.config.get('ws_pl.tags.radar.enabled');
        const rncEnabled = this.api.config.get('ws_pl.tags.rnc.enabled');
        const stataccEnabled = this.api.config.get('ws_pl.tags.statacc.enabled');

        if (!blacklistEnabled) url += '&blacklist=false';
        if (!gapsEnabled) url += '&gaps=false';
        if (!naccEnabled) url += '&nacc=false';
        if (!pingEnabled) url += '&ping=false';
        if (!radarEnabled) url += '&radar=false';
        if (!rncEnabled) url += '&rnc=false';
        if (!stataccEnabled) url += '&statacc=false';

        try {
            console.log(`[Winstreak] Fetching tags for ${playersToFetch.length} players using batch API`);
            const response = await httpsPost(url, { players: playersToFetch });
            
            if (response.data && response.data.results) {
                // Cache results and merge with existing cached results
                for (const [player, playerData] of Object.entries(response.data.results)) {
                    if (playerData && playerData.tags) {
                        const cacheKey = `tags:${player}`;
                        await this.cache.addKey(cacheKey, playerData.tags, 30 * 60 * 1000);
                        results[player] = playerData.tags;
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error(`Error fetching batch tags:`, error);
            return results; // Return any cached results we had
        }
    }

    async fetchMultiplePlayerStats(players) {
        const apiKey = this.api.config.get('ws_pl.api.apikey');

        if (!apiKey || apiKey.trim() === '') {
            return {};
        }

        // Check cache first for all players
        const results = {};
        const playersToFetch = [];
        
        for (const player of players) {
            const cacheKey = `stats:${player}`;
            const cached = await this.cache.getKey(cacheKey);
            if (cached) {
                results[player] = cached;
            } else {
                playersToFetch.push(player);
            }
        }

        // If all players are cached, return early
        if (playersToFetch.length === 0) {
            return results;
        }

        let url = `${BASE_URL}v1/player/bedwars/tabstats?key=${encodeURIComponent(apiKey)}`;

        try {
            console.log(`[Winstreak] Fetching stats for ${playersToFetch.length} players using batch API`);
            const response = await httpsPost(url, { players: playersToFetch });
            
            if (response.data && response.data.results) {
                // Cache results and merge with existing cached results
                for (const [player, stats] of Object.entries(response.data.results)) {
                    if (stats) {
                        const cacheKey = `stats:${player}`;
                        await this.cache.addKey(cacheKey, stats, 30 * 60 * 1000);
                        results[player] = stats;
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error(`Error fetching batch stats:`, error);
            return results; // Return any cached results we had
        }
    }

    // Star color function from Hypixel Bedwars levels
    getStarColor(bwlvl) {
        let colorFormatted = `§7[*✫]`;

        if (bwlvl < 10) {
            colorFormatted = `§7[*✫]§7`;
        } else if (bwlvl < 100) {
            colorFormatted = `§7[**✫]§7`;
        } else if (bwlvl >= 100 && bwlvl < 200) {
            colorFormatted = `§f[***✫]§7`;
        } else if (bwlvl >= 200 && bwlvl < 300) {
            colorFormatted = `§6[***✫]§7`;
        } else if (bwlvl >= 300 && bwlvl < 400) {
            colorFormatted = `§b[***✫]§7`;
        } else if (bwlvl >= 400 && bwlvl < 500) {
            colorFormatted = `§2[***✫]§7`;
        } else if (bwlvl >= 500 && bwlvl < 600) {
            colorFormatted = `§3[***✫]§7`;
        } else if (bwlvl >= 600 && bwlvl < 700) {
            colorFormatted = `§4[***✫]§7`;
        } else if (bwlvl >= 700 && bwlvl < 800) {
            colorFormatted = `§d[***✫]§7`;
        } else if (bwlvl >= 800 && bwlvl < 900) {
            colorFormatted = `§9[***✫]§7`;
        } else if (bwlvl >= 900 && bwlvl < 1000) {
            colorFormatted = `§5[***✫]§7`;
        } else if (bwlvl >= 1000 && bwlvl < 1100) {
            colorFormatted = `§c[§6*§e*§a*§b*§d✫§5]§7`;
        } else if (bwlvl >= 1100 && bwlvl < 1200) {
            colorFormatted = `§7[§f****§7✪]§7`;
        } else if (bwlvl >= 1200 && bwlvl < 1300) {
            colorFormatted = `§7[§e****§6✪§7]§7`;
        } else if (bwlvl >= 1300 && bwlvl < 1400) {
            colorFormatted = `§7[§b****§3✪§7]§7`;
        } else if (bwlvl >= 1400 && bwlvl < 1500) {
            colorFormatted = `§7[§a****§2✪§7]§7`;
        } else if (bwlvl >= 1500 && bwlvl < 1600) {
            colorFormatted = `§7[§3****§9✪§7]§7`;
        } else if (bwlvl >= 1600 && bwlvl < 1700) {
            colorFormatted = `§7[§c****§4✪§7]§7`;
        } else if (bwlvl >= 1700 && bwlvl < 1800) {
            colorFormatted = `§7[§d****§5✪§7]§7`;
        } else if (bwlvl >= 1800 && bwlvl < 1900) {
            colorFormatted = `§7[§9****§1✪§7]§7`;
        } else if (bwlvl >= 1900 && bwlvl < 2000) {
            colorFormatted = `§7[§5****§8✪§7]§7`;
        } else if (bwlvl >= 2000 && bwlvl < 2100) {
            colorFormatted = `§8[§7*§f**§7*✪§8]§7`;
        } else if (bwlvl >= 2100 && bwlvl < 2200) {
            colorFormatted = `§f[*§e**§6*❀]§7`;
        } else if (bwlvl >= 2200 && bwlvl < 2300) {
            colorFormatted = `§6[*§f**§b*§3❀]§7`;
        } else if (bwlvl >= 2300 && bwlvl < 2400) {
            colorFormatted = `§5[*§d**§6*§e❀]§7`;
        } else if (bwlvl >= 2400 && bwlvl < 2500) {
            colorFormatted = `§b[*§f**§7*§8❀]§7`;
        } else if (bwlvl >= 2500 && bwlvl < 2600) {
            colorFormatted = `§f[*§a**§2*❀]§7`;
        } else if (bwlvl >= 2600 && bwlvl < 2700) {
            colorFormatted = `§4[*§c**§d*❀]§7`;
        } else if (bwlvl >= 2700 && bwlvl < 2800) {
            colorFormatted = `§e[*§f**§8*❀]§7`;
        } else if (bwlvl >= 2800 && bwlvl < 2900) {
            colorFormatted = `§a[*§2**§6*❀§e]§7`;
        } else if (bwlvl >= 2900 && bwlvl < 3000) {
            colorFormatted = `§b[*§3**§9*❀§1]§7`;
        } else if (bwlvl >= 3000 && bwlvl < 3100) {
            colorFormatted = `§e[*§6**§c*❀§4]§7`;
        } else if (bwlvl >= 3100 && bwlvl < 3200) {
            colorFormatted = `§9[*§3**§6✥§e]§7`;
        } else if (bwlvl >= 3200 && bwlvl < 3300) {
            colorFormatted = `§c[§4*§7**§4*§c✥]§7`;
        } else if (bwlvl >= 3300 && bwlvl < 3400) {
            colorFormatted = `§9[**§d*§c*✥§4]§7`;
        } else if (bwlvl >= 3400 && bwlvl < 3500) {
            colorFormatted = `§2[§a*§d**§5*✥§2]§7`;
        } else if (bwlvl >= 3500 && bwlvl < 3600) {
            colorFormatted = `§c[*§4**§2*§a✥]§7`;
        } else if (bwlvl >= 3600 && bwlvl < 3700) {
            colorFormatted = `§a[**§b*§9*✥§1]§7`;
        } else if (bwlvl >= 3700 && bwlvl < 3800) {
            colorFormatted = `§4[*§c**§b*§3✥]§7`;
        } else if (bwlvl >= 3800 && bwlvl < 3900) {
            colorFormatted = `§1[*§9*§5**§d✥§1]§7`;
        } else if (bwlvl >= 3900 && bwlvl < 4000) {
            colorFormatted = `§c[*§a**§3*§9✥]§7`;
        } else if (bwlvl >= 4000 && bwlvl < 4100) {
            colorFormatted = `§5[*§c**§6*✥§e]§7`;
        } else if (bwlvl >= 4100 && bwlvl < 4200) {
            colorFormatted = `§e[*§6*§c*§d*✥§5]§7`;
        } else if (bwlvl >= 4200 && bwlvl < 4300) {
            colorFormatted = `§1[§9*§3*§b*§f*§7✥]§7`;
        } else if (bwlvl >= 4300 && bwlvl < 4400) {
            colorFormatted = `§0[§5*§8**§5*✥§0]§7`;
        } else if (bwlvl >= 4400 && bwlvl < 4500) {
            colorFormatted = `§2[*§a*§e*§6*§5✥§d]§7`;
        } else if (bwlvl >= 4500 && bwlvl < 4600) {
            colorFormatted = `§f[*§b**§3*✥]§7`;
        } else if (bwlvl >= 4600 && bwlvl < 4700) {
            colorFormatted = `§3[§b*§e**§6*§d✥§5]§7`;
        } else if (bwlvl >= 4700 && bwlvl < 4800) {
            colorFormatted = `§f[§4*§c**§9*§1✥§9]§7`;
        } else if (bwlvl >= 4800 && bwlvl < 4900) {
            colorFormatted = `§5[*§c*§6*§e*§b✥§3]§7`;
        } else if (bwlvl >= 4900 && bwlvl < 5000) {
            colorFormatted = `§2[§a*§f**§a*✥§2]§7`;
        } else if (bwlvl >= 5000) {
            colorFormatted = `§4[*§5*§9**§1✥§0]§7`;
        }

        const bwlvlStr = bwlvl.toString();
        let bwlvlIndex = 0;
        colorFormatted = colorFormatted.replace(/\*/g, () => bwlvlStr[bwlvlIndex++] || '*');

        return colorFormatted;
    }

    // Advanced color functions for different stats
    getFkdrColor(fkdr) {
        if (fkdr >= 100) return `§5${fkdr.toFixed(2)}`;
        if (fkdr >= 50) return `§d${fkdr.toFixed(2)}`;
        if (fkdr >= 30) return `§4${fkdr.toFixed(2)}`;
        if (fkdr >= 20) return `§c${fkdr.toFixed(2)}`;
        if (fkdr >= 10) return `§6${fkdr.toFixed(2)}`;
        if (fkdr >= 7) return `§e${fkdr.toFixed(2)}`;
        if (fkdr >= 5) return `§2${fkdr.toFixed(2)}`;
        if (fkdr >= 3) return `§a${fkdr.toFixed(2)}`;
        if (fkdr >= 1) return `§f${fkdr.toFixed(2)}`;
        return `§7${fkdr.toFixed(2)}`;
    }

    getWlrColor(wlr) {
        if (wlr >= 30) return `§5${wlr.toFixed(2)}`;
        if (wlr >= 15) return `§d${wlr.toFixed(2)}`;
        if (wlr >= 9) return `§4${wlr.toFixed(2)}`;
        if (wlr >= 6) return `§c${wlr.toFixed(2)}`;
        if (wlr >= 3) return `§6${wlr.toFixed(2)}`;
        if (wlr >= 2.1) return `§e${wlr.toFixed(2)}`;
        if (wlr >= 1.5) return `§2${wlr.toFixed(2)}`;
        if (wlr >= 0.9) return `§a${wlr.toFixed(2)}`;
        if (wlr >= 0.3) return `§f${wlr.toFixed(2)}`;
        return `§7${wlr.toFixed(2)}`;
    }

    getWsColor(ws) {
        if (ws === "?") return `§a?`;
        if (typeof ws === "number") {
            if (ws >= 100) return `§4${ws}`;
            if (ws >= 75) return `§c${ws}`;
            if (ws >= 50) return `§e${ws}`;
            if (ws >= 25) return `§a${ws}`;
            return `§7${ws}`;
        }
        return `§7${ws}`;
    }

    getBblrColor(bblr) {
        if (bblr >= 5) return `§5${bblr.toFixed(2)}`;
        if (bblr >= 3) return `§d${bblr.toFixed(2)}`;
        if (bblr >= 2) return `§4${bblr.toFixed(2)}`;
        if (bblr >= 1.5) return `§c${bblr.toFixed(2)}`;
        if (bblr >= 1) return `§6${bblr.toFixed(2)}`;
        if (bblr >= 0.7) return `§e${bblr.toFixed(2)}`;
        if (bblr >= 0.5) return `§2${bblr.toFixed(2)}`;
        if (bblr >= 0.3) return `§a${bblr.toFixed(2)}`;
        if (bblr >= 0.1) return `§f${bblr.toFixed(2)}`;
        return `§7${bblr.toFixed(2)}`;
    }

    getKdrColor(kdr) {
        if (kdr >= 10) return `§5${kdr.toFixed(2)}`;
        if (kdr >= 7) return `§d${kdr.toFixed(2)}`;
        if (kdr >= 5) return `§4${kdr.toFixed(2)}`;
        if (kdr >= 3) return `§c${kdr.toFixed(2)}`;
        if (kdr >= 2) return `§6${kdr.toFixed(2)}`;
        if (kdr >= 1.5) return `§e${kdr.toFixed(2)}`;
        if (kdr >= 1) return `§2${kdr.toFixed(2)}`;
        if (kdr >= 0.7) return `§a${kdr.toFixed(2)}`;
        if (kdr >= 0.3) return `§f${kdr.toFixed(2)}`;
        return `§7${kdr.toFixed(2)}`;
    }

    formatStatsForTabList(stats) {
        if (!stats) return null;
        
        // Check if stats are globally enabled
        const statsEnabled = this.api.config.get('ws_pl.tablist_stats.enabled');
        if (!statsEnabled) return null;
        
        const statParts = [];
        
        // Check each stat based on config with reference formatting
        if (this.api.config.get('ws_pl.stats.level.enabled') && stats.level !== undefined && stats.level !== null) {
            const starFormatted = this.getStarColor(stats.level);
            statParts.push(`§7- ${starFormatted} `);
        }
        
        if (this.api.config.get('ws_pl.stats.fkdr.enabled') && stats.fkdr !== undefined && stats.fkdr !== null) {
            const fkdrFormatted = this.getFkdrColor(stats.fkdr);
            statParts.push(`§7- ${fkdrFormatted} §7fkdr `);
        }
        
        if (this.api.config.get('ws_pl.stats.wlr.enabled') && stats.wlr !== undefined && stats.wlr !== null) {
            const wlrFormatted = this.getWlrColor(stats.wlr);
            statParts.push(`§7- ${wlrFormatted} §7wlr `);
        }
        
        if (this.api.config.get('ws_pl.stats.bblr.enabled') && stats.bblr !== undefined && stats.bblr !== null) {
            const bblrFormatted = this.getBblrColor(stats.bblr);
            statParts.push(`§7- ${bblrFormatted} §7bblr `);
        }
        
        if (this.api.config.get('ws_pl.stats.winstreak.enabled') && stats.winstreak !== undefined && stats.winstreak !== null) {
            const wsFormatted = this.getWsColor(stats.winstreak);
            statParts.push(`§7- ${wsFormatted} §7ws `);
        }
        
        if (this.api.config.get('ws_pl.stats.finals.enabled') && stats.finals !== undefined && stats.finals !== null) {
            statParts.push(`§7- ${stats.finals.toLocaleString()} §7finals `);
        }
        
        if (this.api.config.get('ws_pl.stats.wins.enabled') && stats.wins !== undefined && stats.wins !== null) {
            statParts.push(`§7- ${stats.wins.toLocaleString()} §7wins `);
        }
        
        if (this.api.config.get('ws_pl.stats.kills.enabled') && stats.kills !== undefined && stats.kills !== null) {
            statParts.push(`§7- ${stats.kills.toLocaleString()} §7kills `);
        }
        
        if (this.api.config.get('ws_pl.stats.deaths.enabled') && stats.deaths !== undefined && stats.deaths !== null) {
            statParts.push(`§7- ${stats.deaths.toLocaleString()} §7deaths `);
        }
        
        if (this.api.config.get('ws_pl.stats.kdr.enabled') && stats.kdr !== undefined && stats.kdr !== null) {
            const kdrFormatted = this.getKdrColor(stats.kdr);
            statParts.push(`§7- ${kdrFormatted} §7kdr `);
        }
        
        if (this.api.config.get('ws_pl.stats.beds.enabled') && stats.beds !== undefined && stats.beds !== null) {
            statParts.push(`§7- ${stats.beds.toLocaleString()} §7beds `);
        }
        
        return statParts.length > 0 ? statParts.join('') : null;
    }

    updateTabListDisplay(uuid) {
        if (!uuid) return;
        
        const tagsEnabled = this.api.config.get('ws_pl.tablist.enabled');
        const statsEnabled = this.api.config.get('ws_pl.tablist_stats.enabled');
        const tags = this.taggedPlayers.get(uuid);
        const stats = this.playerStats.get(uuid);
        
        let suffix = '';
        
        // Create tags section if enabled and tags exist
        if (tagsEnabled && tags && tags.length > 0) {
            const customColors = this.api.config.get('ws_pl.customcolors.enabled');
            const tagText = tags.map(tag => {
                let color = getMinecraftColorByNumber(tag.color);
                if (!customColors) color = '§9';
                return `${color}${tag.name}`;
            }).join(' §7| §r');
            suffix += ' ' + tagText;
        }
        
        // Create stats section if enabled and stats exist
        if (statsEnabled && stats) {
            const statsText = this.formatStatsForTabList(stats);
            if (statsText) {
                suffix += ' ' + statsText;
            }
        }
        
        if (suffix) {
            this.api.appendDisplayNameSuffix(uuid, suffix);
        } else {
            this.api.clearDisplayNameSuffix(uuid);
        }
    }

    updatePlayerStats(uuid, stats) {
        if (stats) {
            this.playerStats.set(uuid, stats);
        } else {
            this.playerStats.delete(uuid);
        }
        this.updateTabListDisplay(uuid);
    }

    updatePlayerTags(uuid, tags) {
        if (tags && tags.length > 0) {
            this.taggedPlayers.set(uuid, tags);
        } else {
            this.taggedPlayers.delete(uuid);
        }
        this.updateTabListDisplay(uuid);
    }

    async onStatsConfigChanged() {
        // Clear all existing suffixes first
        if (this.playerStats && this.playerStats.size > 0) {
            for (const uuid of this.playerStats.keys()) {
                this.updateTabListDisplay(uuid);
            }
        }
        // Also update players with tags but no stats
        if (this.taggedPlayers && this.taggedPlayers.size > 0) {
            for (const uuid of this.taggedPlayers.keys()) {
                if (!this.playerStats.has(uuid)) {
                    this.updateTabListDisplay(uuid);
                }
            }
        }
    }

    async onConfigChanged() {
        if (this.cache) {
            await this.cache.clear();
        }

        // Clear all existing suffixes first
        if (this.taggedPlayers && this.taggedPlayers.size > 0) {
            for (const uuid of this.taggedPlayers.keys()) {
                this.api.clearDisplayNameSuffix(uuid);
            }
        }
        if (this.playerStats && this.playerStats.size > 0) {
            for (const uuid of this.playerStats.keys()) {
                this.api.clearDisplayNameSuffix(uuid);
            }
        }

        // Get all current players to check for new tags when enabling tag types
        const allCurrentPlayers = this.api.getPlayers ? this.api.getPlayers() : [];
        const playersToCheck = new Set();

        // Add previously tagged players
        if (this.taggedPlayers && this.taggedPlayers.size > 0) {
            for (const uuid of this.taggedPlayers.keys()) {
                playersToCheck.add(uuid);
            }
        }

        // Add players with stats
        if (this.playerStats && this.playerStats.size > 0) {
            for (const uuid of this.playerStats.keys()) {
                playersToCheck.add(uuid);
            }
        }

        // Add all current players (in case they now have tags due to re-enabled tag types)
        for (const player of allCurrentPlayers) {
            if (player.uuid) {
                playersToCheck.add(player.uuid);
            }
        }

        // Re-fetch tags and stats for all players with new settings
        const playersToFetch = [];
        const playerUuidMapping = new Map();

        for (const uuid of playersToCheck) {
            // Try to get player name from API if possible
            let player = this.api.getPlayerByUUID ? this.api.getPlayerByUUID(uuid) : null;
            if (!player) {
                // Try to find in current players list
                player = allCurrentPlayers.find(p => p.uuid === uuid);
            }
            let playerName = player ? player.username || player.name : uuid;
            
            playersToFetch.push(playerName);
            playerUuidMapping.set(playerName, uuid);
        }

        if (playersToFetch.length > 0) {
            try {
                const [allTags, allStats] = await Promise.all([
                    this.fetchMultiplePlayerTags(playersToFetch),
                    this.fetchMultiplePlayerStats(playersToFetch)
                ]);

                // Update player data
                for (const playerName of playersToFetch) {
                    const uuid = playerUuidMapping.get(playerName);
                    const tags = allTags[playerName];
                    const stats = allStats[playerName];
                    
                    this.updatePlayerTags(uuid, tags);
                    this.updatePlayerStats(uuid, stats);
                }
            } catch (error) {
                console.error('Error in batch re-fetch:', error);
                // Fallback to individual requests if batch fails
                for (const uuid of playersToCheck) {
                    let player = this.api.getPlayerByUUID ? this.api.getPlayerByUUID(uuid) : null;
                    if (!player) {
                        player = allCurrentPlayers.find(p => p.uuid === uuid);
                    }
                    let playerName = player ? player.username || player.name : uuid;

                    try {
                        const [tags, stats] = await Promise.all([
                            this.fetchPlayerTags(playerName),
                            this.fetchPlayerStats(playerName)
                        ]);
                        
                        this.updatePlayerTags(uuid, tags);
                        this.updatePlayerStats(uuid, stats);
                    } catch (err) {
                        console.error(`Error fetching data for ${playerName}:`, err);
                    }
                }
            }
        }
    }

}

class WinstreakCache {

    constructor(WinstreakwsPlugin) {
        this.ws = WinstreakwsPlugin;
        this.cache = new Map();
        this.expireInterval = setInterval(() => this.expireKeys(), 60000);
    }

    async addKey(key, value, ttl) {
        const expiresAt = Date.now() + ttl;
        this.cache.set(key, { value, expiresAt });
    }

    async expireKeys() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
    }

    async getKey(key) {
        const entry = this.cache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.value;
        }
        return null;
    }

    async clear() {
        this.cache.clear();
    }

    async removeKey(key) {
        this.cache.delete(key);
    }

    async hasKey(key) {
        const entry = this.cache.get(key);
        return !!entry && entry.expiresAt > Date.now();
    }

    async getAllKeys() {
        const now = Date.now();
        return Array.from(this.cache.entries())
            .filter(([key, entry]) => entry.expiresAt > now)
            .map(([key]) => key);
    }

}

function getMinecraftColorByNumber(num) {
    // Map of decimal RGB to Minecraft color codes
    const colorMap = [
        { code: '§0', rgb: [0, 0, 0] },         // black
        { code: '§1', rgb: [0, 0, 170] },       // dark_blue
        { code: '§2', rgb: [0, 170, 0] },       // dark_green
        { code: '§3', rgb: [0, 170, 170] },     // dark_aqua
        { code: '§4', rgb: [170, 0, 0] },       // dark_red
        { code: '§5', rgb: [170, 0, 170] },     // dark_purple
        { code: '§6', rgb: [255, 170, 0] },     // gold
        { code: '§7', rgb: [170, 170, 170] },   // gray
        { code: '§8', rgb: [85, 85, 85] },      // dark_gray
        { code: '§9', rgb: [85, 85, 255] },     // blue
        { code: '§a', rgb: [85, 255, 85] },     // green
        { code: '§b', rgb: [85, 255, 255] },    // aqua
        { code: '§c', rgb: [255, 85, 85] },     // red
        { code: '§d', rgb: [255, 85, 255] },    // pink
        { code: '§e', rgb: [255, 255, 85] },    // yellow
        { code: '§f', rgb: [255, 255, 255] },   // white
    ];

    // If num is a hex color (e.g. 0xFFAA00 or "#FFAA00"), convert to decimal RGB
    let r, g, b;
    if (typeof num === 'string' && num.startsWith('#')) {
        num = parseInt(num.slice(1), 16);
    }
    if (typeof num === 'number') {
        r = (num >> 16) & 0xFF;
        g = (num >> 8) & 0xFF;
        b = num & 0xFF;
    } else {
        return '§f'; // fallback to white
    }

    // Find the closest color by Euclidean distance
    let minDist = Infinity;
    let closestCode = '§f';
    for (const entry of colorMap) {
        const dr = r - entry.rgb[0];
        const dg = g - entry.rgb[1];
        const db = b - entry.rgb[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
            minDist = dist;
            closestCode = entry.code;
        }
    }
    return closestCode;
}