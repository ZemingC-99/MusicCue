// Global state management
const state = {
    activeProvider: localStorage.getItem("musiccue_active_provider") || "gemini",
    geminiApiKey: localStorage.getItem("musiccue_gemini_api_key") || localStorage.getItem("musiccue_api_key") || "",
    openaiApiKey: localStorage.getItem("musiccue_openai_api_key") || "",
    deepseekApiKey: localStorage.getItem("musiccue_deepseek_api_key") || "",
    shortcutName: localStorage.getItem("musiccue_shortcut_name") || "MusicCue",
    tasteProfile: null, // Holds parsed XML/CSV stats
    recommendedTracks: [], // Holds raw recommendations from AI engine
    resolvedTracks: [], // Holds resolved track details from iTunes API
    playingTrackIndex: null, // Current playing track index in resolvedTracks
    installedShortcuts: [], // List of macOS Shortcuts
    volume: parseFloat(localStorage.getItem("musiccue_volume") || "0.5")
};

// Load persistent configuration from Python backend
async function loadBackendConfig() {
    try {
        const response = await fetch("/api/config");
        if (response.ok) {
            const config = await response.json();
            if (config.activeProvider) state.activeProvider = config.activeProvider;
            if (config.geminiApiKey !== undefined) state.geminiApiKey = config.geminiApiKey;
            if (config.openaiApiKey !== undefined) state.openaiApiKey = config.openaiApiKey;
            if (config.deepseekApiKey !== undefined) state.deepseekApiKey = config.deepseekApiKey;
            if (config.shortcutName !== undefined) state.shortcutName = config.shortcutName;
            if (config.volume !== undefined) state.volume = config.volume;
            
            // Sync fallback to localStorage for redundancy
            localStorage.setItem("musiccue_active_provider", state.activeProvider);
            localStorage.setItem("musiccue_gemini_api_key", state.geminiApiKey);
            localStorage.setItem("musiccue_openai_api_key", state.openaiApiKey);
            localStorage.setItem("musiccue_deepseek_api_key", state.deepseekApiKey);
            localStorage.setItem("musiccue_shortcut_name", state.shortcutName);
            localStorage.setItem("musiccue_volume", state.volume);
        }
    } catch (e) {
        console.error("Failed to load backend config:", e);
    }
}

// Save persistent configuration to Python backend
async function saveBackendConfig(patch) {
    try {
        await fetch("/api/config", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(patch)
        });
    } catch (e) {
        console.error("Failed to save backend config:", e);
    }
}

// Toggle API key fields visibility based on active provider
function updateApiKeyVisibility() {
    const groups = document.querySelectorAll(".provider-key-group");
    groups.forEach(group => group.classList.add("hidden"));

    const activeGroup = document.getElementById(`group-key-${state.activeProvider}`);
    if (activeGroup) {
        activeGroup.classList.remove("hidden");
    }
}

// Initialize elements on load
document.addEventListener("DOMContentLoaded", async () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // Fetch config from backend to override default/local storage values
    await loadBackendConfig();

    // Highlight the active provider button/tab during load
    const activeBtn = document.querySelector(`.provider-btn[data-provider="${state.activeProvider}"]`);
    if (activeBtn) {
        document.querySelectorAll(".provider-btn").forEach(b => b.classList.remove("active"));
        activeBtn.classList.add("active");
    }

    const geminiKeyInput = document.getElementById("input-key-gemini");
    if (geminiKeyInput) {
        geminiKeyInput.value = state.geminiApiKey;
    }

    const openaiKeyInput = document.getElementById("input-key-openai");
    if (openaiKeyInput) {
        openaiKeyInput.value = state.openaiApiKey;
    }

    const deepseekKeyInput = document.getElementById("input-key-deepseek");
    if (deepseekKeyInput) {
        deepseekKeyInput.value = state.deepseekApiKey;
    }

    // Show/hide API key inputs dynamically based on active provider
    updateApiKeyVisibility();

    const shortcutInput = document.getElementById("input-shortcut-name");
    if (shortcutInput) {
        shortcutInput.value = state.shortcutName;
    }

    // Update API key badge status
    updateApiStatusBadge();

    // Fetch and check installed macOS shortcuts
    fetchInstalledShortcuts();

    // Setup events
    setupEventListeners();

    // Setup global audio volume
    const globalPlayer = document.getElementById("global-preview-player");
    if (globalPlayer) {
        globalPlayer.volume = state.volume;
    }
});

