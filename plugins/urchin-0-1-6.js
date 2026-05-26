// Urchin Integration Plugin
// Provides automatic tag checking, blacklisting, and client tag display

const https = require('https');

module.exports = (api) => {
    api.metadata({
        name: 'urchin',
        displayName: 'Urchin Blacklist Integration',
        prefix: '§5BL',
        version: '0.1.6',
        author: 'Hexze',
        minVersion: '0.1.7',
        description: 'Integration with Urchin API for automatic blacklisting and client tags',
        dependencies: [
            { name: 'denicker', minVersion: '1.1.0' }
        ]
    });

    const urchin = new UrchinPlugin(api);
    
    const configSchema = [
        {
            label: 'API Key',
            description: 'Configure your Urchin API key',
            defaults: {
                api: { 
                    apiKey: ''
                }
            },
            settings: [
                {
                    type: 'text',
                    key: 'api.apiKey',
                    description: 'Your Urchin API key.',
                    placeholder: 'Enter your Urchin API key'
                }
            ]
        },
        {
            label: 'Alerts',
            description: 'Configure the plugin\'s chat alerts.',
            defaults: { 
                alerts: { 
                    enabled: true, 
                    audioAlerts: { enabled: true }
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'alerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable all chat alerts.'
                },
                {
                    type: 'soundToggle',
                    key: 'alerts.audioAlerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Play a sound when a tagged player is found.'
                }
            ]
        },
        {
            label: 'Party Chat',
            description: 'Configure party chat tag alerts.',
            defaults: { 
                partyChat: { 
                    enabled: true,
                    delay: 500
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'partyChat.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Send tag alerts to party chat.'
                },
                {
                    type: 'cycle',
                    key: 'partyChat.delay',
                    description: 'Delay between party chat messages.',
                    displayLabel: 'Delay',
                    values: [
                        { text: '250ms', value: 250 },
                        { text: '500ms', value: 500 },
                        { text: '1000ms', value: 1000 },
                        { text: '1500ms', value: 1500 }
                    ],
                    condition: (cfg) => cfg.partyChat.enabled
                }
            ]
        },
        {
            label: 'Label Tags in Tab',
            description: 'Enable or disable tab suffixes for tagged players.',
            defaults: { modifyDisplayNames: { enabled: true } },
            settings: [
                {
                    type: 'toggle',
                    key: 'modifyDisplayNames.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Adds a label to tagged players in tab to indicate their tags.',
                    onChange: (enabled) => {
                        if (enabled) {
                            for (const [uuid, data] of urchin.taggedDisplayNames) {
                                const tagIcon = urchin.getTagIcon(data.tag.type);
                                const tagColor = urchin.getTagColor(data.tag.type);
                                const tagSuffix = ` §8[§${tagColor}${tagIcon}§8]§r`;
                                urchin.api.appendDisplayNameSuffix(uuid, tagSuffix);
                            }
                        } else {
                            urchin._clearDisplayNames();
                        }
                    }
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);
    api.configSchema(configSchema);

    api.commands((registry) => {
        registry.command('v')
            .description('Check Urchin tags for specific users')
            .argument('<usernames>', 'Usernames to check (space separated)')
            .handler((ctx) => urchin.handleVCommand(ctx.args.usernames));
        
        registry.command('tag')
            .description('Add a tag to a player')
            .argument('<player>', 'Player to tag')
            .argument('<tagtype>', 'Type of tag')
            .argument('<reason>', { type: 'greedy', description: 'Reason for tag (can be multiple words)' })
            .handler((ctx) => {
                urchin.handleTagCommand(ctx.args.player, ctx.args.tagtype, ctx.args.reason, false);
            });
        
        registry.command('forcetag')
            .description('Force add a tag to a player (overwrite existing)')
            .argument('<player>', 'Player to tag')
            .argument('<tagtype>', 'Type of tag')
            .argument('<reason>', { type: 'greedy', description: 'Reason for tag (can be multiple words)' })
            .handler((ctx) => {
                urchin.handleTagCommand(ctx.args.player, ctx.args.tagtype, ctx.args.reason, true);
            });
        
        registry.command('setkey')
            .description('Set your Urchin API key')
            .argument('<apikey>', 'Your Urchin API key')
            .handler((ctx) => urchin.handleSetKeyCommand(ctx.args.apikey));
        
        registry.command('testapi')
            .description('Test your Urchin API connection')
            .handler(() => urchin.handleTestApiCommand());
    });
    
    urchin.registerHandlers();
    return urchin;
};

class UrchinPlugin {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.taggedDisplayNames = new Map();
        this.partyChatQueue = [];
        this.partyChatProcessing = false;
        
        this.VALID_TAG_TYPES = [
            'info', 'caution', 'closet_cheater', 'confirmed_cheater', 
            'blatant_cheater', 'sniper', 'legit_sniper', 'account'
        ];
        this.EXCLUDED_TAG_TYPES = ['info', 'account'];
    }

    registerHandlers() {
        this.api.on('chat', this.onChat.bind(this));
        this.api.on('respawn', this.onRespawn.bind(this));
        this.api.on('plugin_restored', this.onPluginRestored.bind(this));
    }

    onRespawn(event) {
        this.taggedDisplayNames.clear();
        this.partyChatQueue = [];
        this.api.clearAllDisplayNames();
    }

    onPluginRestored(event) {
        if (event.pluginName === 'urchin') {
            this.taggedDisplayNames.clear();
            this.partyChatQueue = [];
            this.api.clearAllDisplayNames();
        }
    }

    onChat(event) {
        if (!this.api.config.get('alerts.enabled')) return;

        if (event.position === 2) return;

        const cleanText = this.stripColorCodes(event.message);
        
        if (cleanText.startsWith('ONLINE:')) {
            const usernames = cleanText
                .replace('ONLINE:', '')
                .split(',')
                .map(name => name.trim())
                .filter(name => name.length > 0);
            
            const denickerPlugin = this.api.getPluginInstance('denicker');
            const finalNamesToCheck = [];
            const realNameToNick = new Map();

            if (denickerPlugin) {
                for (const username of usernames) {
                    const realName = denickerPlugin.getRealName(username);
                    if (realName) {
                        finalNamesToCheck.push(realName);
                        realNameToNick.set(realName, username);
                        this.api.debugLog(`Urchin: Found resolved nick ${username} -> ${realName}`);
                    } else {
                        finalNamesToCheck.push(username);
                    }
                }
            } else {
                finalNamesToCheck.push(...usernames);
            }
            
            this.processUsernames(finalNamesToCheck, false, realNameToNick);
        }
    }

    handleVCommand(args) {
        if (!this.api.config.get('alerts.enabled')) {
            this.sendErrorMessage('Urchin tag checking is disabled');
            return;
        }

        if (!args || args.trim() === '') {
            this.sendUsageMessage();
            return;
        }
        
        const usernames = args.split(' ').filter(Boolean);

        const denickerPlugin = this.api.getPluginInstance('denicker');
        const finalNamesToCheck = [];
        const realNameToNick = new Map();

        if (denickerPlugin) {
            for (const username of usernames) {
                const realName = denickerPlugin.getRealName(username);
                if (realName) {
                    finalNamesToCheck.push(realName);
                    realNameToNick.set(realName, username);
                    this.api.debugLog(`Urchin: Found resolved nick ${username} -> ${realName}`);
                } else {
                    finalNamesToCheck.push(username);
                }
            }
        } else {
            finalNamesToCheck.push(...usernames);
        }

        this.processUsernames(finalNamesToCheck, true, realNameToNick);
    }

    processUsernames(usernames, infoOnly = false, realNameToNick = new Map()) {
        if (usernames.length === 0) return;

        this.batchCheckUrchinTags(usernames).then(response => {
            this.displayTagResults(response, usernames, { infoOnly, realNameToNick });
        }).catch(err => {
            if (err.message === "Invalid API Key" || err.message === "Missing API Key") {
                this.sendErrorMessage('Invalid or missing API key - use "/urchin setkey <key>" to update it. Get your API key from https://discord.gg/urchin');
                this.api.config.set('alerts.enabled', false);
            } else {
                this.sendErrorMessage(`Error checking tags: ${err.message}`);
            }
        });
    }

    displayTagResults(response, usernames, options = {}) {
        const { infoOnly = false, realNameToNick = new Map() } = options;
        let hasAnyTags = false;
        
        for (const queryName in response.players) {
            const tags = response.players[queryName];
            const nickName = realNameToNick.get(queryName);

            const displayUserName = nickName || queryName;
            const displayRealName = nickName ? queryName : null;

            if (tags && tags.length > 0) {
                hasAnyTags = true;
                this.displayTagMessage(displayUserName, tags, infoOnly, displayRealName);

                if (!infoOnly) {
                    const priorityTag = this.getHighestPriorityTag(tags);
                    this.updatePlayerDisplayName(displayUserName, priorityTag, displayRealName);

                    // Check if tag should be sent to party chat
                    if (this.shouldSendToPartyChat(priorityTag)) {
                        const partyName = displayRealName ? `${displayUserName} (${displayRealName})` : displayUserName;
                        this.queuePartyMessage(`${partyName} [${this.getTagIcon(priorityTag.type)}] ${priorityTag.reason}`);
                    }
                }
            }
        }

        if (hasAnyTags && !infoOnly && this.api.config.get('alerts.audioAlerts.enabled')) {
            this.api.sound('note.pling');
        }

        const action = infoOnly ? 'Checked' : 'Found';
        this.sendInfoMessage(`${action} ${usernames.length} player${usernames.length === 1 ? '' : 's'} - ${hasAnyTags ? 'Found tags!' : 'No tags found'}`);
    }

    shouldSendToPartyChat(tag) {
        if (!this.api.config.get('partyChat.enabled')) {
            return false;
        }
        if (this.EXCLUDED_TAG_TYPES.includes(tag.type)) {
            return false;
        }
        return !(tag.reason && tag.reason.length > 100);

    }

    queuePartyMessage(message) {
        this.partyChatQueue.push(message);
        
        if (!this.partyChatProcessing) {
            this.processPartyChatQueue();
        }
    }

    async processPartyChatQueue() {
        if (this.partyChatQueue.length === 0) {
            this.partyChatProcessing = false;
            return;
        }
        
        this.partyChatProcessing = true;
        
        const message = this.partyChatQueue.shift();
        const delay = this.api.config.get('partyChat.delay') || 500;
        
        this.api.sendChatToServer(`/pc ${message}`);
        
        setTimeout(() => {
            this.processPartyChatQueue();
        }, delay);
    }

    handleSetKeyCommand(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            this.sendErrorMessage('Usage: /urchin setkey <your-api-key>');
            return;
        }
        
        this.api.config.set('api.apiKey', apiKey.trim());
        this.api.config.set('alerts.enabled', true);
        this.sendSuccessMessage('API key has been set successfully!');
        this.sendInfoMessage('You can test the connection with /urchin testapi');
    }

    handleTestApiCommand() {
        this.sendInfoMessage('Testing API connection...');

        this.batchCheckUrchinTags([])
            .then(() => {
                this.sendSuccessMessage('API key is valid and working!');
            })
            .catch(e => {
                if (e.message === "Invalid API Key" || e.message === "Missing API Key") {
                    this.sendErrorMessage('Invalid or missing API key - use "/urchin setkey <key>" to update it');
                    this.api.config.set('alerts.enabled', false);
                } else {
                    this.sendErrorMessage('API test failed: ' + e.message);
                }
            });
    }

    handleTagCommand(player, tagType, reason, isForce) {
        if (!this.api.config.get('alerts.enabled')) {
            this.sendErrorMessage('Urchin tag checking is disabled');
            return;
        }

        if (!player || !tagType || !reason) {
            this.sendErrorMessage(`Usage: /${isForce ? 'forcetag' : 'tag'} <player> <tagtype> <reason>`);
            this.sendErrorMessage(`Valid tag types: ${this.VALID_TAG_TYPES.join(', ')}`);
            return;
        }

        const normalizedTagType = this.expandTagType(tagType);
        
        if (!this.VALID_TAG_TYPES.includes(normalizedTagType)) {
            this.sendErrorMessage(`Invalid tag type. Valid options: ${this.VALID_TAG_TYPES.join(', ')}`);
            this.sendErrorMessage(`Short forms: I, C, CC, BC, CCC, A, S, LS`);
            return;
        }
        
        const reasonText = Array.isArray(reason) ? reason.join(' ') : reason;
        
        this.sendInfoMessage(`Processing tag for ${player}...`);
        
        this.addTagToPlayer(player, normalizedTagType, reasonText, false, isForce);
    }

    async addTagToPlayer(player, tagType, reason, hideUsername, overwrite) {
        try {
            const uuid = await this.usernameToUUID(player);
            const response = await this.addTag(uuid, tagType, reason, hideUsername, overwrite);

            if (response.statusCode === 200) {
                this.sendSuccessMessage(`Successfully added ${this.formatTagType(tagType)} tag to ${player}`);
            } else if (response.statusCode === 422) {
                this.sendErrorMessage('Tag already exists. Use /forcetag to overwrite.');
            } else if (response.statusCode === 409) {
                this.handleTagConflict(response.data, player);
            } else {
                this.sendErrorMessage(`Error: ${response.statusCode} - ${response.data || 'Unknown error'}`);
            }
        } catch (error) {
            this.sendErrorMessage(`Error: ${error.message}`);
        }
    }

    handleTagConflict(responseData, player) {
        try {
            const errorData = JSON.parse(responseData);
            if (errorData.detail && errorData.detail.current_tags) {
                const existingTag = errorData.detail.current_tags[0];
                const tagType = existingTag.tag_type;
                const reason = existingTag.reason;
                const addedOn = new Date(existingTag.added_on);
                const dateString = addedOn.toLocaleDateString() + ' ' + addedOn.toLocaleTimeString();

                this.sendErrorMessage(`${player} already has a ${this.formatTagType(tagType)} tag:`);
                this.sendInfoMessage(`Reason: ${reason}`);
                this.sendInfoMessage(`Added: ${dateString}`);
                this.sendInfoMessage('Use /forcetag to overwrite.');
            } else {
                this.sendErrorMessage('User already has a tag. Use /forcetag to overwrite.');
            }
        } catch (error) {
            this.sendErrorMessage('User already has a tag. Use /forcetag to overwrite.');
        }
    }

    updatePlayerDisplayName(username, tag, realName = null) {
        if (!this.api.config.get('modifyDisplayNames.enabled')) return;

        const player = this.api.getPlayerByName(username);
        if (!player) {
            this.api.debugLog(`Urchin: Could not find player for username: ${username}`);
            return;
        }

        const tagIcon = this.getTagIcon(tag.type);
        const tagColor = this.getTagColor(tag.type);
        const tagSuffix = ` §8[§${tagColor}${tagIcon}§8]§r`;

        this.taggedDisplayNames.set(player.uuid, { username: player.name, tag, realName });
        this.api.appendDisplayNameSuffix(player.uuid, tagSuffix);
    }

    _clearDisplayNames() {
        for (const [uuid] of this.taggedDisplayNames) {
            this.api.clearDisplayNameSuffix(uuid);
        }
        this.api.debugLog('Urchin: Cleared all tag display names');
    }

    getHighestPriorityTag(tags) {
        const hasNonAccountTags = tags.some(tag => tag.type !== 'account');
        if (hasNonAccountTags) {
            const nonAccountTags = tags.filter(tag => tag.type !== 'account');
            return nonAccountTags[0];
        }

        return tags[0];
    }

    displayTagMessage(username, tags, infoOnly = false, realName = null) {
        let teamFormattedName = username;
        if (!infoOnly) {
            const player = this.api.getPlayerByName(username);
            const team = player ? this.api.getPlayerTeam(player.name) : null;
            const prefix = team?.prefix || '';
            const suffix = team?.suffix || '';
            if (realName) {
                teamFormattedName = `${prefix}${username} §c(${realName})§r${suffix}`;
            } else {
                teamFormattedName = prefix + username + suffix;
            }
        } else if (realName) {
            teamFormattedName = `${username} §c(${realName})§r`;
        }

        const hoverText = [
            { text: `§5Urchin Blacklist Tags\n` },
            { text: `§7§m-------------------------------------§r\n` }
        ];

        tags.forEach((tag, index) => {
            const timeAgo = this.getTimeAgo(tag.added_on);
            const tagType = this.formatTagType(tag.type);
            const tagColor = this.getTagColor(tag.type);
            const tagIcon = this.getTagIcon(tag.type);

            hoverText.push({ text: `§${tagColor}${tagType} [${tagIcon}]\n` });
            hoverText.push({ text: `§9"${tag.reason}"\n` });
            hoverText.push({ text: `§7- Added ${timeAgo}\n` });

            if (index < tags.length - 1) {
                hoverText.push({ text: `\n` });
            }
        });

        hoverText.push({ text: `\n§8Click to paste info in chat` });

        const tagComponents = [];
        tags.forEach((tag, index) => {
            const tagIcon = this.getTagIcon(tag.type);
            const tagColor = this.getTagColor(tag.type);
            const timeAgo = this.getTimeAgo(tag.added_on);
            const tagType = this.formatTagType(tag.type);

            tagComponents.push({
                text: `${index === 0 ? ' ' : ''}§8[§${tagColor}${tagIcon}§8]§r`,
                hoverEvent: {
                    action: "show_text",
                    value: { text: "", extra: hoverText }
                },
                clickEvent: {
                    action: "suggest_command",
                    value: `⚠ ${realName ? `${username} (${realName})` : username} [${tagType}] | "${tag.reason}" - Added ${timeAgo}`
                }
            });
        });

        const message = {
            text: `${this.PLUGIN_PREFIX} `,
            extra: [
                {
                    text: teamFormattedName,
                    color: "white",
                    clickEvent: {
                        action: "suggest_command",
                        value: realName ? `${username} (${realName})` : username
                    },
                    hoverEvent: {
                        action: "show_text",
                        value: { text: "§8Click to put names in chat" }
                    }
                },
                ...tagComponents
            ]
        };

        this.api.chat(message);
    }

    async batchCheckUrchinTags(usernames) {
        const apiKey = this.api.config.get('api.apiKey');
        if (!apiKey) {
            throw new Error("Missing API Key");
        }
        const sources = 'MANUAL';

        return new Promise((resolve, reject) => {
            const requestBody = { usernames: usernames };
            const jsonBody = JSON.stringify(requestBody);

            const path = `/player?key=${apiKey}&sources=${sources}`;

            const options = {
                hostname: 'urchin.ws',
                path: path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(jsonBody)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (data === "Invalid Key") {
                        reject(new Error("Invalid API Key"));
                        return;
                    }
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.write(jsonBody);
            req.end();
        });
    }

    async usernameToUUID(username) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.mojang.com',
                path: `/users/profiles/minecraft/${encodeURIComponent(username)}`,
                method: 'GET'
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const response = JSON.parse(data);
                            if (response && response.id) {
                                resolve(response.id);
                            } else {
                                reject(new Error('Invalid response from Mojang API'));
                            }
                        } catch (error) {
                            reject(new Error(`Failed to parse response: ${error.message}`));
                        }
                    } else if (res.statusCode === 204 || res.statusCode === 404) {
                        reject(new Error(`Player not found: ${username}`));
                    } else {
                        reject(new Error(`Mojang API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.end();
        });
    }

    async addTag(uuid, tagType, reason, hideUsername, overwrite) {
        const apiKey = this.api.config.get('api.apiKey');

        if (!apiKey) {
            throw new Error("Missing API Key");
        }

        return new Promise((resolve, reject) => {
            const requestBody = {
                uuid: uuid,
                tag_type: tagType.toLowerCase(),
                reason: reason,
                hide_username: hideUsername,
                overwrite: overwrite
            };
            
            const jsonBody = JSON.stringify(requestBody);
            
            const options = {
                hostname: 'urchin.ws',
                path: `/admin/add-tag?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(jsonBody)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        data: data
                    });
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });
            
            req.write(jsonBody);
            req.end();
        });
    }


    stripColorCodes(text) {
        return text.replace(/§[0-9a-fk-or]/g, '');
    }


    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
        
        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
        
        const diffInYears = Math.floor(diffInMonths / 12);
        return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
    }

    formatTagType(type) {
        return type.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getTagIcon(type) {
        switch (type) {
            case 'info':
                return 'I';
            case 'caution':
                return 'C';
            case 'closet_cheater':
                return 'CC';
            case 'blatant_cheater':
                return 'BC';
            case 'confirmed_cheater':
                return 'CCC';
            case 'account':
                return 'A';
            case 'sniper':
                return 'S';
            case 'legit_sniper':
                return 'LS';
            default:
                return '?';
        }
    }

    expandTagType(shortForm) {
        const shortFormMap = {
            'i': 'info',
            'c': 'caution',
            'cc': 'closet_cheater',
            'bc': 'blatant_cheater',
            'ccc': 'confirmed_cheater',
            'a': 'account',
            's': 'sniper',
            'ls': 'legit_sniper'
        };
        
        const normalized = shortForm.toLowerCase();
        return shortFormMap[normalized] || normalized;
    }

    getTagColor(type) {
        switch (type) {
            case 'info':
                return '7'; // light_gray
            case 'closet_cheater':
                return '6'; // gold
            case 'blatant_cheater':
                return '6'; // gold
            case 'account':
                return '6'; // gold
            case 'caution':
                return '6'; // gold
            case 'confirmed_cheater':
                return '5'; // dark_purple
            case 'sniper':
                return '4'; // dark_red
            case 'legit_sniper':
                return 'c'; // red
            default:
                return 'f'; // white
        }
    }

    sendErrorMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §c${message}`);
    }

    sendSuccessMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §a${message}`);
    }

    sendInfoMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §e${message}`);
    }

    sendUsageMessage() {
        this.api.chat(`${this.PLUGIN_PREFIX} §eUsage: /v <username>`);
    }
}