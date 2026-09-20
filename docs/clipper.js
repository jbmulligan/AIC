
// Global State Variables
let filteredClips = [];  // Currently active subset
let activeIndex = 0;     // Pointer index in filteredClips

function initFilter(){
	filteredClips = [...allAnnotations];
}

function showIncludeClip(clip){
	const labelText = (clip.description || clip.label || '').trim();
	const isUnlabelled = labelText === '' ||
				labelText.toLowerCase() === 'unlabelled';

	if( showUnlabelledOnly && !isUnlabelled ){ return false; }
	if( query !== '' && !labelText.toLowerCase().includes(query) ){
		return false;
	}

	return true;
}

/**
 * Evaluates both the search query AND the "Unlabelled Only" checkbox.
 */

function applyFilters(resetIndex = true) {
	const userInput = document.getElementById('labelSearch').value;
	const query = userInput.trim().toLowerCase();
	const showUnlabelledOnly =
			document.getElementById('unlabelledOnly').checked;

	filteredClips = allAnnotations.filter(shouldIncludeClip);

	if (resetIndex) {
		activeIndex = 0;
	}

	updateSearchUI();

	if (filteredClips.length === 0) {
		showNoResultsMessage();
	}
	console.log("number of filtered clips: "+filteredClips.length);
}

/**
 * Updates status text and UI counts.
 */

function updateSearchUI() {
	const countSpan = document.getElementById('searchCount');
	if( countSpan ){
		countSpan.textContent =
	`Showing ${filteredClips.length} of ${allAnnotations.length} clips`;
	}
}

function loadCurrentClip() {
console.log("loadCurrentClip BEGIN");
	if (!filteredClips || filteredClips.length === 0) {
		showNoResultsMessage();
		return;
	}

	// 1. Get current clip from filtered array
console.log("loadCurrentClip: activeIndex = "+activeIndex);
	const currentClip = filteredClips[activeIndex];
console.log("loadCurrentClip: currentClip = "+currentClip);

	// 2. Find its 1-based index in the master allAnnotations array
	const masterIndex = allAnnotations.findIndex(
		c => c.filename === currentClip.clipFilename) + 1;

console.log("loadCurrentClip: masterIndex = "+masterIndex);

	// 3. Update the UI index widget / counter display
	// e.g., "Clip 14 of 282 (Filter result 2 of 5)"
	// adjust ID to match your HTML
	const indexWidget = document.getElementById('clipIndexDisplay');
	if (indexWidget) {
		indexWidget.textContent = `Clip ${masterIndex} of ${allAnnotations.length} (${activeIndex + 1}/${filteredClips.length} filtered)`;
	}

	// 4. Construct updated URL with clip number + active filter state
	const searchInput = document.getElementById('labelSearch').value.trim();
	const unlabelledOnly = document.getElementById('unlabelledOnly').checked;

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

	// 5. Push URL state without reloading the page
	window.history.replaceState({}, '', url);

	// 6. Load video source
	const videoPlayer = document.getElementById('videoPlayer');
	videoPlayer.src = BASE_URL + currentClip.clipFilename;
	videoPlayer.load();
	videoPlayer.play().catch(
		err => console.log("Auto-play prevented:", err));

	// Update label text display
	document.getElementById('clipLabelDisplay').textContent =
				currentClip.description || "Unlabelled";
}

/**
 * Navigation handlers
 */
function nextClip() {
	if (filteredClips.length === 0) return;
	activeIndex = (activeIndex + 1) % filteredClips.length;
	loadCurrentClip();
}

function prevClip() {
	if (filteredClips.length === 0) return;
	activeIndex = (activeIndex - 1 + filteredClips.length)
						% filteredClips.length;
	loadCurrentClip();
}

function showNoResultsMessage() {
	const videoPlayer = document.getElementById('videoPlayer');
	videoPlayer.pause();
	videoPlayer.src = "";
	document.getElementById('clipLabelDisplay').textContent =
						"No matching clips found";
}

// Helper: Checks if a clip index has existing annotations in the cache
function isClipAnnotated(clipIndex) {
	const filename = getClipFilename(clipIndex);
	return allAnnotations.some(item => item.clipFilename === filename);
}

// BUG?  do we need this if we are using filtering to detect unlabeled?
// Find next valid clip index based on "Unlabeled clips only" state
function getNextClipIndex(fromIndex) {
	const unlabeledOnly =
		document.getElementById("unlabeledOnlyToggle")?.checked;
	let idx = fromIndex + 1;

	while (idx < TOTAL_CLIPS) {
		if (!unlabeledOnly || !isClipAnnotated(idx)) {
			return idx;
		}
		idx++;
	}

	// Return last clip if no more unlabeled clips remain ahead
	return TOTAL_CLIPS - 1;
}

