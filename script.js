// Get DOM elements
const textInput = document.getElementById('text-input');
const voiceSelect = document.getElementById('voice-select');
const rateSlider = document.getElementById('rate-slider');
const pitchSlider = document.getElementById('pitch-slider');
const volumeSlider = document.getElementById('volume-slider');
const rateValue = document.getElementById('rate-value');
const pitchValue = document.getElementById('pitch-value');
const volumeValue = document.getElementById('volume-value');
const charCount = document.getElementById('char-count');
const speakBtn = document.getElementById('speak-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const status = document.getElementById('status');
const textDisplay = document.getElementById('text-display');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const moon = document.getElementById('moon');
const starsContainer = document.getElementById('stars');
const pdfInput = document.getElementById('pdf-input');

// PDF.js worker (required for parsing PDFs in the browser)
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Initialize Speech Synthesis
const synth = window.speechSynthesis;
let currentUtterance = null;
let voices = [];
let words = [];
let currentWordIndex = -1;
let highlightInterval = null;

// Load voices when available
function loadVoices() {
    voices = synth.getVoices();
    
    // Clear existing options
    voiceSelect.innerHTML = '';
    
    // Add voices to select
    voices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });
    
    // Set default to first English voice if available
    const defaultVoice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
    if (defaultVoice) {
        const defaultIndex = voices.indexOf(defaultVoice);
        voiceSelect.value = defaultIndex;
    }
}

// Load voices immediately if available
if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
}
loadVoices();

// Update character count and text display
textInput.addEventListener('input', () => {
    const count = textInput.value.length;
    charCount.textContent = count.toLocaleString();
    updateTextDisplay();
});

// PDF upload: extract text and put in textarea
async function extractTextFromPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
        status.textContent = 'PDF library not loaded. Please refresh the page.';
        return;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const numPages = pdf.numPages;
    const textParts = [];
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        textParts.push(strings.join(' '));
    }
    return textParts.join('\n\n');
}

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
        status.textContent = 'Please select a PDF file.';
        return;
    }
    status.textContent = 'Reading PDF...';
    try {
        const text = await extractTextFromPDF(file);
        textInput.value = text;
        charCount.textContent = text.length.toLocaleString();
        updateTextDisplay();
        status.textContent = `Loaded PDF: ${file.name} (${text.length.toLocaleString()} characters)`;
    } catch (err) {
        status.textContent = 'Failed to read PDF: ' + (err.message || 'Unknown error');
    }
    pdfInput.value = '';
});

