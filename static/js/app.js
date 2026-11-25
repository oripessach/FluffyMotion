/**
 * 🎬 Fluffy Motion - Frontend Application
 */

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
const state = {
    currentView: 'login', // 'login', 'admin', 'projects', 'editor'
    user: null,           // { username, role }
    projects: [],
    currentProject: null,
    frames: [],
    stream: null,         // MediaStream
    cameras: [],          // Array of MediaDeviceInfo
    selectedCameraId: null,
    onionSkinOpacity: 50, // 0 - 100
    fps: 12,
    isCapturing: false,
    isExporting: false,
    isPlaying: false,
    playbackTimer: null,
    playbackIndex: 0,
    preloadedImages: [],
    draggedIndex: null
};

// ---------------------------------------------------------------------------
// DOM Elements Cache
// ---------------------------------------------------------------------------
const el = {
    header: document.getElementById('app-header'),
    headerRight: document.getElementById('header-right'),
    toastContainer: document.getElementById('toast-container'),

    // Views
    views: {
        login: document.getElementById('login-view'),
        admin: document.getElementById('admin-view'),
        projects: document.getElementById('projects-view'),
        editor: document.getElementById('editor-view')
    },

    // Login View
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),

    // Admin View
    usersTableBody: document.getElementById('users-table-body'),
    createUserForm: document.getElementById('create-user-form'),
    newUsername: document.getElementById('new-username'),
    newPassword: document.getElementById('new-password'),
    newRole: document.getElementById('new-role'),
    adminBackToProjects: document.getElementById('admin-back-to-projects'),
    adminLogoutBtn: document.getElementById('admin-logout-btn'),

    // Projects View
    welcomeMsg: document.getElementById('welcome-msg'),
    projectsAdminLink: document.getElementById('projects-admin-link'),
    projectsGrid: document.getElementById('projects-grid'),
    projectsEmpty: document.getElementById('projects-empty'),
    createProjectBtn: document.getElementById('create-project-btn'),

    // Editor View
    editorBackBtn: document.getElementById('editor-back-btn'),
    editorProjectName: document.getElementById('editor-project-name'),
    editNameIcon: document.getElementById('edit-name-icon'),
    fpsSelect: document.getElementById('fps-select'),
    downloadBtn: document.getElementById('download-btn'),
    cameraPreviewContainer: document.getElementById('camera-preview-container'),
    cameraVideo: document.getElementById('camera-video'),
    onionSkinImg: document.getElementById('onion-skin-img'),
    playbackImg: document.getElementById('playback-img'),
    captureFlash: document.getElementById('capture-flash'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    captureBtn: document.getElementById('capture-btn'),
    playBtn: document.getElementById('play-btn'),
    onionSlider: document.getElementById('onion-slider'),
    onionValue: document.getElementById('onion-value'),
    cameraSelect: document.getElementById('camera-select'),
    frameCount: document.getElementById('frame-count'),
    filmstrip: document.getElementById('filmstrip'),
    filmstripEmpty: document.getElementById('filmstrip-empty')
};

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------
function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.textContent = `${icon} ${message}`;
    
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, 3200);
}

// ---------------------------------------------------------------------------
// API Helper
// ---------------------------------------------------------------------------
async function api(url, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {}
    };
    if (body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data;
    try {
        data = await res.json();
    } catch (e) {
        throw new Error(`Server error (${res.status})`);
    }
    if (!res.ok || (data && data.success === false)) {
        throw new Error((data && data.error) || `Request failed with status ${res.status}`);
    }
    return data;
}

// ---------------------------------------------------------------------------
// View Navigation
// ---------------------------------------------------------------------------
function showView(viewName) {
    if (state.isPlaying) {
        stopPlayback();
    }
    if (state.currentView === 'editor' && viewName !== 'editor') {
        stopCamera();
    }

    state.currentView = viewName;
    Object.keys(el.views).forEach(name => {
        if (el.views[name]) {
            el.views[name].style.display = (name === viewName) ? '' : 'none';
        }
    });

    updateHeader();
}

