// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQCpOS0--40d1K8dj6awTqcgayWD7vPL5cqG0PzepC8VkC4v6eSnLsm-c0u3bBwGVK/exec";
const BASE_URL = "https://pub-2bae190ae9ee4b64bc2e504fd849c9bb.r2.dev/v2_clips/";
const TOTAL_CLIPS = 282;

let allAnnotations = []; // Master list loaded from backend
let filteredClips = [];  // Currently active subset
let activeIndex = 0;     // Pointer index in filteredClips

// Format 0-based index to 3-digit filename (0 -> "clip_001.mp4")
function getClipFilename(index) {
  const numStr = String(index + 1).padStart(3, '0');
  return `clip_${numStr}.mp4`;
}

// Parse input string (handles "42", "042", "clip_042.mp4", or "?clip=42")
function parseClipNumber(input) {
  if (!input) return null;
  const match = String(input).match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (num >= 1 && num <= TOTAL_CLIPS) {
      return num - 1; // Convert 1-based number to 0-based array index
    }
  }
  return null;
}

// ==========================================
// 2. FILTERING & SEARCH
// ==========================================
function initFilter() {
  filteredClips = [...allAnnotations];
}

function showIncludeClip(clip, query, showUnlabelledOnly) {
  const labelText = (clip.description || clip.label || '').trim();
  const isUnlabelled = labelText === '' || labelText.toLowerCase() === 'unlabelled';

  if (showUnlabelledOnly && !isUnlabelled) return false;
  if (query !== '' && !labelText.toLowerCase().includes(query)) return false;

  return true;
}
/**
 * Evaluates both the search query AND the "Unlabelled Only" checkbox.
 */
function applyFilters(resetIndex = true) {
  const searchEl = document.getElementById('labelSearch');
  const unlabelledEl = document.getElementById('unlabelledOnly');

  const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const showUnlabelledOnly = unlabelledEl ? unlabelledEl.checked : false;

  // Build a lookup set of filenames that have at least one valid annotation
  const annotatedFilenames = new Set(
    allAnnotations
      .filter(item => (item.description || item.label || '').trim() !== '')
      .map(item => item.clipFilename || item.filename)
  );

  // Filter across all 282 possible clips (1 to TOTAL_CLIPS)
  filteredClips = [];

  for (let i = 0; i < TOTAL_CLIPS; i++) {
    const clipFilename = getClipFilename(i);
    const isAnnotated = annotatedFilenames.has(clipFilename);
    const isUnlabelled = !isAnnotated;

    // 1. Evaluate 'Unlabelled Only' filter
    if (showUnlabelledOnly && !isUnlabelled) {
      continue;
    }

    // 2. Evaluate Text Search query
    if (query !== '') {
      // Find matching text in existing annotations for this clip
      const matchingAnnotations = allAnnotations.filter(item => {
        const itemFile = item.clipFilename || item.filename;
        const itemDesc = (item.description || item.label || '').toLowerCase();
        return itemFile === clipFilename && itemDesc.includes(query);
      });

      if (matchingAnnotations.length === 0) {
        continue; // Skip if search text isn't found in this clip's labels
      }
    }

    // Clip passed all active filters
    filteredClips.push({
      clipFilename: clipFilename,
      description: isUnlabelled ? '' : 'Annotated'
    });
  }

  if (resetIndex) {
    activeIndex = 0;
  }

  updateSearchUI();

  if (filteredClips.length === 0) {
    showNoResultsMessage();
  } else {
    // Clear any previous "No matching clips" message when results exist
    const displayEl = document.getElementById('clipLabelDisplay');
    if (displayEl) displayEl.textContent = '';
    
    loadCurrentClip();
  }
}

// NEW
function showNoResultsMessage() {
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = "";
  }
  const displayEl = document.getElementById('clipLabelDisplay');
  if (displayEl) displayEl.textContent = "No matching clips found";
  
  const indexWidget = document.getElementById('clipIndexDisplay');
  if (indexWidget) indexWidget.textContent = `0 of ${TOTAL_CLIPS} clips`;
}

function updateSearchUI() {
  const countSpan = document.getElementById('searchCount');
  if (countSpan) {
    countSpan.textContent = `Showing ${filteredClips.length} of ${allAnnotations.length} clips`;
  }
}

