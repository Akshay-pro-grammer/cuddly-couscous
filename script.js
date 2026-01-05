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

    // API Interaction
    async function fetchBranchNotes(branchName) {
        if (!branchName) return;
        try {
            const response = await fetch(`/api/notes/${branchName}`);
            const data = await response.json();
            if (data.note) {
                preview.textContent = data.note;
                preview.classList.remove('empty-state');
                preview.style.color = '#a5d6ff';
            } else {
                preview.textContent = 'No data for this branch yet. Be the first!';
                preview.classList.add('empty-state');
            }
        } catch (err) {
            console.error('Error fetching notes:', err);
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

                // Visual feedback
                const originalText = btnSubmit.textContent;
                btnSubmit.textContent = 'Merged Successfully!';
                btnSubmit.classList.add('btn-success');
                setTimeout(() => {
                    btnSubmit.textContent = originalText;
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

    // Auto-fetch when branch is typed
    let debounceTimer;
    inputs.branch.addEventListener('input', (e) => {
        const branch = e.target.value.trim();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchBranchNotes(branch), 500);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitData();
    });

    // Copy to Clipboard (Client side copys what's in preview)
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
});