function updateHeader() {
    if (!el.headerRight) return;
    el.headerRight.innerHTML = '';

    if (state.user) {
        const userBadge = document.createElement('span');
        userBadge.className = 'header-user';
        userBadge.style.cssText = 'color: white; font-weight: 600; margin-right: 12px; font-size: 14px;';
        userBadge.textContent = `👤 ${state.user.username} (${state.user.role})`;
        el.headerRight.appendChild(userBadge);

        if (state.user.role === 'admin') {
            const adminBtn = document.createElement('button');
            adminBtn.className = 'btn btn-purple btn-pill btn-sm';
            adminBtn.style.marginRight = '8px';
            adminBtn.textContent = state.currentView === 'admin' ? '🎬 My Projects' : '👤 User Admin';
            adminBtn.onclick = () => {
                if (state.currentView === 'admin') {
                    showProjectsView();
                } else {
                    showAdminView();
                }
            };
            el.headerRight.appendChild(adminBtn);
        }

        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn btn-outline btn-pill btn-sm';
        logoutBtn.style.cssText = 'border-color: rgba(255,255,255,0.7); color: white;';
        logoutBtn.textContent = '🚪 Logout';
        logoutBtn.onclick = handleLogout;
        el.headerRight.appendChild(logoutBtn);
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
async function checkSession() {
    try {
        const res = await api('/api/session');
        if (res.logged_in && res.user) {
            state.user = res.user;
            if (state.user.role === 'admin') {
                showAdminView();
            } else {
                showProjectsView();
            }
        } else {
            state.user = null;
            showView('login');
        }
    } catch (e) {
        state.user = null;
        showView('login');
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const username = el.loginUsername.value.trim();
    const password = el.loginPassword.value;

    el.loginError.style.display = 'none';

    try {
        const res = await api('/api/login', 'POST', { username, password });
        state.user = res.user;
        el.loginPassword.value = '';
        showToast(`Welcome back, ${state.user.username}!`, 'success');
        if (state.user.role === 'admin') {
            showAdminView();
        } else {
            showProjectsView();
        }
    } catch (err) {
        el.loginError.textContent = err.message;
        el.loginError.style.display = 'block';
        showToast(err.message, 'error');
    }
}

async function handleLogout() {
    try {
        await api('/api/logout', 'POST');
    } catch (e) {
        // Continue logout anyway
    }
    state.user = null;
    state.currentProject = null;
    state.frames = [];
    stopCamera();
    showToast('Logged out successfully', 'info');
    showView('login');
}

// ---------------------------------------------------------------------------
// Admin View
// ---------------------------------------------------------------------------
async function showAdminView() {
    showView('admin');
    await loadUsers();
}

async function loadUsers() {
    if (!el.usersTableBody) return;
    try {
        const res = await api('/api/users');
        el.usersTableBody.innerHTML = '';
        res.users.forEach(u => {
            const tr = document.createElement('tr');

            const isSelf = state.user && state.user.username === u.username;
            tr.innerHTML = `
                <td><strong>${escapeHtml(u.username)}</strong> ${isSelf ? '<small style="color:var(--text-light);">(You)</small>' : ''}</td>
                <td><span class="role-badge ${u.role}">${escapeHtml(u.role)}</span></td>
                <td>
                    <div class="user-actions">
                        <button class="btn btn-secondary btn-pill btn-sm change-pwd-btn" 
                            data-username="${escapeHtml(u.username)}" title="Change password">
                            🔑 Password
                        </button>
                        <button class="btn btn-outline btn-pill btn-sm delete-user-btn" 
                            data-username="${escapeHtml(u.username)}" 
                            ${isSelf ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} title="Delete user">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            `;

            const pwdBtn = tr.querySelector('.change-pwd-btn');
            if (pwdBtn) {
                pwdBtn.onclick = () => openPasswordModal(u.username);
            }

            const delBtn = tr.querySelector('.delete-user-btn');
            if (delBtn && !isSelf) {
                delBtn.onclick = () => handleDeleteUser(u.username);
            }

            el.usersTableBody.appendChild(tr);
        });
    } catch (err) {
        showToast(`Failed to load users: ${err.message}`, 'error');
    }
}

async function handleCreateUser(e) {
    if (e) e.preventDefault();
    const username = el.newUsername.value.trim();
    const password = el.newPassword.value;
    const role = el.newRole.value;

    if (!username || !password) {
        showToast('Please provide both username and password', 'error');
        return;
    }

    try {
        await api('/api/users', 'POST', { username, password, role });
        showToast(`User '${username}' created!`, 'success');
        el.newUsername.value = '';
        el.newPassword.value = '';
        await loadUsers();
    } catch (err) {
        showToast(`Failed to create user: ${err.message}`, 'error');
    }
}

async function handleDeleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}" and all their projects?`)) {
        return;
    }
    try {
        await api(`/api/users/${encodeURIComponent(username)}`, 'DELETE');
        showToast(`User '${username}' deleted`, 'info');
        await loadUsers();
    } catch (err) {
        showToast(`Failed to delete user: ${err.message}`, 'error');
    }
}