// ==========================================
// 3. CORE PLAYBACK & UI UPDATES
// ==========================================
function loadCurrentClip() {
  if (!filteredClips || filteredClips.length === 0) {
    showNoResultsMessage();
    return;
  }

  // 1. Get active clip object
  const currentClip = filteredClips[activeIndex];
  const currentFilename = currentClip.clipFilename || getClipFilename(activeIndex);

  // 2. Derive master 1-based index safely
  let masterIndex = allAnnotations.findIndex(c => c.clipFilename === currentFilename) + 1;

  // Fallback: If not found in allAnnotations by exact name, parse from "clip_XXX.mp4"
  if (masterIndex <= 0) {
    const match = currentFilename.match(/\d+/);
    masterIndex = match ? parseInt(match[0], 10) : (activeIndex + 1);
  }

  // 3. Update URL with active clip and current filter states
  const url = new URL(window.location.href);
  url.searchParams.set('clip', masterIndex);

  const searchInput = document.getElementById('labelSearch')?.value.trim();
  const unlabelledOnly = document.getElementById('unlabelledOnly')?.checked;

  if (searchInput) {
    url.searchParams.set('search', searchInput);
  } else {
    url.searchParams.delete('search');
  }

  if (unlabelledOnly) {
    url.searchParams.set('unlabelled', '1');
  } else {
    url.searchParams.delete('unlabelled');
  }

  // Push new state to address bar
  window.history.replaceState({}, '', url.toString());

  // 4. Update UI labels & counters
  const clipTitle = document.getElementById("clipTitle");
  if (clipTitle) {
    clipTitle.textContent = `Clip ${masterIndex} of ${TOTAL_CLIPS} (${currentFilename})`;
  }

  const jumpInput = document.getElementById("jumpInput");
  if (jumpInput) {
    jumpInput.value = masterIndex;
  }

  const indexWidget = document.getElementById('clipIndexDisplay');
  if (indexWidget) {
    indexWidget.textContent = `Clip ${masterIndex} of ${TOTAL_CLIPS} (${activeIndex + 1}/${filteredClips.length} filtered)`;
  }

  // 5. Update Video Player
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = BASE_URL + currentFilename;
    videoPlayer.load();
    videoPlayer.currentTime = 0;

    const playPromise = videoPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("Auto-play prevented:", err);
        videoPlayer.controls = true;
      });
    }
  }

  // 6. Fetch and render annotations for this exact clip
  displayClipAnnotations(currentFilename);
}

function loadCurrentClip() {
  if (!filteredClips || filteredClips.length === 0) {
    showNoResultsMessage();
    return;
  }

  // 1. Get current clip from filtered array
  const currentClip = filteredClips[activeIndex];

  // 2. Find its 1-based index in the master array
  const masterIndex = allAnnotations.findIndex(c => c.clipFilename === currentClip.clipFilename) + 1;

  // 3. Update the UI index widget / counter display
  const indexWidget = document.getElementById('clipIndexDisplay');
  if (indexWidget) {
    indexWidget.textContent = `Clip ${masterIndex} of ${allAnnotations.length} (${activeIndex + 1}/${filteredClips.length} filtered)`;
  }

  const clipTitle = document.getElementById("clipTitle");
  if (clipTitle) {
    clipTitle.textContent = `Clip ${masterIndex} of ${TOTAL_CLIPS} (${currentClip.clipFilename})`;
  }

  const jumpInput = document.getElementById("jumpInput");
  if (jumpInput) {
    jumpInput.value = masterIndex;
  }

  // 4. Construct updated URL with clip number + active filter state
  const searchInput = document.getElementById('labelSearch')?.value.trim() || '';
  const unlabelledOnly = document.getElementById('unlabelledOnly')?.checked || false;

  const url = new URL(window.location.href);
  url.searchParams.set('clip', masterIndex);

  if (searchInput) {
    url.searchParams.set('search', searchInput);
  } else {
    url.searchParams.delete('search');
  }

  if (unlabelledOnly) {
    url.searchParams.set('unlabelled', '1');
  } else {
    url.searchParams.delete('unlabelled');
  }

  window.history.replaceState({}, '', url);

  // 5. Load video source
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = BASE_URL + currentClip.clipFilename;
    videoPlayer.load();
    videoPlayer.currentTime = 0;

    const playPromise = videoPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("Auto-play prevented:", err);
        videoPlayer.controls = true;
      });
    }
  }

  // Update displayed annotations list below player
  displayClipAnnotations(currentClip.clipFilename);
}

function nextClip() {
  if (filteredClips.length === 0) return;
  activeIndex = (activeIndex + 1) % filteredClips.length;
  loadCurrentClip();
}

function prevClip() {
  if (filteredClips.length === 0) return;
  activeIndex = (activeIndex - 1 + filteredClips.length) % filteredClips.length;
  loadCurrentClip();
}

function jumpToClipInput() {
  const inputVal = document.getElementById("jumpInput")?.value;
  const targetIndex = parseClipNumber(inputVal);

  if (targetIndex !== null) {
    const targetFilename = getClipFilename(targetIndex);
    const matchIndex = filteredClips.findIndex(c => c.clipFilename === targetFilename);

    if (matchIndex !== -1) {
      activeIndex = matchIndex;
      loadCurrentClip();
    } else {
      alert("That clip is currently hidden by your active filter.");
    }
  } else {
    alert(`Please enter a valid clip number between 1 and ${TOTAL_CLIPS}.`);
  }
}