// Function to create word-highlighted display
function updateTextDisplay() {
    const text = textInput.value.trim();
    if (!text) {
        textDisplay.style.display = 'none';
        return;
    }
    
    // Split text into words while preserving spaces and punctuation
    words = text.match(/\S+|\s+/g) || [];
    
    // Create HTML with word spans
    const html = words.map((word, index) => {
        // Skip pure whitespace words for highlighting
        if (/^\s+$/.test(word)) {
            return `<span class="word whitespace">${escapeHtml(word)}</span>`;
        }
        return `<span class="word" data-index="${index}">${escapeHtml(word)}</span>`;
    }).join('');
    
    textDisplay.innerHTML = html;
    textDisplay.style.display = 'block';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Highlight word at index
function highlightWord(index) {
    // Remove highlight from previous word
    if (currentWordIndex >= 0) {
        const prevWordEl = document.querySelector(`.word[data-index="${currentWordIndex}"]`);
        if (prevWordEl && !prevWordEl.classList.contains('whitespace')) {
            prevWordEl.classList.remove('highlighted');
            prevWordEl.classList.add('spoken');
        }
    }
    
    // Mark words before current as spoken (if not already)
    for (let i = currentWordIndex + 1; i < index; i++) {
        const wordEl = document.querySelector(`.word[data-index="${i}"]`);
        if (wordEl && !wordEl.classList.contains('whitespace')) {
            wordEl.classList.add('spoken');
        }
    }
    
    // Highlight current word
    const currentWordEl = document.querySelector(`.word[data-index="${index}"]`);
    if (currentWordEl && !currentWordEl.classList.contains('whitespace')) {
        currentWordEl.classList.remove('spoken');
        currentWordEl.classList.add('highlighted');
        // Scroll into view (only if word is not visible)
        const rect = currentWordEl.getBoundingClientRect();
        const displayRect = textDisplay.getBoundingClientRect();
        if (rect.bottom > displayRect.bottom || rect.top < displayRect.top) {
            currentWordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    currentWordIndex = index;
}

// Clear all highlights
function clearHighlights() {
    document.querySelectorAll('.word').forEach(word => {
        word.classList.remove('highlighted', 'spoken');
    });
    currentWordIndex = -1;
    if (highlightInterval) {
        clearInterval(highlightInterval);
        highlightInterval = null;
    }
}

// Update slider value displays
rateSlider.addEventListener('input', (e) => {
    rateValue.textContent = parseFloat(e.target.value).toFixed(1);
});

pitchSlider.addEventListener('input', (e) => {
    pitchValue.textContent = parseFloat(e.target.value).toFixed(1);
});

volumeSlider.addEventListener('input', (e) => {
    volumeValue.textContent = parseFloat(e.target.value).toFixed(1);
});

// Speak function
function speak() {
    const text = textInput.value.trim();
    
    if (!text) {
        status.textContent = 'Please enter some text to speak.';
        status.classList.remove('active');
        return;
    }
    
    // Cancel any ongoing speech
    synth.cancel();
    clearHighlights();
    
    // Update text display
    updateTextDisplay();
    
    // Create new utterance
    currentUtterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    const selectedVoiceIndex = parseInt(voiceSelect.value);
    if (voices[selectedVoiceIndex]) {
        currentUtterance.voice = voices[selectedVoiceIndex];
    }
    
    // Set properties
    currentUtterance.rate = parseFloat(rateSlider.value);
    currentUtterance.pitch = parseFloat(pitchSlider.value);
    currentUtterance.volume = parseFloat(volumeSlider.value);
    
    // Reset word tracking
    currentWordIndex = -1;
    const nonWhitespaceWords = words.filter((w, i) => {
        const el = document.querySelector(`.word[data-index="${i}"]`);
        return el && !el.classList.contains('whitespace');
    });
    
    // Calculate timing for word highlighting (fallback if onboundary not supported)
    const rate = parseFloat(rateSlider.value);
    const avgCharsPerSecond = 150 * rate; // Average speaking rate
    let wordStartTime = 0;
    
    // Event handlers
    currentUtterance.onstart = () => {
        status.textContent = 'Speaking...';
        status.classList.add('active');
        speakBtn.disabled = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Start word highlighting
        const startTime = Date.now();
        let boundaryEventFired = false;
        let lastBoundaryTime = startTime;
        
        // Try to use onboundary event (better accuracy)
        currentUtterance.onboundary = (event) => {
            if (event.name === 'word') {
                boundaryEventFired = true;
                lastBoundaryTime = Date.now();
                
                // Clear timing interval if it exists (boundary events are more accurate)
                if (highlightInterval) {
                    clearInterval(highlightInterval);
                    highlightInterval = null;
                }
                
                // Find the word index based on character position
                const charIndex = event.charIndex;
                let charCount = 0;
                let foundIndex = -1;
                
                for (let i = 0; i < words.length; i++) {
                    if (charCount <= charIndex && charIndex < charCount + words[i].length) {
                        foundIndex = i;
                        break;
                    }
                    charCount += words[i].length;
                }
                
                if (foundIndex >= 0) {
                    const wordEl = document.querySelector(`.word[data-index="${foundIndex}"]`);
                    if (wordEl && !wordEl.classList.contains('whitespace')) {
                        highlightWord(foundIndex);
                    }
                }
            }
        };
        
        // Fallback: use timing-based highlighting if onboundary doesn't work
        // Check after 1 second if boundary events are firing
        setTimeout(() => {
            if (!boundaryEventFired && highlightInterval === null) {
                // onboundary not supported, use timing-based approach
                highlightInterval = setInterval(() => {
                    if (!synth.speaking || synth.paused) {
                        return;
                    }
                    
                    const elapsed = (Date.now() - startTime) / 1000;
                    let charCount = 0;
                    let targetIndex = -1;
                    
                    // Estimate which word should be highlighted based on elapsed time
                    // Skip whitespace-only words
                    for (let i = 0; i < words.length; i++) {
                        const word = words[i];
                        const wordLength = word.length;
                        
                        // Skip whitespace words
                        if (/^\s+$/.test(word)) {
                            charCount += wordLength;
                            continue;
                        }
                        
                        const wordStartTime = charCount / avgCharsPerSecond;
                        const wordEndTime = (charCount + wordLength) / avgCharsPerSecond;
                        
                        if (elapsed >= wordStartTime && elapsed < wordEndTime) {
                            targetIndex = i;
                            break;
                        }
                        
                        charCount += wordLength;
                    }
                    
                    if (targetIndex >= 0 && targetIndex !== currentWordIndex) {
                        const wordEl = document.querySelector(`.word[data-index="${targetIndex}"]`);
                        if (wordEl && !wordEl.classList.contains('whitespace')) {
                            highlightWord(targetIndex);
                        }
                    }
                }, 50); // Update every 50ms for smooth highlighting
            }
        }, 1000);
    };
    
    currentUtterance.onend = () => {
        status.textContent = 'Finished speaking.';
        status.classList.remove('active');
        speakBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
        currentUtterance = null;
        clearHighlights();
        
        // Mark all words as spoken
        document.querySelectorAll('.word').forEach(word => {
            if (!word.classList.contains('whitespace')) {
                word.classList.add('spoken');
            }
        });
    };
    
    currentUtterance.onerror = (event) => {
        status.textContent = `Error: ${event.error}`;
        status.classList.remove('active');
        speakBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
        currentUtterance = null;
        clearHighlights();
    };
    
    // Speak
    synth.speak(currentUtterance);
}

// Pause function
function pause() {
    if (synth.speaking && !synth.paused) {
        synth.pause();
        status.textContent = 'Paused.';
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
    }
}

// Resume function
function resume() {
    if (synth.speaking && synth.paused) {
        synth.resume();
        status.textContent = 'Speaking...';
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
    }
}

// Stop function
function stop() {
    synth.cancel();
    status.textContent = 'Stopped.';
    status.classList.remove('active');
    speakBtn.disabled = false;
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    stopBtn.disabled = true;
    currentUtterance = null;
    clearHighlights();
}

// Button event listeners
speakBtn.addEventListener('click', speak);
pauseBtn.addEventListener('click', pause);
resumeBtn.addEventListener('click', resume);
stopBtn.addEventListener('click', stop);

// Keyboard shortcuts
textInput.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to speak
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        speak();
    }
    
    // Escape to stop
    if (e.key === 'Escape') {
        stop();
    }
});