// Password Modal Management
let passwordTargetUser = null;

function openPasswordModal(username) {
    passwordTargetUser = username;
    const modal = document.getElementById('password-modal');
    const targetName = document.getElementById('modal-target-username');
    const pwdInput = document.getElementById('modal-new-password');
    if (targetName) targetName.textContent = username;
    if (pwdInput) {
        pwdInput.value = '';
    }
    if (modal) modal.style.display = 'flex';
    setTimeout(() => {
        if (pwdInput) pwdInput.focus();
    }, 50);
}

function closePasswordModal() {
    passwordTargetUser = null;
    const modal = document.getElementById('password-modal');
    if (modal) modal.style.display = 'none';
}

async function handleChangePassword(e) {
    if (e) e.preventDefault();
    if (!passwordTargetUser) return;
    const pwdInput = document.getElementById('modal-new-password');
    const newPassword = pwdInput ? pwdInput.value : '';
    if (!newPassword) {
        showToast('Please enter a new password', 'error');
        return;
    }

    try {
        await api(`/api/users/${encodeURIComponent(passwordTargetUser)}/password`, 'PUT', { password: newPassword });
        showToast(`Password updated for "${passwordTargetUser}"! 🔑`, 'success');
        closePasswordModal();
    } catch (err) {
        showToast(`Failed to update password: ${err.message}`, 'error');
    }
}

// ---------------------------------------------------------------------------
// Projects View
// ---------------------------------------------------------------------------
async function showProjectsView() {
    showView('projects');
    if (el.welcomeMsg && state.user) {
        el.welcomeMsg.textContent = `Welcome, ${state.user.username}! Let's make movies! 🎬`;
    }
    if (el.projectsAdminLink) {
        el.projectsAdminLink.style.display = (state.user && state.user.role === 'admin') ? '' : 'none';
    }
    await loadProjects();
}

async function loadProjects() {
    if (!el.projectsGrid) return;
    try {
        const res = await api('/api/projects');
        state.projects = res.projects || [];
        renderProjectsGrid();
    } catch (err) {
        showToast(`Failed to load projects: ${err.message}`, 'error');
    }
}