// ==========================================
// 4. ANNOTATIONS & FORM SUBMISSION
// ==========================================
function fetchAnnotations() {
  const listEl = document.getElementById("annotationList");
  if (listEl) listEl.innerHTML = "<em>Loading existing annotations...</em>";

  return fetch(APPS_SCRIPT_URL)
    .then(response => response.json())
    .then(result => {
      if (result.status === "success" && Array.isArray(result.data)) {
        allAnnotations = result.data;
      } else {
        allAnnotations = generateFallbackMasterList();
      }
    })
    .catch(err => {
      console.warn("Could not fetch annotations, generating placeholder list:", err);
      allAnnotations = generateFallbackMasterList();
    });
}

// Generates 1..282 unlabelled items if spreadsheet is offline/empty
function generateFallbackMasterList() {
  const list = [];
  for (let i = 0; i < TOTAL_CLIPS; i++) {
    list.push({
      clipFilename: getClipFilename(i),
      description: "",
      userName: ""
    });
  }
  return list;
}

function displayClipAnnotations(currentFilename) {
  const listEl = document.getElementById("annotationList");
  if (!listEl) return;

  // Filter annotations matching this clip's filename
  const matches = allAnnotations.filter(item => {
    const itemFile = item.clipFilename || item.filename;
    const itemDesc = (item.description || item.label || '').trim();
    return itemFile === currentFilename && itemDesc !== '';
  });

  if (matches.length === 0) {
    listEl.innerHTML = "<span style='color: #28a745; font-weight: bold;'>Unannotated</span> — No entries for this clip yet.";
  } else {
    let html = `<ul style="margin: 0; padding-left: 20px;">`;
    matches.forEach(item => {
      const user = item.userName || item.user || "Anonymous";
      const desc = item.description || item.label || "";
      html += `<li style="margin-bottom: 4px;"><strong>${user}:</strong> ${desc}</li>`;
    });
    html += `</ul>`;
    listEl.innerHTML = html;
  }
}

function submitLabel(e) {
  e.preventDefault();

  if (filteredClips.length === 0) return;

  const currentClip = filteredClips[activeIndex];
  const submitBtn = e.target.querySelector("button[type='submit']");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  const userNameVal = document.getElementById("userName")?.value.trim() || "";
  const descriptionVal = document.getElementById("description")?.value.trim() || "";

  if (userNameVal) {
    localStorage.setItem("annotator_userName", userNameVal);
  }

  const payload = {
    timestamp: new Date().toISOString(),
    clipFilename: currentClip.clipFilename,
    userName: userNameVal,
    description: descriptionVal
  };

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save & Next Clip";
    }
    // Record newly added annotation locally
    allAnnotations.push(payload);

    // Clear description box for next clip
    const descField = document.getElementById("description");
    if (descField) descField.value = "";

    // Advance to next clip in filtered set
    nextClip();
  })
  .catch(err => {
    console.error("Submission Error:", err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save & Next Clip";
    }
    alert("Failed to save entry. Please check your network connection and try again.");
  });
}

// ==========================================
// 5. SETUP & INITIALIZATION
// ==========================================
function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    searchParam: urlParams.get('search') || '',
    unlabelledParam: urlParams.get('unlabelled') === '1',
    targetClipNum: parseInt(urlParams.get('clip'), 10)
  };
}

function applyUrlParamsToUI(params) {
  const searchInput = document.getElementById('labelSearch');
  if (searchInput) searchInput.value = params.searchParam;

  const unlabelledCheckbox = document.getElementById('unlabelledOnly');
  if (unlabelledCheckbox) unlabelledCheckbox.checked = params.unlabelledParam;
}

function restoreUsername() {
  const userField = document.getElementById("userName");
  if (userField) {
    userField.value = localStorage.getItem("annotator_userName") || "";
    userField.addEventListener("input", function() {
      localStorage.setItem("annotator_userName", this.value);
    });
  }
}

function initEventListeners() {
  const jumpInput = document.getElementById("jumpInput");
  if (jumpInput) {
    jumpInput.addEventListener("keypress", function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpToClipInput();
      }
    });
  }

  const labelForm = document.getElementById("labelForm");
  if (labelForm) {
    labelForm.addEventListener("submit", submitLabel);
  }

  const searchInput = document.getElementById("labelSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => applyFilters(true));
  }

  const unlabelledCheckbox = document.getElementById("unlabelledOnly");
  if (unlabelledCheckbox) {
    unlabelledCheckbox.addEventListener("change", () => applyFilters(true));
  }
}

function initSystem() {
  initEventListeners();
  restoreUsername();

  const params = getUrlParams();
  applyUrlParamsToUI(params);

  // Fetch spreadsheet data first, THEN apply filters and load clip
  fetchAnnotations().then(() => {
    applyFilters(false); // Filter loaded annotations without resetting activeIndex

    // Handle deep-linked ?clip=N
    if (params.targetClipNum && params.targetClipNum > 0 && params.targetClipNum <= TOTAL_CLIPS) {
      const targetFilename = getClipFilename(params.targetClipNum - 1);
      const matchIndex = filteredClips.findIndex(c => c.clipFilename === targetFilename);
      if (matchIndex !== -1) {
        activeIndex = matchIndex;
      }
    }

    loadCurrentClip();
  });
}

window.addEventListener("DOMContentLoaded", initSystem);