// Toast Notification System
function showToast(title, desc = "", type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast-card toast-${type}`;

    // Select icon based on toast type
    let iconName = "check-circle";
    if (type === "error") iconName = "alert-triangle";
    if (type === "info") iconName = "info";

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${desc ? `<div class="toast-desc">${desc}</div>` : ""}
        </div>
        <button class="toast-close">&times;</button>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Bind close button click
    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.addEventListener("click", () => {
        dismissToast(toast);
    });

    // Animate progress bar drain
    const progress = toast.querySelector(".toast-progress");
    progress.style.transition = "width 3.5s linear";
    // Force reflow
    progress.getBoundingClientRect();
    progress.style.width = "0%";

    // Auto-dismiss after 3.5 seconds
    const timeoutId = setTimeout(() => {
        dismissToast(toast);
    }, 3500);

    toast.dataset.timeoutId = timeoutId;
}

function dismissToast(toast) {
    if (toast.classList.contains("slide-out")) return;
    
    // Clear timeout if clicked manually
    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
    }

    toast.classList.add("slide-out");
    toast.addEventListener("animationend", () => {
        toast.remove();
    });
}

// Fetch list of installed shortcuts from macOS
async function fetchInstalledShortcuts() {
    try {
        const response = await fetch("/api/shortcuts");
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.status === "success") {
            state.installedShortcuts = data.shortcuts || [];
            updateShortcutsStatus();
        }
    } catch (e) {
        console.error("Failed to query macOS shortcuts list:", e);
    }
}

// Update the Shortcuts live connection indicator
function updateShortcutsStatus() {
    const badge = document.getElementById("shortcuts-status");
    if (!badge) return;

    const dot = badge.querySelector(".status-dot");
    const text = badge.querySelector(".status-text");
    const syncButton = document.getElementById("btn-sync");

    const shortcutExists = state.installedShortcuts.includes(state.shortcutName);

    if (shortcutExists) {
        badge.classList.remove("status-disconnected");
        badge.classList.add("status-connected");
        text.textContent = "快捷指令已就绪";
        if (syncButton) {
            syncButton.innerHTML = `<i data-lucide="zap"></i> <span>一键待播同步</span>`;
            lucide.createIcons();
        }
    } else {
        badge.classList.remove("status-connected");
        badge.classList.add("status-disconnected");
        text.textContent = "快捷指令未配置";
        if (syncButton) {
            syncButton.innerHTML = `<i data-lucide="help-circle"></i> <span>配置同步</span>`;
            lucide.createIcons();
        }
    }

    // Show badge once resolved tracks exist
    if (state.resolvedTracks.length > 0) {
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

// Bind DOM event listeners
function setupEventListeners() {
    // API Configuration Settings toggle
    const btnSettingsToggle = document.getElementById("btn-settings-toggle");
    const btnSettingsClose = document.getElementById("btn-settings-close");
    const settingsCard = document.getElementById("settings-card");
    const providerBtns = document.querySelectorAll(".provider-btn");
    const geminiKeyInput = document.getElementById("input-key-gemini");
    const openaiKeyInput = document.getElementById("input-key-openai");
    const deepseekKeyInput = document.getElementById("input-key-deepseek");
    const shortcutInput = document.getElementById("input-shortcut-name");

    btnSettingsToggle.addEventListener("click", () => {
        settingsCard.classList.toggle("hidden");
    });

    btnSettingsClose.addEventListener("click", () => {
        settingsCard.classList.add("hidden");
    });

    providerBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            providerBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeProvider = btn.getAttribute("data-provider");
            localStorage.setItem("musiccue_active_provider", state.activeProvider);
            saveBackendConfig({ activeProvider: state.activeProvider });
            updateApiKeyVisibility();
            updateApiStatusBadge();
        });
    });

    if (geminiKeyInput) {
        geminiKeyInput.addEventListener("input", (e) => {
            state.geminiApiKey = e.target.value.trim();
            localStorage.setItem("musiccue_gemini_api_key", state.geminiApiKey);
            saveBackendConfig({ geminiApiKey: state.geminiApiKey });
            updateApiStatusBadge();
        });
    }

    if (openaiKeyInput) {
        openaiKeyInput.addEventListener("input", (e) => {
            state.openaiApiKey = e.target.value.trim();
            localStorage.setItem("musiccue_openai_api_key", state.openaiApiKey);
            saveBackendConfig({ openaiApiKey: state.openaiApiKey });
            updateApiStatusBadge();
        });
    }

    if (deepseekKeyInput) {
        deepseekKeyInput.addEventListener("input", (e) => {
            state.deepseekApiKey = e.target.value.trim();
            localStorage.setItem("musiccue_deepseek_api_key", state.deepseekApiKey);
            saveBackendConfig({ deepseekApiKey: state.deepseekApiKey });
            updateApiStatusBadge();
        });
    }

    shortcutInput.addEventListener("input", (e) => {
        state.shortcutName = e.target.value.trim() || "MusicCue";
        localStorage.setItem("musiccue_shortcut_name", state.shortcutName);
        saveBackendConfig({ shortcutName: state.shortcutName });
        
        // Update tutorial modal code tag dynamically
        const guideName = document.getElementById("guide-shortcut-name");
        if (guideName) {
            guideName.textContent = state.shortcutName;
        }
        
        updateShortcutsStatus();
    });

    // One-click import button in Settings card
    const btnSettingsImportShortcut = document.getElementById("btn-settings-import-shortcut");
    if (btnSettingsImportShortcut) {
        btnSettingsImportShortcut.addEventListener("click", async () => {
            try {
                btnSettingsImportShortcut.disabled = true;
                const originalText = btnSettingsImportShortcut.innerHTML;
                btnSettingsImportShortcut.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px;"></i><span>正在打开...</span>`;
                if (window.lucide) lucide.createIcons();
                
                const response = await fetch("/api/install-shortcut", { method: "POST" });
                const result = await response.json();
                
                if (response.ok) {
                    showToast(result.message || "已打开快捷指令安装界面，请在系统弹窗中确认添加。", "success");
                } else {
                    showToast(result.detail || "一键导入失败，请双击 DMG 磁盘中的 MusicCue.shortcut 文件安装。", "error");
                }
                
                btnSettingsImportShortcut.innerHTML = originalText;
                if (window.lucide) lucide.createIcons();
            } catch (err) {
                showToast("连接服务失败，请双击 DMG 中的 MusicCue.shortcut 文件安装。", "error");
                btnSettingsImportShortcut.innerHTML = `<i data-lucide="download" style="width: 14px; height: 14px;"></i><span>一键导入</span>`;
                if (window.lucide) lucide.createIcons();
            } finally {
                btnSettingsImportShortcut.disabled = false;
            }
        });
    }

    // Help guide button in Settings card
    const btnSettingsHelpShortcut = document.getElementById("btn-settings-help-shortcut");
    if (btnSettingsHelpShortcut) {
        btnSettingsHelpShortcut.addEventListener("click", () => {
            const modal = document.getElementById("shortcut-modal");
            if (modal) {
                modal.classList.remove("hidden");
                modal.classList.add("active");
            }
        });
    }

    // Tab Switching (XML/CSV upload vs manual)
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            document.getElementById(tabId).classList.add("active");
        });
    });

    // CSV Dropzone Events
    const dropzone = document.getElementById("csv-dropzone");
    const fileInput = document.getElementById("csv-file-input");
    const btnSelectFile = document.getElementById("btn-select-file");

    btnSelectFile.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleCsvFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleCsvFile(e.target.files[0]);
        }
    });

    // Reset Profile Event
    const btnResetProfile = document.getElementById("btn-reset-profile");
    if (btnResetProfile) {
        btnResetProfile.addEventListener("click", () => {
            state.tasteProfile = null;
            
            // Clear recommendation deduplication history
            localStorage.removeItem("musiccue_rec_history");
            
            // Show tabs again
            document.querySelector(".full-height-card .tabs").classList.remove("hidden");
            
            // Determine active tab and show it
            const activeTab = document.querySelector(".tab-btn.active").getAttribute("data-tab");
            document.getElementById(activeTab).classList.remove("hidden");
            
            // Hide summary
            document.getElementById("taste-profile-summary").classList.add("hidden");
            
            // Clear file input value
            document.getElementById("csv-file-input").value = "";
            
            showToast("画像已清除", "您现在可以重新上传文件或输入歌手，排重历史已重置", "info");
        });
    }

    // Quick mood scenario templates
    const templatePills = document.querySelectorAll(".pill-btn");
    const scenarioInput = document.getElementById("input-scenario");
    templatePills.forEach(btn => {
        btn.addEventListener("click", () => {
            scenarioInput.value = btn.getAttribute("data-text");
            showToast("已应用场景模板", "点击下方“开始生成”按钮以推荐新歌", "info");
        });
    });

    // Advanced setting exploring slider indicator update
    const tempSlider = document.getElementById("input-temp");
    if (tempSlider) {
        const tempLabel = tempSlider.previousElementSibling;
        tempSlider.addEventListener("input", (e) => {
            tempLabel.textContent = `AI 探索度 (${e.target.value})`;
        });
    }

    // Recommendation Engine Trigger
    document.getElementById("btn-generate").addEventListener("click", handleGenerateRecommendations);

    // Sync button logic
    const btnSync = document.getElementById("btn-sync");
    const modal = document.getElementById("shortcut-modal");
    const btnModalClose = document.getElementById("btn-modal-close");
    const btnModalCancel = document.getElementById("btn-modal-cancel");
    const btnConfirmSync = document.getElementById("btn-confirm-sync");

    btnSync.addEventListener("click", () => {
        if (state.resolvedTracks.length === 0) return;
        
        // If shortcut exists on user's Mac, perform instant sync (bypassing modal guide!)
        const shortcutExists = state.installedShortcuts.includes(state.shortcutName);
        if (shortcutExists) {
            handleSyncPlaylist();
        } else {
            // Otherwise, show tutorial wizard modal
            modal.classList.remove("hidden");
            modal.classList.add("active");
        }
    });

    const closeModal = () => {
        modal.classList.remove("active");
        modal.classList.add("hidden");
    };
    btnModalClose.addEventListener("click", closeModal);
    btnModalCancel.addEventListener("click", closeModal);

    btnConfirmSync.addEventListener("click", () => {
        closeModal();
        handleSyncPlaylist();
    });

    // Import shortcut button logic
    const btnImportShortcut = document.getElementById("btn-import-shortcut");
    if (btnImportShortcut) {
        btnImportShortcut.addEventListener("click", async () => {
            try {
                btnImportShortcut.disabled = true;
                const originalText = btnImportShortcut.innerHTML;
                btnImportShortcut.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i><span>正在打开安装界面...</span>`;
                if (window.lucide) lucide.createIcons();
                
                const response = await fetch("/api/install-shortcut", { method: "POST" });
                const result = await response.json();
                
                if (response.ok) {
                    showToast(result.message || "已打开快捷指令安装界面，请在系统弹窗中确认添加。", "success");
                } else {
                    showToast(result.detail || "一键导入失败，请双击 DMG 磁盘中的 MusicCue.shortcut 文件安装。", "error");
                }
                
                btnImportShortcut.innerHTML = originalText;
                if (window.lucide) lucide.createIcons();
            } catch (err) {
                showToast("连接服务失败，请双击 DMG 中的 MusicCue.shortcut 文件安装。", "error");
                btnImportShortcut.innerHTML = `<i data-lucide="download"></i><span>一键导入 MusicCue 快捷指令</span>`;
                if (window.lucide) lucide.createIcons();
            } finally {
                btnImportShortcut.disabled = false;
            }
        });
    }

    // Select All Checkbox
    const chkSelectAll = document.getElementById("chk-select-all");
    if (chkSelectAll) {
        chkSelectAll.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const checkboxes = document.querySelectorAll(".track-select-checkbox");
            checkboxes.forEach(cb => {
                cb.checked = checked;
                const card = cb.closest(".track-card");
                if (card) {
                    if (checked) {
                        card.classList.remove("unchecked");
                    } else {
                        card.classList.add("unchecked");
                    }
                }
            });
        });
    }

    // Error state retry trigger
    document.getElementById("btn-error-retry").addEventListener("click", handleGenerateRecommendations);

    // Bottom Player Event Listeners
    setupBottomPlayerEvents();
}

// Setup Player Bar Seekbar, Play/Pause, Volume events
function setupBottomPlayerEvents() {
    const globalPlayer = document.getElementById("global-preview-player");
    const btnPlay = document.getElementById("btn-player-play");
    const btnPrev = document.getElementById("btn-player-prev");
    const btnNext = document.getElementById("btn-player-next");
    const progressSlider = document.getElementById("player-progress");
    const progressBar = document.getElementById("player-progress-bar");
    const volumeSlider = document.getElementById("player-volume-slider");
    const volumeBar = document.getElementById("player-volume-progress");
    const btnVolume = document.getElementById("btn-player-volume");
    const btnClose = document.getElementById("btn-player-close");

    if (!globalPlayer) return;

    // Play/Pause button
    btnPlay.addEventListener("click", () => {
        if (state.playingTrackIndex === null) return;
        
        if (globalPlayer.paused) {
            globalPlayer.play().catch(err => console.error("Play failed:", err));
        } else {
            globalPlayer.pause();
        }
    });

    // Prev Button
    btnPrev.addEventListener("click", () => {
        if (state.playingTrackIndex === null) return;
        playPrevPreview();
    });

    // Next Button
    btnNext.addEventListener("click", () => {
        if (state.playingTrackIndex === null) return;
        playNextPreview(state.playingTrackIndex);
    });

    // Audio Play/Pause listeners to update player bar button visual states
    globalPlayer.addEventListener("play", () => {
        btnPlay.innerHTML = `<i data-lucide="pause" class="play-icon-main"></i>`;
        lucide.createIcons();
        
        // Update active card class
        const cards = document.querySelectorAll(".track-card");
        if (state.playingTrackIndex !== null && cards[state.playingTrackIndex]) {
            cards[state.playingTrackIndex].classList.add("playing");
            const playCardIcon = cards[state.playingTrackIndex].querySelector(".btn-play-preview i");
            if (playCardIcon) playCardIcon.setAttribute("data-lucide", "pause");
        }
        lucide.createIcons();
    });

    globalPlayer.addEventListener("pause", () => {
        btnPlay.innerHTML = `<i data-lucide="play" class="play-icon-main"></i>`;
        lucide.createIcons();
        
        // Update active card class
        const cards = document.querySelectorAll(".track-card");
        if (state.playingTrackIndex !== null && cards[state.playingTrackIndex]) {
            cards[state.playingTrackIndex].classList.remove("playing");
            const playCardIcon = cards[state.playingTrackIndex].querySelector(".btn-play-preview i");
            if (playCardIcon) playCardIcon.setAttribute("data-lucide", "play");
        }
        lucide.createIcons();
    });

    // Audio time update (seek thumb & bar fill progress)
    globalPlayer.addEventListener("timeupdate", () => {
        const current = globalPlayer.currentTime;
        const duration = globalPlayer.duration || 30; // Previews are generally 30 seconds
        
        document.getElementById("player-current-time").textContent = formatTime(current);
        
        const percent = (current / duration) * 100;
        progressSlider.value = current;
        progressSlider.max = duration;
        progressBar.style.width = `${percent}%`;
    });

    // Audio ends
    globalPlayer.addEventListener("ended", () => {
        progressBar.style.width = "0%";
        progressSlider.value = 0;
        document.getElementById("player-current-time").textContent = "0:00";
        
        // Autoplay next track preview
        playNextPreview(state.playingTrackIndex);
    });

    // Timeline scrubbing (seeking)
    progressSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        const duration = globalPlayer.duration || 30;
        const percent = (val / duration) * 100;
        progressBar.style.width = `${percent}%`;
        document.getElementById("player-current-time").textContent = formatTime(val);
    });

    progressSlider.addEventListener("change", (e) => {
        globalPlayer.currentTime = parseFloat(e.target.value);
    });

    // Volume scrubbing
    volumeSlider.value = state.volume;
    volumeBar.style.width = `${state.volume * 100}%`;
    
    volumeSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        globalPlayer.volume = val;
        state.volume = val;
        localStorage.setItem("musiccue_volume", val);
        saveBackendConfig({ volume: val });
        volumeBar.style.width = `${val * 100}%`;
        
        // Update speaker icon
        updateVolumeIcon(val);
    });

    // Volume mute button
    btnVolume.addEventListener("click", () => {
        if (globalPlayer.muted) {
            globalPlayer.muted = false;
            btnVolume.innerHTML = `<i data-lucide="volume-2" class="volume-icon"></i>`;
            volumeSlider.value = state.volume;
            volumeBar.style.width = `${state.volume * 100}%`;
        } else {
            globalPlayer.muted = true;
            btnVolume.innerHTML = `<i data-lucide="volume-x" class="volume-icon"></i>`;
            volumeSlider.value = 0;
            volumeBar.style.width = "0%";
        }
        lucide.createIcons();
    });

    // Close Player Bar
    btnClose.addEventListener("click", () => {
        stopPreviewAudio();
        document.getElementById("bottom-player").classList.remove("active");
    });
}

// Convert seconds to MM:SS format
function formatTime(secs) {
    if (isNaN(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

// Update speaker icon according to volume level
function updateVolumeIcon(val) {
    const btnVolume = document.getElementById("btn-player-volume");
    if (!btnVolume) return;
    
    let icon = "volume-2";
    if (val === 0) icon = "volume-x";
    else if (val < 0.3) icon = "volume";
    else if (val < 0.7) icon = "volume-1";
    
    btnVolume.innerHTML = `<i data-lucide="${icon}" class="volume-icon"></i>`;
    lucide.createIcons();
}

// Handle XML/CSV File Upload & Analysis
async function handleCsvFile(file) {
    const defaultContent = document.getElementById("dropzone-default-content");
    const loaderContent = document.getElementById("dropzone-loader-content");
    
    // Show uploading visual spinner
    defaultContent.classList.add("hidden");
    loaderContent.classList.remove("hidden");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/api/parse-file", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "分析文件失败");
        }

        const data = await response.json();
        state.tasteProfile = data;

        // Render profile summary tags
        renderTasteProfile(data);
        showToast("导入成功", `成功分析 ${data.counts.totalPlays} 次历史听歌记录`, "success");
        
        // Hide loader and reset visual state
        defaultContent.classList.remove("hidden");
        loaderContent.classList.add("hidden");

    } catch (error) {
        console.error(error);
        showToast("导入文件失败", error.message, "error");
        // Restore default state
        defaultContent.classList.remove("hidden");
        loaderContent.classList.add("hidden");
    }
}

// Render the parsed taste tags
function renderTasteProfile(data) {
    // Hide upload UI elements to reclaim vertical space
    document.querySelector(".full-height-card .tabs").classList.add("hidden");
    document.getElementById("tab-csv").classList.add("hidden");
    document.getElementById("tab-manual").classList.add("hidden");

    const summaryDiv = document.getElementById("taste-profile-summary");
    summaryDiv.classList.remove("hidden");

    document.getElementById("stat-artists-count").textContent = data.counts.artists;
    document.getElementById("stat-tracks-count").textContent = data.counts.tracks;
    document.getElementById("stat-plays-count").textContent = data.counts.totalPlays;

    // Render Artist Tags
    const artistsContainer = document.getElementById("profile-artists-tags");
    artistsContainer.innerHTML = "";
    data.topArtists.slice(0, 10).forEach(artist => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = artist;
        artistsContainer.appendChild(tag);
    });

    // Render Genre Tags
    const genresContainer = document.getElementById("profile-genres-tags");
    genresContainer.innerHTML = "";
    data.topGenres.slice(0, 8).forEach(genre => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = genre;
        genresContainer.appendChild(tag);
    });
}

// Handle AI Recommendation Generation Flow
async function handleGenerateRecommendations() {
    const scenario = document.getElementById("input-scenario").value.trim();
    const region = document.getElementById("select-region").value;
    const limit = parseInt(document.getElementById("input-limit").value) || 15;
    const temperature = parseFloat(document.getElementById("input-temp").value) || 0.7;

    // Get active key and check it
    let activeKey = "";
    let providerName = "";
    if (state.activeProvider === "gemini") {
        activeKey = state.geminiApiKey;
        providerName = "Gemini";
    } else if (state.activeProvider === "openai") {
        activeKey = state.openaiApiKey;
        providerName = "OpenAI";
    } else if (state.activeProvider === "deepseek") {
        activeKey = state.deepseekApiKey;
        providerName = "DeepSeek";
    }

    if (!activeKey) {
        document.getElementById("settings-card").classList.remove("hidden");
        showToast("需要 API Key", `请在服务配置中填写 ${providerName} API Key`, "error");
        return;
    }

    if (!scenario) {
        showToast("输入场景描述", "请告诉 AI 您的听歌心境或场景", "info");
        return;
    }

    // Stop currently playing preview audio
    stopPreviewAudio();

    // Toggle loader
    const emptyState = document.getElementById("empty-state");
    const errorState = document.getElementById("error-state");
    const loader = document.getElementById("loader");
    const tracksList = document.getElementById("tracks-list");
    const btnSync = document.getElementById("btn-sync");
    const badge = document.getElementById("track-count-badge");
    const shortcutsBadge = document.getElementById("shortcuts-status");

    emptyState.classList.add("hidden");
    errorState.classList.add("hidden");
    tracksList.classList.add("hidden");
    btnSync.classList.add("hidden");
    badge.classList.add("hidden");
    shortcutsBadge.classList.add("hidden");
    
    loader.classList.remove("hidden");
    document.getElementById("loader-title").textContent = "正在生成音乐推荐...";
    document.getElementById("loader-subtitle").textContent = `[步骤 1/2] 正在向 ${providerName} 推荐引擎提交脑暴请求...`;

    // Determine taste input (manual or parsed XML/CSV)
    let topArtists = [];
    let topTracks = [];
    let topGenres = [];

    const activeTab = document.querySelector(".tab-btn.active").getAttribute("data-tab");
    if (activeTab === "tab-manual") {
        const manualInput = document.getElementById("input-manual-taste").value.trim();
        if (manualInput) {
            topArtists = manualInput.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
        }
    } else if (state.tasteProfile) {
        topArtists = state.tasteProfile.topArtists;
        topTracks = state.tasteProfile.topTracks;
        topGenres = state.tasteProfile.topGenres;
    }

    try {
        // Load recommendation history for deduplication
        const excludeTracks = JSON.parse(localStorage.getItem("musiccue_rec_history") || "[]");

        // Step 1: Request Recommendations
        const recPayload = {
            apiKey: activeKey,
            provider: state.activeProvider,
            scenario: scenario,
            region: region,
            limit: limit,
            temperature: temperature,
            topArtists: topArtists,
            topTracks: topTracks,
            topGenres: topGenres,
            excludeTracks: excludeTracks
        };

        const recResponse = await fetch("/api/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(recPayload)
        });

        if (!recResponse.ok) {
            const err = await recResponse.json();
            throw new Error(err.detail || "生成推荐失败");
        }

        const recData = await recResponse.json();
        state.recommendedTracks = recData.recommendations || [];

        if (state.recommendedTracks.length === 0) {
            throw new Error(`${providerName} 未能生成有效的歌曲推荐，请调整描述后重试。`);
        }

        // Add newly recommended songs to history (max 50)
        try {
            const newTrackStrings = state.recommendedTracks.map(t => `${t.title} - ${t.artist}`);
            let history = JSON.parse(localStorage.getItem("musiccue_rec_history") || "[]");
            // Merge, deduplicate, and limit to 50
            history = [...newTrackStrings, ...history];
            history = [...new Set(history)].slice(0, 50);
            localStorage.setItem("musiccue_rec_history", JSON.stringify(history));
        } catch (e) {
            console.error("Failed to update recommendation history:", e);
        }

        // Step 2: Query iTunes API for recommendations metadata
        document.getElementById("loader-title").textContent = "正在对接 Apple Music 曲库...";
        document.getElementById("loader-subtitle").textContent = `[步骤 2/2] 正在检索这 ${state.recommendedTracks.length} 首歌的试听、封面与链接...`;

        const searchResponse = await fetch(`/api/search?region=${region}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.recommendedTracks)
        });

        if (!searchResponse.ok) {
            throw new Error("对接 Apple Music 曲库搜索出错");
        }

        state.resolvedTracks = await searchResponse.json();

        // Render tracks results
        renderTracksResults();
        showToast("生成成功", `已获取并匹配这 ${state.resolvedTracks.length} 首歌的音源`, "success");

    } catch (error) {
        console.error(error);
        loader.classList.add("hidden");
        errorState.classList.remove("hidden");
        
        // Show specific error messages
        let friendlyMessage = error.message;
        if (friendlyMessage.includes("503") || friendlyMessage.includes("experience high demand")) {
            friendlyMessage = "Gemini API 临时繁忙（503 错误）。接口正承受高并发，我们重试 3 次均失败。请稍等几秒钟，点击下方“重新尝试”按钮。";
        } else if (friendlyMessage.includes("403") || friendlyMessage.includes("API key")) {
            friendlyMessage = "API 密钥无效或无权限（403 错误）。请检查右上角“服务配置”中的 Gemini API Key，确保无前后空格。";
        } else if (friendlyMessage.includes("Failed to fetch")) {
            friendlyMessage = "网络连接失败。请确保您的本地 Python 后端仍正常运行，且您的 Mac 能够访问外网。";
        }
        
        document.getElementById("error-message").textContent = friendlyMessage;
        showToast("推荐生成失败", "查看列表中的错误提示", "error");
    }
}