function renderProjectsGrid() {
    el.projectsGrid.innerHTML = '';

    if (state.projects.length === 0) {
        if (el.projectsEmpty) el.projectsEmpty.style.display = 'block';
        return;
    }

    if (el.projectsEmpty) el.projectsEmpty.style.display = 'none';

    state.projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';

        // Thumbnail
        let thumbHtml;
        if (project.frame_count > 0) {
            const lastFrameName = `frame_${String(project.frame_count).padStart(3, '0')}.png`;
            const thumbUrl = `/api/projects/${project.id}/frames/${lastFrameName}/image`;
            thumbHtml = `
                <img src="${thumbUrl}" alt="${escapeHtml(project.name)}" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-emoji\\'>🎬</span>'">
                <span class="frame-count-badge">${project.frame_count} frames</span>
            `;
        } else {
            thumbHtml = `
                <span class="placeholder-emoji">🎬</span>
                <span class="frame-count-badge">0 frames</span>
            `;
        }

        card.innerHTML = `
            <div class="project-card-thumb">
                ${thumbHtml}
            </div>
            <div class="project-card-body">
                <div class="project-card-name" contenteditable="true" title="Click to rename">${escapeHtml(project.name)}</div>
                <div class="project-card-actions">
                    <button class="btn btn-secondary btn-pill open-btn">▶ Open</button>
                    <button class="btn btn-outline btn-pill delete-btn">🗑️ Delete</button>
                </div>
            </div>
        `;

        // Card action listeners
        const nameEl = card.querySelector('.project-card-name');
        nameEl.addEventListener('blur', () => handleRenameProject(project.id, nameEl.textContent.trim(), project.name));
        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameEl.blur();
            }
        });

        card.querySelector('.open-btn').onclick = () => openProject(project);
        card.querySelector('.delete-btn').onclick = () => handleDeleteProject(project.id, project.name);

        el.projectsGrid.appendChild(card);
    });
}

async function handleCreateProject() {
    try {
        const res = await api('/api/projects', 'POST');
        showToast(`Created new project: ${res.project.name}`, 'success');
        openProject(res.project);
    } catch (err) {
        showToast(`Failed to create project: ${err.message}`, 'error');
    }
}

async function handleRenameProject(projectId, newName, oldName) {
    if (!newName || newName === oldName) return;
    try {
        await api(`/api/projects/${projectId}`, 'PUT', { name: newName });
        const p = state.projects.find(x => x.id === projectId);
        if (p) p.name = newName;
        showToast('Project renamed', 'success');
    } catch (err) {
        showToast(`Rename failed: ${err.message}`, 'error');
        await loadProjects();
    }
}