// Initialize character count
charCount.textContent = '0';

// Initialize text display on page load if there's existing text
if (textInput.value.trim()) {
    updateTextDisplay();
}

// Generate stars with random positions
function generateStars() {
    const numStars = 50;
    starsContainer.innerHTML = '';
    
    for (let i = 0; i < numStars; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        
        // Random positions
        const top = Math.random() * 100;
        const left = Math.random() * 100;
        const delay = Math.random() * 3;
        const size = Math.random() * 2 + 1;
        
        star.style.top = `${top}%`;
        star.style.left = `${left}%`;
        star.style.animationDelay = `${delay}s`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        
        starsContainer.appendChild(star);
    }
}

// Set moon to always show waxing crescent
function setMoonPhase() {
    moon.className = 'moon waxing-crescent';
}

// Toggle dark mode
function toggleDarkMode() {
    const wasDark = document.body.classList.contains('dark-mode');
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    document.body.classList.remove('dark-mode', 'force-light');
    
    if (!wasDark) {
        // Switching to dark
        document.body.classList.add('dark-mode');
        darkModeToggle.querySelector('.toggle-icon').textContent = '☀️';
        localStorage.setItem('darkMode', 'true');
        generateStars();
        setMoonPhase();
    } else {
        // Switching to light
        if (systemDark) {
            // System is dark, so force light mode
            document.body.classList.add('force-light');
        }
        // If system is light, no class needed - CSS handles it
        darkModeToggle.querySelector('.toggle-icon').textContent = '🌙';
        localStorage.setItem('darkMode', 'false');
    }
}

// Init: use saved preference or system preference
function initDarkMode() {
    const saved = localStorage.getItem('darkMode');
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    document.body.classList.remove('dark-mode', 'force-light');
    
    if (saved !== null) {
        // User has a saved preference
        const isDark = saved === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
            darkModeToggle.querySelector('.toggle-icon').textContent = '☀️';
            generateStars();
            setMoonPhase();
        } else {
            // User explicitly chose light - force it even if system is dark
            document.body.classList.add('force-light');
            darkModeToggle.querySelector('.toggle-icon').textContent = '🌙';
        }
    } else {
        // No saved preference - use system preference
        if (systemDark) {
            document.body.classList.add('dark-mode');
            darkModeToggle.querySelector('.toggle-icon').textContent = '☀️';
            generateStars();
            setMoonPhase();
        } else {
            // System is light - no class needed, CSS media query handles it
            darkModeToggle.querySelector('.toggle-icon').textContent = '🌙';
        }
    }
}

darkModeToggle.addEventListener('click', toggleDarkMode);
initDarkMode();
