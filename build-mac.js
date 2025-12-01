const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building executable...');

try {
    execSync('pkg --version', { stdio: 'ignore' });
} catch (err) {
    console.log('Installing pkg...');
    try {
        execSync('npm install -g pkg', { stdio: 'inherit' });
    } catch (installErr) {
        console.error('Failed to install pkg. Please run: npm install -g pkg');
        process.exit(1);
    }
}

const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
}

const pluginsSource = path.join(__dirname, 'plugins');
const pluginsDest = path.join(buildDir, 'plugins');

if (fs.existsSync(pluginsSource)) {
    if (fs.existsSync(pluginsDest)) {
        fs.rmSync(pluginsDest, { recursive: true, force: true });
    }
    fs.cpSync(pluginsSource, pluginsDest, { recursive: true });
}

try {
    execSync('pkg src/proxy.js --target node18-macos-x64,node18-macos-arm64 --output build/starfish-proxy', { stdio: 'inherit' });
    console.log('Build completed: build/starfish-proxy');
} catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
}