// Find previous valid clip index based on "Unlabeled clips only" state
function getPreviousClipIndex(fromIndex) {
	const unlabeledOnly = document.getElementById("unlabeledOnlyToggle")?.checked;
	let idx = fromIndex - 1;

	while (idx >= 0) {
		if (!unlabeledOnly || !isClipAnnotated(idx)) {
			return idx;
		}
		idx--;
	}

	// Return first clip if no prior unlabeled clips exist
	return 0;
}

// fetching existing annotations
let allAnnotations = []; // Cache for fetched spreadsheet data

// Fetch all existing annotations from Google Sheets
function fetchAnnotations() {
	const listEl = document.getElementById("annotationList");
	if (listEl) listEl.innerHTML = "<em>Loading existing annotations...</em>";

	fetch(APPS_SCRIPT_URL)
		.then(response => response.json())
		.then(result => {
			if (result.status === "success" && Array.isArray(result.data)) {
				allAnnotations = result.data;
	initFilter();
				displayClipAnnotations(currentIndex);
			}
		})
		.catch(err => {
			console.warn("Could not fetch annotations:", err);
			const listEl = document.getElementById("annotationList");
			if (listEl) listEl.innerHTML = "<span style='color: #888;'>Unable to load existing annotations.</span>";
		});
}

// Display existing annotations for the current clip
function displayClipAnnotations(clipIndex) {
	const listEl = document.getElementById("annotationList");
	if (!listEl) return;

	const clipNum = clipIndex + 1;
	const currentFilename = getClipFilename(clipIndex);

	// Match entries by clip number or filename
console.log("currentFilename = "+currentFilename);
	const matches = allAnnotations.filter(item => item.clipFilename === currentFilename);

	if (matches.length === 0) {
		listEl.innerHTML = "<span style='color: #28a745; font-weight: bold;'>Unannotated</span> — No entries for this clip yet.";
	} else {
		let html = `<ul style="margin: 0; padding-left: 20px;">`;
		matches.forEach(item => {
			const user = item.userName || "Anonymous";
			const desc = item.description ? item.description : "";
			html += `<style="margin-bottom: 4px;"><strong>${user}:</strong> ${desc}</li>`;
		});
		html += `</ul>`;
		listEl.innerHTML = html;
	}
}

	// ==========================================
	// 1. CONFIGURATION & STATE
	// ==========================================
	// Replace these with your actual Apps Script URL and GitHub Release URL base
		const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQCpOS0--40d1K8dj6awTqcgayWD7vPL5cqG0PzepC8VkC4v6eSnLsm-c0u3bBwGVK/exec";
	//const BASE_URL = "https://github.com/jbmulligan/AIC/releases/download/v1.0.0/";
	const BASE_URL = "https://pub-2bae190ae9ee4b64bc2e504fd849c9bb.r2.dev/v2_clips/";
	const TOTAL_CLIPS = 282;

	let currentIndex = 0; // Internal 0-based index (0 = clip_001.mp4)

	// Format index to 3-digit filename (0 -> "clip_001.mp4")
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
	// 2. CORE NAVIGATION & UI UPDATES
	// ==========================================
function loadClip(index) {
	currentIndex = index;
console.log("loadClip: currentIndex = "+currentIndex);
	const filename = getClipFilename(currentIndex);

	const videoPlayer = document.getElementById("videoPlayer");
	const clipTitle = document.getElementById("clipTitle");
	const jumpInput = document.getElementById("jumpInput");

	if (videoPlayer) {
		videoPlayer.pause();
		videoPlayer.src = BASE_URL + filename;
		videoPlayer.load(); // Force Safari to reset media decoder state
		videoPlayer.currentTime = 0;

		// Safely attempt to play and catch Safari autoplay restrictions
		const playPromise = videoPlayer.play();
		if (playPromise !== undefined) {
			playPromise.catch(error => {
				console.warn("Safari auto-play prevented:", error);
				// The controls attribute remains visible so the user can tap play manually if needed
		videoPlayer.controls = true;
			});
		}
	}

	if (clipTitle) clipTitle.textContent = `Clip ${currentIndex + 1} of ${TOTAL_CLIPS} (${filename})`;
	if (jumpInput) jumpInput.value = currentIndex + 1;

	// Preserve username across form resets using localStorage
	const labelForm = document.getElementById("labelForm");
	if (labelForm) {
		const savedUser = localStorage.getItem("annotator_userName") || "";
		labelForm.reset();

		const userField = document.getElementById("userName");
		if (userField) userField.value = savedUser;
	}
	// Update displayed annotations for this clip
	displayClipAnnotations(currentIndex);

	// Sync clean address bar URL (?clip=42)
	const newUrl = new URL(window.location);
	newUrl.searchParams.set('clip', currentIndex + 1);
	window.history.replaceState({}, '', newUrl);
}