async function handleDeleteProject(projectId, projectName) {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This cannot be undone.`)) {
        return;
    }
    try {
        await api(`/api/projects/${projectId}`, 'DELETE');
        showToast(`Deleted ${projectName}`, 'info');
        await loadProjects();
    } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
    }
}

// ---------------------------------------------------------------------------
// Editor View
// ---------------------------------------------------------------------------
async function openProject(project) {
    state.currentProject = project;
    state.fps = project.fps || 12;
    state.selectedCameraId = project.last_camera_id || null;

    showView('editor');

    // Setup topbar
    if (el.editorProjectName) {
        el.editorProjectName.textContent = project.name;
    }
    if (el.fpsSelect) {
        el.fpsSelect.value = String(state.fps);
    }

    // Reset onion skin
    if (el.onionSlider) {
        el.onionSlider.value = state.onionSkinOpacity;
    }
    if (el.onionValue) {
        el.onionValue.textContent = state.onionSkinOpacity;
    }

    // Load frames first
    await loadFrames(project.id);

    // Initialize camera
    await initCamera(state.selectedCameraId);
}

async function loadFrames(projectId) {
    try {
        const res = await api(`/api/projects/${projectId}/frames`);
        state.frames = res.frames || [];
        state.preloadedImages = [];
        state.playbackIndex = 0;
        renderFilmstrip();
        updateOnionSkin();
        updateDownloadButton();
    } catch (err) {
        showToast(`Failed to load frames: ${err.message}`, 'error');
    }
}

function renderFilmstrip() {
    if (!el.filmstrip) return;
    el.filmstrip.innerHTML = '';

    if (el.frameCount) {
        el.frameCount.textContent = state.frames.length;
    }

    if (state.frames.length === 0) {
        if (el.filmstripEmpty) el.filmstrip.appendChild(el.filmstripEmpty);
        return;
    }

    state.frames.forEach((frame, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'frame-thumb';
        thumb.draggable = true;
        thumb.dataset.index = idx;
        thumb.dataset.filename = frame.filename;

        thumb.innerHTML = `
            <img src="${frame.url}" alt="Frame ${idx + 1}">
            <span class="frame-number-badge">#${idx + 1}</span>
            <button class="frame-delete-btn" title="Delete frame">🗑️</button>
        `;

        // Delete button
        const delBtn = thumb.querySelector('.frame-delete-btn');
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteFrame(frame.filename);
        };

        // Drag and drop reordering
        thumb.addEventListener('dragstart', (e) => {
            state.draggedIndex = idx;
            thumb.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(idx));
        });

        thumb.addEventListener('dragend', () => {
            thumb.classList.remove('dragging');
            document.querySelectorAll('.frame-thumb').forEach(t => t.classList.remove('drag-over'));
        });

        thumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            thumb.classList.add('drag-over');
        });

        thumb.addEventListener('dragleave', () => {
            thumb.classList.remove('drag-over');
        });

        thumb.addEventListener('drop', (e) => {
            e.preventDefault();
            thumb.classList.remove('drag-over');
            const fromIndex = state.draggedIndex;
            const toIndex = idx;
            if (fromIndex !== null && fromIndex !== toIndex) {
                reorderFrames(fromIndex, toIndex);
            }
        });

        el.filmstrip.appendChild(thumb);
    });

    // Auto scroll film strip to the end
    el.filmstrip.scrollLeft = el.filmstrip.scrollWidth;
}

function updateOnionSkin() {
    if (!el.onionSkinImg) return;

    if (state.frames.length > 0) {
        const lastFrame = state.frames[state.frames.length - 1];
        el.onionSkinImg.src = `${lastFrame.url}?t=${Date.now()}`;
        el.onionSkinImg.style.display = 'block';
        el.onionSkinImg.style.opacity = state.onionSkinOpacity / 100;
    } else {
        el.onionSkinImg.style.display = 'none';
        el.onionSkinImg.removeAttribute('src');
    }
}

function updateDownloadButton() {
    if (!el.downloadBtn) return;
    el.downloadBtn.disabled = (state.frames.length === 0 || state.isExporting);
}

// ---------------------------------------------------------------------------
// Camera Controls
// ---------------------------------------------------------------------------
async function initCamera(preferredDeviceId = null) {
    stopCamera();

    if (el.cameraPlaceholder) el.cameraPlaceholder.style.display = 'flex';

    let constraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };

    if (preferredDeviceId) {
        constraints.video.deviceId = { exact: preferredDeviceId };
    }

    try {
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        // If preferred device failed, try default
        if (preferredDeviceId) {
            console.warn('Preferred camera failed, trying default camera', err);
            try {
                constraints.video.deviceId = undefined;
                state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err2) {
                handleCameraError(err2);
                return;
            }
        } else {
            handleCameraError(err);
            return;
        }
    }

    if (el.cameraVideo) {
        el.cameraVideo.srcObject = state.stream;
        try {
            await el.cameraVideo.play();
        } catch (e) {
            console.log('Video play interrupted/handled');
        }
    }

    if (el.cameraPlaceholder) el.cameraPlaceholder.style.display = 'none';

    // Refresh device list and set selected camera dropdown
    await refreshCameraList();
}

function stopCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
    }
    if (el.cameraVideo) {
        el.cameraVideo.srcObject = null;
    }
    if (el.cameraPlaceholder) {
        el.cameraPlaceholder.style.display = 'flex';
    }
}

function handleCameraError(err) {
    if (el.cameraPlaceholder) {
        el.cameraPlaceholder.style.display = 'flex';
        el.cameraPlaceholder.innerHTML = `
            <span>⚠️</span>
            <p style="padding:0 20px;">Camera access denied or unavailable: ${escapeHtml(err.message)}</p>
        `;
    }
    showToast(`Camera error: ${err.message}`, 'error');
}

async function refreshCameraList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        state.cameras = devices.filter(d => d.kind === 'videoinput');

        if (!el.cameraSelect) return;
        el.cameraSelect.innerHTML = '';

        if (state.cameras.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No cameras found';
            el.cameraSelect.appendChild(opt);
            return;
        }

        // Get currently active device ID from stream
        let activeDeviceId = null;
        if (state.stream) {
            const track = state.stream.getVideoTracks()[0];
            if (track) {
                const settings = track.getSettings();
                activeDeviceId = settings.deviceId;
            }
        }

        state.cameras.forEach((camera, i) => {
            const opt = document.createElement('option');
            opt.value = camera.deviceId;
            opt.textContent = camera.label || `Camera ${i + 1}`;
            if (camera.deviceId === activeDeviceId || (!activeDeviceId && i === 0)) {
                opt.selected = true;
                state.selectedCameraId = camera.deviceId;
            }
            el.cameraSelect.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not enumerate cameras', e);
    }
}

async function handleCameraSelect(e) {
    const deviceId = e.target.value;
    if (!deviceId) return;
    state.selectedCameraId = deviceId;

    // Save camera ID in project session data
    if (state.currentProject) {
        try {
            await api(`/api/projects/${state.currentProject.id}`, 'PUT', { last_camera_id: deviceId });
            state.currentProject.last_camera_id = deviceId;
        } catch (err) {
            console.warn('Could not save camera choice:', err);
        }
    }

    await initCamera(deviceId);
}

// ---------------------------------------------------------------------------
// Frame Capture & Management
// ---------------------------------------------------------------------------
async function captureFrame() {
    if (state.isPlaying) stopPlayback();
    if (state.isCapturing || !state.currentProject) return;
    if (!el.cameraVideo || !el.cameraVideo.videoWidth) {
        showToast('Camera is not ready yet', 'error');
        return;
    }

    state.isCapturing = true;

    // Visual flash animation
    if (el.captureFlash) {
        el.captureFlash.classList.add('flash');
        setTimeout(() => el.captureFlash.classList.remove('flash'), 250);
    }

    try {
        // Draw to offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = el.cameraVideo.videoWidth;
        canvas.height = el.cameraVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(el.cameraVideo, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/png');

        const res = await api(`/api/projects/${state.currentProject.id}/frames`, 'POST', { image: dataUrl });

        state.frames.push(res.frame);
        state.currentProject.frame_count = state.frames.length;

        renderFilmstrip();
        updateOnionSkin();
        updateDownloadButton();

        showToast(`Frame #${state.frames.length} captured! 📸`, 'success');
    } catch (err) {
        showToast(`Capture failed: ${err.message}`, 'error');
    } finally {
        state.isCapturing = false;
    }
}

