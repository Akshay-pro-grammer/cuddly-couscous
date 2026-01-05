document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const inputs = {
        appName: document.getElementById('appName'),
        submissionId: document.getElementById('submissionId'),
        tagHashId: document.getElementById('tagHashId'),
        branch: document.getElementById('branch'),
        issues: document.getElementById('issues'),
        gitlog: document.getElementById('gitlog'),
        aiCodeReviewLink: document.getElementById('aiCodeReviewLink'),
        featureBatLink: document.getElementById('featureBatLink')
    };

    const preview = document.getElementById('message-preview');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');
    const form = document.getElementById('generator-form');
    const btnSubmit = document.getElementById('btn-submit');

    // Store existing branch data for merging preview
    let existingBranchData = null;

    // Generate local preview (mirrors server logic)
    function generateLocalPreview() {
        const appName = inputs.appName.value.trim();
        const branch = inputs.branch.value.trim().toLowerCase();
        const submissionId = inputs.submissionId.value.trim();
        const gitlog = inputs.gitlog.value.trim();
        const issues = inputs.issues.value.trim();

        if (!branch && !appName) {
            preview.textContent = 'Start typing to see real-time preview...';
            preview.classList.add('empty-state');
            return;
        }

        preview.classList.remove('empty-state');
        preview.style.color = '#a5d6ff';

        // Build apps list (merge with existing data if available)
        let apps = [];
        let allIssues = [];

        if (existingBranchData && existingBranchData.apps) {
            // Copy existing apps, but replace if same appName
            apps = existingBranchData.apps.filter(a => a.name !== appName);
            allIssues = [...(existingBranchData.issues || [])];
        }

        // Add current form data
        if (appName) {
            apps.push({
                name: appName,
                submissionId: submissionId || 'submissions/...',
                gitlog: gitlog || '...'
            });
        }

        // Add new issues
        if (issues) {
            const newIssues = issues.split(',').map(i => i.trim()).filter(i => i);
            allIssues = [...new Set([...allIssues, ...newIssues])];
        }

        if (apps.length === 0) {
            preview.textContent = 'Add an application name to generate preview...';
            preview.classList.add('empty-state');
            return;
        }

        // Helper function to break lines at 72 characters
        function wrapLine(text, maxLen = 72) {
            if (!text) return text;
            const lines = text.split('\n');
            return lines.map(line => {
                if (line.length <= maxLen) return line;
                // Hard break at maxLen characters
                let result = [];
                while (line.length > maxLen) {
                    result.push(line.substring(0, maxLen));
                    line = line.substring(maxLen);
                }
                if (line) result.push(line);
                return result.join('\n');
            }).join('\n');
        }

        // Generate the note
        const header = ':Release Notes:\nhorizontal deployment for multiple applications';
        const testPerformed = ':test performed:\nnpm test -pass';
        const detailedNotesHeader = ':Detailed notes:';

        const detailedContent = apps.map(app => {
            return [
                `com.webos.app.${app.name}`,
                app.submissionId,
                wrapLine(app.gitlog)
            ].join('\n');
        }).join('\n\n');

        // Build app names for footer
        const appNamesBracket = apps.length > 1
            ? `{${apps.map(a => a.name).join(',')}}`
            : apps[0].name;

        const footerLine = `[placeholder] [${branch || 'branch'}] CCC: com.webos.app.${appNamesBracket}`;

        let issuesContent = '';
        if (allIssues.length > 0) {
            const issuesList = allIssues.map(issue => `[${issue}]`).join('\n');
            issuesContent = issuesList + '\n' + footerLine;
        } else {
            issuesContent = footerLine;
        }

        const note = [
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

        preview.textContent = note;
    }

    // Fetch existing branch data for merge preview
    async function fetchBranchNotes(branchName) {
        if (!branchName) {
            existingBranchData = null;
            generateLocalPreview();
            return;
        }
        try {
            const response = await fetch(`/api/notes/${branchName}`);
            const data = await response.json();
            existingBranchData = data.data;
            generateLocalPreview();
        } catch (err) {
            console.error('Error fetching notes:', err);
            existingBranchData = null;
            generateLocalPreview();
        }
    }

    async function submitData() {
        const payload = {
            appName: inputs.appName.value.trim(),
            submissionId: inputs.submissionId.value.trim(),
            tagHashId: inputs.tagHashId.value.trim(),
            branch: inputs.branch.value.trim(),
            issues: inputs.issues.value.trim(),
            gitlog: inputs.gitlog.value.trim(),
            aiCodeReviewLink: inputs.aiCodeReviewLink.value.trim(),
            featureBatLink: inputs.featureBatLink.value.trim()
        };

        if (!payload.appName || !payload.branch) {
            alert('Application Name and Branch are required!');
            return;
        }

        btnSubmit.textContent = 'Submitting...';
        btnSubmit.disabled = true;

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.success) {
                preview.textContent = result.note;
                preview.classList.remove('empty-state');
                preview.style.color = '#a5d6ff';

                // Update existing data cache
                await fetchBranchNotes(payload.branch);

                // Visual feedback
                btnSubmit.textContent = 'Merged Successfully!';
                btnSubmit.classList.add('btn-success');
                setTimeout(() => {
                    btnSubmit.textContent = 'Submit & Merge';
                    btnSubmit.disabled = false;
                    btnSubmit.classList.remove('btn-success');
                }, 2000);
            }
        } catch (err) {
            console.error('Error submitting:', err);
            alert('Failed to submit data.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Submit & Merge';
        }
    }

    // Event Listeners

    // Real-time preview on any input change
    let previewDebounce;
    Object.values(inputs).forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                clearTimeout(previewDebounce);
                previewDebounce = setTimeout(generateLocalPreview, 100);
            });
        }
    });

    // Fetch branch data when branch field changes (with debounce)
    let branchDebounce;
    inputs.branch.addEventListener('input', (e) => {
        const branch = e.target.value.trim();
        clearTimeout(branchDebounce);
        branchDebounce = setTimeout(() => fetchBranchNotes(branch), 500);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitData();
    });

    // Copy to Clipboard
    btnCopy.addEventListener('click', async () => {
        const txt = preview.textContent;
        if (!txt || preview.classList.contains('empty-state')) return;

        try {
            await navigator.clipboard.writeText(txt);
            const originalHTML = btnCopy.innerHTML;
            btnCopy.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            btnCopy.classList.add('success-state');
            setTimeout(() => {
                btnCopy.innerHTML = originalHTML;
                btnCopy.classList.remove('success-state');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    });

    // Download
    btnDownload.addEventListener('click', () => {
        const txt = preview.textContent;
        if (!txt || preview.classList.contains('empty-state')) return;

        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = inputs.branch.value.trim() ? `${inputs.branch.value.trim()}-release-notes.txt` : 'release-notes.txt';
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Initial preview state
    generateLocalPreview();
});
