function stripColorCodes(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/§./g, '');
}

class MiscHandler {
    constructor(gameState) {
        this.gameState = gameState;
    }

    handleTeam(data) {
        const team = data.team || data.name;
        
        if (!team) return;

        const { mode } = data;
        
        switch (mode) {
            case 0:
                this.gameState.teams.set(team, {
                    name: team,
                    displayName: data.displayName || team,
                    prefix: data.prefix || '',
                    suffix: data.suffix || '',
                    color: data.color || -1,
                    players: new Set((data.players || []).map(p => stripColorCodes(p)))
                });
                break;
            case 2:
                const existingTeam = this.gameState.teams.get(team);
                if (existingTeam) {
                    const updatedTeam = {
                        name: team,
                        displayName: data.displayName !== undefined ? data.displayName : existingTeam.displayName,
                        prefix: data.prefix !== undefined ? data.prefix : existingTeam.prefix,
                        suffix: data.suffix !== undefined ? data.suffix : existingTeam.suffix,
                        color: data.color !== undefined ? data.color : existingTeam.color,
                        players: data.players ? new Set(data.players.map(p => stripColorCodes(p))) : existingTeam.players
                    };
                    this.gameState.teams.set(team, updatedTeam);
                } else {
                    this.gameState.teams.set(team, {
                        name: team,
                        displayName: data.displayName || team,
                        prefix: data.prefix || '',
                        suffix: data.suffix || '',
                        color: data.color || -1,
                        players: new Set((data.players || []).map(p => stripColorCodes(p)))
                    });
                }
                break;
            case 1:
                this.gameState.teams.delete(team);
                break;
            case 3:
                let t = this.gameState.teams.get(team);
                if (!t) {
                    t = {
                        name: team,
                        displayName: team,
                        prefix: '',
                        suffix: '',
                        color: -1,
                        players: new Set()
                    };
                    this.gameState.teams.set(team, t);
                }
                if (data.players) {
                    data.players.forEach(p => {
                        const playerName = stripColorCodes(p);
                        
                        for (const [otherTeamName, otherTeam] of this.gameState.teams) {
                            if (otherTeamName !== team && otherTeam.players.has(playerName)) {
                                otherTeam.players.delete(playerName);
                            }
                        }
                        
                        t.players.add(playerName);
                    });
                }
                break;
            case 4:
                let tm = this.gameState.teams.get(team);
                if (tm && data.players) {
                    data.players.forEach(p => tm.players.delete(stripColorCodes(p)));
                }
                break;
        }
    }

    handleScoreboard(data) {
        const { name, action } = data;
        
        switch (action) {
            case 0:
            case 2:
                this.gameState.scoreboards.set(name, {
                    displayName: data.displayText,
                    type: data.type || 'integer',
                    scores: new Map()
                });
                break;
            case 1:
                this.gameState.scoreboards.delete(name);
                break;
        }
    }

    handleScore(data) {
        const { scoreName, action, objective, value } = data;
        
        if (action === 1) {
            this.gameState.scoreboards.forEach(scoreboard => {
                scoreboard.scores.delete(scoreName);
            });
        } else {
            const scoreboard = this.gameState.scoreboards.get(objective);
            if (scoreboard) {
                scoreboard.scores.set(scoreName, value);
            }
        }
    }
}

module.exports = MiscHandler;