async function deleteFrame(filename) {
    if (state.isPlaying) stopPlayback();
    if (!confirm('Delete this frame?')) return;
    try {
        await api(`/api/projects/${state.currentProject.id}/frames/${filename}`, 'DELETE');
        showToast('Frame deleted', 'info');
        state.preloadedImages = [];
        state.playbackIndex = 0;
        await loadFrames(state.currentProject.id);
    } catch (err) {
        showToast(`Failed to delete frame: ${err.message}`, 'error');
    }
}

async function reorderFrames(fromIndex, toIndex) {
    if (state.isPlaying) stopPlayback();
    const reordered = [...state.frames];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const order = reordered.map(f => f.filename);

    try {
        await api(`/api/projects/${state.currentProject.id}/frames/reorder`, 'POST', { order });
        state.preloadedImages = [];
        state.playbackIndex = 0;
        await loadFrames(state.currentProject.id);
        showToast('Frames reordered! 🎞️', 'success');
    } catch (err) {
        showToast(`Reorder failed: ${err.message}`, 'error');
        renderFilmstrip();
    }
}

// ---------------------------------------------------------------------------
// Animation Playback
// ---------------------------------------------------------------------------
function preloadFrames() {
    state.preloadedImages = [];
    state.frames.forEach((frame, idx) => {
        const img = new Image();
        img.src = frame.url;
        state.preloadedImages[idx] = img;
    });
}