// Render Track Card List DOM
function renderTracksResults() {
    const loader = document.getElementById("loader");
    const tracksList = document.getElementById("tracks-list");
    const btnSync = document.getElementById("btn-sync");
    const badge = document.getElementById("track-count-badge");
    const selectAllContainer = document.getElementById("select-all-container");

    loader.classList.add("hidden");
    tracksList.classList.remove("hidden");
    
    // Reset and show select all
    if (selectAllContainer) {
        selectAllContainer.classList.remove("hidden");
        document.getElementById("chk-select-all").checked = true;
    }
    
    // Update Badge
    badge.textContent = `${state.resolvedTracks.length} 首`;
    badge.classList.remove("hidden");

    // Clear and build list
    tracksList.innerHTML = "";
    
    // Check if shortcuts are connected and update connection status badge
    updateShortcutsStatus();

    // Show sync button if there are resolved songs
    const resolvedCount = state.resolvedTracks.filter(t => t.resolved).length;
    if (resolvedCount > 0) {
        btnSync.classList.remove("hidden");
    }

    state.resolvedTracks.forEach((track, index) => {
        const card = document.createElement("div");
        card.className = `track-card ${!track.resolved ? 'unresolved' : ''}`;
        card.setAttribute("data-index", index);

        // Sub-badge for native characters title if translation was used
        let nativeTitleBadge = "";
        const originalTitle = track.original_title || "";
        if (originalTitle && originalTitle.toLowerCase() !== track.trackName.toLowerCase()) {
            nativeTitleBadge = `<span class="original-title-badge">(${originalTitle})</span>`;
        }

        // Action buttons (Preview & Apple Music)
        let actionButtons = "";
        if (track.resolved) {
            if (track.previewUrl) {
                actionButtons += `
                    <button class="btn-track-action btn-play-preview" onclick="togglePlayPreview(${index}, event)" title="播放试听">
                        <i data-lucide="play" style="width:18px; height:18px;"></i>
                    </button>
                `;
            }
            if (track.trackViewUrl) {
                actionButtons += `
                    <a href="${track.trackViewUrl}" target="_blank" class="btn-track-action btn-open-music" title="在 Apple Music 中打开">
                        <i data-lucide="external-link" style="width:18px; height:18px;"></i>
                    </a>
                `;
            }
        } else {
            actionButtons += `<span class="badge badge-unresolved">未匹配</span>`;
        }

        // Selection checkbox with custom markup
        let checkboxHtml = "";
        if (track.resolved) {
            checkboxHtml = `
                <label class="track-select-container">
                    <input type="checkbox" class="track-select-checkbox" checked data-index="${index}" onchange="toggleTrackSelect(${index}, this)"/>
                    <span class="checkbox-box"></span>
                </label>
            `;
        } else {
            checkboxHtml = `
                <label class="track-select-container" style="opacity: 0.3; cursor: not-allowed;">
                    <input type="checkbox" class="track-select-checkbox" disabled />
                    <span class="checkbox-box"></span>
                </label>
            `;
        }

        // Artwork URL, fallback if not resolved
        const artworkUrl = track.artworkUrl || "/static/placeholder.svg";

        card.innerHTML = `
            ${checkboxHtml}
            <div class="track-artwork-container" onclick="togglePlayPreview(${index}, event)">
                <img src="${artworkUrl}" alt="${track.trackName}" class="track-artwork" onerror="this.src='/static/placeholder.svg'"/>
                ${track.resolved && track.previewUrl ? `
                    <div class="artwork-overlay">
                        <i data-lucide="play" class="play-icon-mini"></i>
                        <div class="visualizer-mini">
                            <span class="v-bar"></span>
                            <span class="v-bar"></span>
                            <span class="v-bar"></span>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="track-info">
                <div class="track-title-row">
                    <span class="track-title">${track.trackName}</span>
                    ${nativeTitleBadge}
                </div>
                <div class="track-artist">${track.artistName || track.artist}</div>
                <div class="track-reason" title="${track.reason}">${track.reason}</div>
            </div>
            
            <div class="track-actions">
                ${actionButtons}
            </div>
        `;

        tracksList.appendChild(card);
    });

    lucide.createIcons();
}

// Toggle Playback for a song's preview
function togglePlayPreview(index, event) {
    if (event) event.stopPropagation();

    const track = state.resolvedTracks[index];
    if (!track || !track.resolved || !track.previewUrl) return;

    const player = document.getElementById("global-preview-player");
    const bottomPlayer = document.getElementById("bottom-player");

    // If clicking the currently playing track, pause it
    if (state.playingTrackIndex === index) {
        if (player.paused) {
            player.play().catch(e => console.error(e));
        } else {
            player.pause();
        }
        return;
    }

    // Stop existing audio first
    stopPreviewAudio();

    // Set playing track index state
    state.playingTrackIndex = index;

    // Load metadata into Bottom Player bar
    document.getElementById("player-artwork").src = track.artworkUrl || "/static/placeholder.svg";
    document.getElementById("player-title").textContent = track.trackName;
    document.getElementById("player-artist").textContent = track.artistName || track.artist;

    const nativeTitleBadge = document.getElementById("player-native-title");
    const originalTitle = track.original_title || "";
    if (originalTitle && originalTitle.toLowerCase() !== track.trackName.toLowerCase()) {
        nativeTitleBadge.textContent = `(${originalTitle})`;
        nativeTitleBadge.classList.remove("hidden");
    } else {
        nativeTitleBadge.textContent = "";
        nativeTitleBadge.classList.add("hidden");
    }

    // Slide bottom player up
    bottomPlayer.classList.add("active");

    // Load source and play
    player.src = track.previewUrl;
    player.play()
        .then(() => {
            // Volume is handled globally
            updateVolumeIcon(player.volume);
        })
        .catch(err => {
            console.error("Audio playback error:", err);
            showToast("播放试听失败", "该预览音源链接不可用", "error");
            stopPreviewAudio();
        });
}

// Stop preview playback and reset cards UI states
function stopPreviewAudio() {
    const player = document.getElementById("global-preview-player");
    if (!player) return;
    
    player.pause();
    
    // Remove playing class from previous playing card
    const playingCard = document.querySelector(".track-card.playing");
    if (playingCard) {
        playingCard.classList.remove("playing");
        const playBtn = playingCard.querySelector(".btn-play-preview i");
        if (playBtn) playBtn.setAttribute("data-lucide", "play");
    }

    state.playingTrackIndex = null;
    lucide.createIcons();
}

// Play Next Preview sequentially
function playNextPreview(currentIndex) {
    let nextIndex = -1;
    
    // Look for the next checked, resolved song in the list
    for (let i = currentIndex + 1; i < state.resolvedTracks.length; i++) {
        const track = state.resolvedTracks[i];
        const cards = document.querySelectorAll(".track-card");
        const card = cards[i];
        const isChecked = card && !card.classList.contains("unchecked");
        
        if (track && track.resolved && track.previewUrl && isChecked) {
            nextIndex = i;
            break;
        }
    }
    
    if (nextIndex !== -1) {
        togglePlayPreview(nextIndex);
    } else {
        // No more tracks, keep active playing index null but don't slide player down
        stopPreviewAudio();
    }
}

// Play Previous Preview sequentially
function playPrevPreview() {
    if (state.playingTrackIndex === null) return;
    
    let prevIndex = -1;
    for (let i = state.playingTrackIndex - 1; i >= 0; i--) {
        const track = state.resolvedTracks[i];
        const cards = document.querySelectorAll(".track-card");
        const card = cards[i];
        const isChecked = card && !card.classList.contains("unchecked");
        
        if (track && track.resolved && track.previewUrl && isChecked) {
            prevIndex = i;
            break;
        }
    }
    
    if (prevIndex !== -1) {
        togglePlayPreview(prevIndex);
    }
}

// Sync playlist via macOS Shortcut
async function handleSyncPlaylist() {
    const playlistName = state.shortcutName || "MusicCue";
    const syncButton = document.getElementById("btn-sync");
    
    // Disable button and show spinner
    const originalContent = syncButton.innerHTML;
    syncButton.disabled = true;
    syncButton.innerHTML = `<div class="loader-spinner" style="width:16px; height:16px; border-width:2px; display:inline-block; margin-right:8px; margin-bottom:0; filter:none;"></div> 正在同步...`;

    // Filter checked boxes and build sync payload
    const checkedBoxes = document.querySelectorAll(".track-select-checkbox:checked");
    const indices = Array.from(checkedBoxes).map(cb => parseInt(cb.getAttribute("data-index")));
    const tracksToSync = indices
        .map(idx => state.resolvedTracks[idx])
        .filter(t => t.resolved)
        .map(t => `${t.trackName} - ${t.artistName}`);

    if (tracksToSync.length === 0) {
        showToast("同步已取消", "请勾选至少一首匹配成功的歌曲进行同步！", "info");
        syncButton.disabled = false;
        syncButton.innerHTML = originalContent;
        return;
    }

    showToast("同步中", `正在启动 macOS 快捷指令 [${playlistName}] 同步这 ${tracksToSync.length} 首歌...`, "info");

    try {
        const response = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                playlistName: playlistName,
                tracks: tracksToSync
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "同步服务调用失败");
        }

        showToast("同步成功！", `已运行快捷指令 [${playlistName}] 将歌曲插入至 Apple Music “接着播放”。`, "success");
        
        // Re-query installed shortcuts list in background
        fetchInstalledShortcuts();

    } catch (error) {
        console.error(error);
        showToast("同步失败", error.message, "error");
    } finally {
        syncButton.disabled = false;
        syncButton.innerHTML = originalContent;
        lucide.createIcons();
    }
}

// Update API Status Badge
function updateApiStatusBadge() {
    const badge = document.getElementById("api-status-badge");
    if (!badge) return;
    
    let keyConfigured = false;
    if (state.activeProvider === "gemini" && state.geminiApiKey) {
        keyConfigured = true;
    } else if (state.activeProvider === "openai" && state.openaiApiKey) {
        keyConfigured = true;
    } else if (state.activeProvider === "deepseek" && state.deepseekApiKey) {
        keyConfigured = true;
    }

    const text = badge.querySelector(".badge-text");
    if (keyConfigured) {
        badge.className = "badge-status badge-resolved";
        text.textContent = "Key 已配置";
    } else {
        badge.className = "badge-status badge-unresolved";
        text.textContent = "Key 未配置";
    }
}

// Toggle individual track checkbox selection
function toggleTrackSelect(index, checkbox) {
    const card = checkbox.closest(".track-card");
    if (card) {
        if (checkbox.checked) {
            card.classList.remove("unchecked");
        } else {
            card.classList.add("unchecked");
            // If the song being unchecked is currently playing in preview, stop it
            if (state.playingTrackIndex === index) {
                stopPreviewAudio();
            }
        }
    }
    
    // Update "Select All" checkbox state
    const checkboxes = document.querySelectorAll(".track-select-checkbox");
    const total = checkboxes.length;
    const checked = document.querySelectorAll(".track-select-checkbox:checked").length;
    const chkSelectAll = document.getElementById("chk-select-all");
    
    if (chkSelectAll) {
        chkSelectAll.checked = (total === checked);
    }
}
