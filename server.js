const cookieParser = require('cookie-parser');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const ADMIN_PASS = 'LGSI12@soft34';
const COOKIE_NAME = 'admin_token';

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '.')));

// In-memory store: { "branchName": { apps: [], issues: [] } }
let branchStore = {};

// Persistence Helpers
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            branchStore = JSON.parse(raw);
            console.log('Data loaded from disk.');
        } catch (err) {
            console.error('Failed to load data:', err);
            branchStore = {};
        }
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(branchStore, null, 2));
    } catch (err) {
        console.error('Failed to save data:', err);
    }
}

// Load initially
loadData();

// Middleware: Check Auth
function checkAuth(req, res, next) {
    if (req.cookies[COOKIE_NAME] === 'true') {
        next();
    } else {
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ error: 'Unauthorized' });
        } else {
            res.sendFile(path.join(__dirname, 'login.html'));
        }
    }
}

function generateReleaseNote(branchName) {
    const data = branchStore[branchName];
    if (!data || data.apps.length === 0) return '';

    const header = ':Release Notes:\nhorizontal deployment for multiple applications';
    const testPerformed = ':test performed:\nnpm test -pass';
    const detailedNotesHeader = ':Detailed notes:';

    // Detailed Notes Section
    const detailedContent = data.apps.map(app => {
        return [
            `com.webos.app.${app.name}`,
            app.submissionId,
            app.gitlog
        ].join('\n');
    }).join('\n\n');

    // Issues Section
    const uniqueIssues = [...new Set(data.issues)];
    // logic: last issue gets the branch footer
    // If no issues, we still might need the footer if that's the standard. 
    // Assuming if issues exist:

    let issuesContent = '';

    if (uniqueIssues.length > 0) {
        // Prepare list
        const appNamesBracket = data.apps.length > 1
            ? `{${data.apps.map(a => a.name).join(',')}}`
            : data.apps[0].name;

        issuesContent = uniqueIssues.map((issue, index) => {
            // In the multi-app scenario, we put the footer on the very last issue of the merged list?
            // Or does every issue get a line? 
            // Request said: if branch name is same then messages merge. 
            // "issues" section in request example:
            // :issues:
            // [issues 2]
            // [TVPLAT-12345]
            // [DITTEST-1234] [branch] com.webos.app.{app1,app2}

            // So, simple list, and the LAST item gets the suffix.

            if (index === uniqueIssues.length - 1) {
                return `[${issue}] [${branchName}] com.webos.app.${appNamesBracket}`;
            }
            return `[${issue}]`;
        }).join('\n');
    }

    return [
        header,
        '',
        detailedNotesHeader,
        detailedContent,
        '',
        testPerformed,
        '',
        ':issues:',
        issuesContent
    ].join('\n');
}

// API: Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        res.cookie(COOKIE_NAME, 'true', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// API: Get formatted notes for a branch (Public)
app.get('/api/notes/:branch', (req, res) => {
    const branch = req.params.branch.toLowerCase();
    const note = generateReleaseNote(branch);
    res.json({ note, data: branchStore[branch] || null });
});

// API: Submit a new entry (Public)
app.post('/api/submit', (req, res) => {
    const { appName, submissionId, gitlog, issues, branch: rawBranch, tagHashId } = req.body;
    const branch = rawBranch ? rawBranch.toLowerCase() : '';

    if (!branch || !appName) {
        return res.status(400).json({ error: 'Branch and App Name are required' });
    }

    if (!branchStore[branch]) {
        branchStore[branch] = { apps: [], issues: [] };
    }

    // Check if app already exists in this branch? If so, update or append?
    // "lets say the second guy is now trying to enter their details so it should show them the current message... now if they are subitting their message it should update"
    // Assuming append behavior for different apps. If same app submits again, maybe update?
    // Let's implement Update if exists, Append if new.

    const branchData = branchStore[branch];
    const existingAppIndex = branchData.apps.findIndex(a => a.name === appName);

    const appEntry = {
        name: appName,
        submissionId,
        gitlog,
        tagHashId // Stored but not in message
    };

    if (existingAppIndex >= 0) {
        branchData.apps[existingAppIndex] = appEntry;
    } else {
        branchData.apps.push(appEntry);
    }

    // Merge issues
    if (issues && issues.trim()) {
        const newIssues = issues.split(',').map(i => i.trim()).filter(i => i);
        branchData.issues = [...new Set([...branchData.issues, ...newIssues])];
    }

    saveData(); // Persist changes
    const note = generateReleaseNote(branch);
    res.json({ success: true, note });
});

// --- PROTECTED ROUTES ---

// API: Admin Data
app.get('/api/admin/data', checkAuth, (req, res) => {
    // Return all data
    // We want to return an array of branches with their generated notes
    const result = Object.keys(branchStore).map(branch => ({
        branch,
        note: generateReleaseNote(branch),
        apps: branchStore[branch].apps,
        issues: branchStore[branch].issues
    }));
    res.json(result);
});

// API: Shutdown Server
app.post('/api/shutdown', checkAuth, (req, res) => {
    saveData(); // Last save
    res.json({ success: true, message: 'Server shutting down...' });
    console.log('Shutdown requested via Admin UI. Exiting...');
    // Give time for the response to send
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

// API: Delete Branch Data
app.delete('/api/admin/branch/:branch', checkAuth, (req, res) => {
    const branch = req.params.branch.toLowerCase();
    if (branchStore[branch]) {
        delete branchStore[branch];
        saveData(); // Persist changes
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Branch not found' });
    }
});

// API: Delete specific app submission from a branch
app.delete('/api/admin/branch/:branch/app/:appName', checkAuth, (req, res) => {
    const branch = req.params.branch.toLowerCase();
    const appName = req.params.appName;

    if (!branchStore[branch]) {
        return res.status(404).json({ error: 'Branch not found' });
    }

    const branchData = branchStore[branch];
    const appIndex = branchData.apps.findIndex(a => a.name === appName);

    if (appIndex === -1) {
        return res.status(404).json({ error: 'App not found in branch' });
    }

    branchData.apps.splice(appIndex, 1);

    // If no apps left, clean up the branch
    if (branchData.apps.length === 0) {
        delete branchStore[branch];
    }

    saveData();
    res.json({ success: true });
});

// Serve Admin Dashboard
app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve Main App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Access from other devices using your machine's IP address on port ${PORT}`);
});