function togglePlayback() {
    if (state.isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    if (!state.currentProject || state.frames.length === 0) {
        showToast('Capture some frames first to play! 🎬', 'info');
        return;
    }

    state.isPlaying = true;
    state.playbackIndex = 0;

    if (el.playBtn) {
        el.playBtn.innerHTML = '⏹️ Stop';
        el.playBtn.classList.add('playing');
        el.playBtn.title = 'Stop animation playback';
    }

    // Hide onion skin while playing
    if (el.onionSkinImg) {
        el.onionSkinImg.style.display = 'none';
    }

    // Show playback image
    if (el.playbackImg) {
        el.playbackImg.style.display = 'block';
    }

    preloadFrames();

    const fps = state.fps || (state.currentProject && state.currentProject.fps) || 12;
    const intervalMs = Math.max(20, Math.round(1000 / fps));

    function step() {
        if (!state.isPlaying || state.frames.length === 0) return;

        if (state.playbackIndex >= state.frames.length) {
            state.playbackIndex = 0;
        }

        const frame = state.frames[state.playbackIndex];
        if (el.playbackImg && frame) {
            const preloaded = state.preloadedImages[state.playbackIndex];
            if (preloaded && preloaded.complete && preloaded.naturalWidth > 0) {
                el.playbackImg.src = preloaded.src;
            } else {
                el.playbackImg.src = frame.url;
            }
        }

        highlightPlayingFrame(state.playbackIndex);

        state.playbackIndex = (state.playbackIndex + 1) % state.frames.length;
        state.playbackTimer = setTimeout(step, intervalMs);
    }

    step();
}

function stopPlayback() {
    state.isPlaying = false;
    if (state.playbackTimer) {
        clearTimeout(state.playbackTimer);
        state.playbackTimer = null;
    }

    if (el.playBtn) {
        el.playBtn.innerHTML = '▶️ Play';
        el.playBtn.classList.remove('playing');
        el.playBtn.title = 'Play animation at selected FPS';
    }

    if (el.playbackImg) {
        el.playbackImg.style.display = 'none';
        el.playbackImg.removeAttribute('src');
    }

    // Restore onion skin
    updateOnionSkin();

    // Remove active highlight in filmstrip
    if (el.filmstrip) {
        el.filmstrip.querySelectorAll('.frame-thumb').forEach(t => t.classList.remove('playing-frame'));
    }
}

function highlightPlayingFrame(index) {
    if (!el.filmstrip) return;
    const thumbs = el.filmstrip.querySelectorAll('.frame-thumb');
    thumbs.forEach((t, i) => {
        if (i === index) {
            t.classList.add('playing-frame');
        } else {
            t.classList.remove('playing-frame');
        }
    });
}

// ---------------------------------------------------------------------------
// Video Export
// ---------------------------------------------------------------------------
async function exportVideo() {
    if (!state.currentProject || state.frames.length === 0 || state.isExporting) return;

    state.isExporting = true;
    updateDownloadButton();

    const originalText = el.downloadBtn.textContent;
    el.downloadBtn.textContent = '⏳ Encoding MP4...';

    showToast('Starting video export with FFmpeg...', 'info');

    try {
        await api(`/api/projects/${state.currentProject.id}/export`, 'POST', { fps: state.fps });
        showToast('Video ready! Download starting...', 'success');
        
        // Trigger download
        const downloadUrl = `/api/projects/${state.currentProject.id}/export/download?t=${Date.now()}`;
        window.location.href = downloadUrl;
    } catch (err) {
        showToast(`Export failed: ${err.message}`, 'error');
    } finally {
        state.isExporting = false;
        el.downloadBtn.textContent = originalText;
        updateDownloadButton();
    }
}

// ---------------------------------------------------------------------------
// Helper Utilities
// ---------------------------------------------------------------------------
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Event Listeners Setup
// ---------------------------------------------------------------------------
function setupEventListeners() {
    // Auth
    if (el.loginForm) el.loginForm.onsubmit = handleLogin;
    if (el.adminLogoutBtn) el.adminLogoutBtn.onclick = handleLogout;

    // Admin
    if (el.createUserForm) el.createUserForm.onsubmit = handleCreateUser;
    if (el.adminBackToProjects) el.adminBackToProjects.onclick = (e) => {
        e.preventDefault();
        showProjectsView();
    };

    // Password modal
    const pwdForm = document.getElementById('password-form');
    if (pwdForm) pwdForm.onsubmit = handleChangePassword;
    const closePwdBtn = document.getElementById('close-password-modal-btn');
    if (closePwdBtn) closePwdBtn.onclick = closePasswordModal;
    const cancelPwdBtn = document.getElementById('cancel-password-modal-btn');
    if (cancelPwdBtn) cancelPwdBtn.onclick = closePasswordModal;
    const pwdModal = document.getElementById('password-modal');
    if (pwdModal) {
        pwdModal.onclick = (e) => {
            if (e.target === pwdModal) closePasswordModal();
        };
    }

    // Projects
    if (el.projectsAdminLink) el.projectsAdminLink.onclick = (e) => {
        e.preventDefault();
        showAdminView();
    };
    if (el.createProjectBtn) el.createProjectBtn.onclick = handleCreateProject;

    // Editor topbar
    if (el.editorBackBtn) el.editorBackBtn.onclick = () => showProjectsView();

    // Editor project name editing
    const makeNameEditable = () => {
        el.editorProjectName.contentEditable = 'true';
        el.editorProjectName.focus();
    };
    if (el.editNameIcon) el.editNameIcon.onclick = makeNameEditable;
    if (el.editorProjectName) {
        el.editorProjectName.onclick = makeNameEditable;
        el.editorProjectName.onblur = async () => {
            el.editorProjectName.contentEditable = 'false';
            const newName = el.editorProjectName.textContent.trim();
            if (newName && state.currentProject && newName !== state.currentProject.name) {
                try {
                    await api(`/api/projects/${state.currentProject.id}`, 'PUT', { name: newName });
                    state.currentProject.name = newName;
                    showToast('Project renamed', 'success');
                } catch (err) {
                    el.editorProjectName.textContent = state.currentProject.name;
                    showToast(`Rename failed: ${err.message}`, 'error');
                }
            }
        };
        el.editorProjectName.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.editorProjectName.blur();
            }
        };
    }

    // FPS selector
    if (el.fpsSelect) {
        el.fpsSelect.onchange = async () => {
            state.fps = Number(el.fpsSelect.value);
            if (state.isPlaying) {
                stopPlayback();
                startPlayback();
            }
            if (state.currentProject) {
                try {
                    await api(`/api/projects/${state.currentProject.id}`, 'PUT', { fps: state.fps });
                    state.currentProject.fps = state.fps;
                } catch (e) {
                    console.warn('Could not save fps:', e);
                }
            }
        };
    }

    // Download button
    if (el.downloadBtn) el.downloadBtn.onclick = exportVideo;

    // Capture button
    if (el.captureBtn) el.captureBtn.onclick = captureFrame;

    // Play button
    if (el.playBtn) el.playBtn.onclick = togglePlayback;

    // Onion skin slider
    if (el.onionSlider) {
        el.onionSlider.oninput = () => {
            state.onionSkinOpacity = Number(el.onionSlider.value);
            if (el.onionValue) el.onionValue.textContent = state.onionSkinOpacity;
            if (el.onionSkinImg) {
                el.onionSkinImg.style.opacity = state.onionSkinOpacity / 100;
            }
        };
    }

    // Camera selector
    if (el.cameraSelect) {
        el.cameraSelect.onchange = handleCameraSelect;
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePasswordModal();
        }

        if (state.currentView !== 'editor') return;

        const active = document.activeElement;
        const isEditing = active && (
            active.tagName === 'INPUT' ||
            active.tagName === 'SELECT' ||
            active.tagName === 'TEXTAREA' ||
            active.isContentEditable
        );
        if (isEditing) return;

        // Space bar: capture frame (or stop playback if currently playing)
        if (e.code === 'Space') {
            e.preventDefault();
            if (state.isPlaying) {
                stopPlayback();
            } else {
                captureFrame();
            }
        }

        // 'P' key: toggle playback
        if (e.code === 'KeyP') {
            e.preventDefault();
            togglePlayback();
        }
    });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkSession();
});