function jumpToClipInput() {
	const inputVal = document.getElementById("jumpInput").value;
	const targetIndex = parseClipNumber(inputVal);

	if (targetIndex !== null) {
		loadClip(targetIndex);
	} else {
		alert(`Please enter a valid clip number between 1 and ${TOTAL_CLIPS}.`);
	}
}

// ==========================================
// 3. PAGE INITIALIZATION & SUBMIT HANDLER
// ==========================================

function afterPosting(){
	if (submitBtn) {
		submitBtn.disabled = false;
		submitBtn.textContent = "Save & Next Clip";
	}
	// remember this annotation in case we navigate back
	allAnnotations.push(payload);

	// Move to the next sequential clip
	const nextIdx = getNextClipIndex(currentIndex);

	if (nextIdx < TOTAL_CLIPS - 1) {
		loadClip(nextIdx);
	} else {
		alert("Congratulations! You have reached the final clip.");
	}
}

function postingErr(err){
	console.error("Submission Error:", err);
	if (submitBtn) {
		submitBtn.disabled = false;
		submitBtn.textContent = "Save & Next Clip";
	}
	alert("Failed to save entry. Please check your network connection and try again.");
}

function submitLabel(e) {
	e.preventDefault(); // Stop default browser page reload

	const currentClipName = getClipFilename(currentIndex);
	const submitBtn = labelForm.querySelector("button[type='submit']");

	if (submitBtn) {
		submitBtn.disabled = true;
		submitBtn.textContent = "Saving...";
	}

	const userNameVal = document.getElementById("userName") ? document.getElementById("userName").value : "";
	if (userNameVal) {
		localStorage.setItem("annotator_userName", userNameVal);
	}

	// Build data payload for Google Sheets
	const payload = {
		timestamp: new Date().toISOString(),
		clipFilename: currentClipName,
		//clipNumber: currentIndex + 1,	// not used in spreadsheet?
		// Collect form field values (ensure these IDs match your HTML form input IDs)
		userName: document.getElementById("userName").value.trim(),
		description:
		document.getElementById("description").value.trim()
	};

	// Post data to Google Apps Script Web App
	fetch(APPS_SCRIPT_URL, {
		method: "POST",
		mode: "no-cors",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload)
	})
	.then(afterPosting)
	.catch(postingErr);
}

function restoreUsername(){
	// Restore saved username on page load
	const userField = document.getElementById("userName");
	if (userField) {
		userField.value = localStorage.getItem("annotator_userName") || "";

		// Save name immediately if they edit it directly
		userField.addEventListener("input", function() {
			localStorage.setItem("annotator_userName", this.value);
		});
	}
}

// Set initial control values from URL parameters

// A. Check URL parameter on load (e.g. ?clip=150)
// Read initial query parameters from URL
function getUrlParams(){
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get('search') || '';
	const unlabelledParam = urlParams.get('unlabelled') === '1';
	const targetClipNum = parseInt(urlParams.get('clip'), 10);
}

// If a specific ?clip=N was in the URL, set activeIndex
// to point to that item within filteredClips
function setClipFromUrl(){
	if (targetClipNum && targetClipNum > 0 &&
			targetClipNum <= allAnnotations.length) {
		const targetClip = allAnnotations[targetClipNum - 1];
		const matchIndex = filteredClips.findIndex(
				c => c.filename === targetClip.filename);

		if (matchIndex !== -1) { activeIndex = matchIndex; }
	}
}

function getWidgetParams(){
	const searchInput = document.getElementById('labelSearch');
	if (searchInput) searchInput.value = searchParam;

	const unlabelledCheckbox =
			document.getElementById('unlabelledOnly');

	if( unlabelledCheckbox ){
		unlabelledCheckbox.checked = unlabelledParam;
	}
}

function initJumpBox(){
	// C. Setup Enter key listener for the Jump Box
	const jumpInput = document.getElementById("jumpInput");
	if (jumpInput) {
		jumpInput.addEventListener("keypress", function(e) {
			if (e.key === 'Enter') {
				e.preventDefault();
				jumpToClipInput();
			}
		});
	}
}

function initLabelSubmission(){

	// D. FORM SUBMISSION HANDLER (Google Sheets Sync)
	const labelForm = document.getElementById("labelForm");
	if (labelForm) {
		labelForm.addEventListener("submit", submitLabel );
	}
}

function initSystem(){
	// Fetch existing annotations from spreadsheet
	fetchAnnotations();

	getUrlParams();
	getWidgetParams();

	// Filter the clips based on loaded UI settings
	applyFilters(false); // Pass false to prevent auto-resetting activeIndex to 0

	setClipFromUrl();

	initJumpBox();

	initLabelSubmission();
	restoreUsername();

}

window.addEventListener("DOMContentLoaded", initSystem );

