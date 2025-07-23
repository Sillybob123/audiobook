// Global variables
let bookData = null;
let currentChapter = 0;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let voices = [];
let isPlaying = false;
let audioChunks = [];
let mediaRecorder = null;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const controlsSection = document.getElementById('controlsSection');
const bookTitle = document.getElementById('bookTitle');
const voiceSelect = document.getElementById('voiceSelect');
const rateSlider = document.getElementById('rateSlider');
const rateValue = document.getElementById('rateValue');
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const chapterSelect = document.getElementById('chapterSelect');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const textPreview = document.getElementById('textPreview');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadVoices();
    setupEventListeners();
});

// Load available voices
function loadVoices() {
    voices = speechSynthesis.getVoices();
    
    if (voices.length === 0) {
        speechSynthesis.addEventListener('voiceschanged', () => {
            voices = speechSynthesis.getVoices();
            populateVoiceList();
        });
    } else {
        populateVoiceList();
    }
}

function populateVoiceList() {
    voiceSelect.innerHTML = '';
    
    // Filter for English voices and prioritize British/UK voices
    const englishVoices = voices.filter(voice => voice.lang.includes('en'));
    const britishVoices = englishVoices.filter(voice => 
        voice.lang.includes('GB') || voice.lang.includes('UK') || 
        voice.name.toLowerCase().includes('british') ||
        voice.name.toLowerCase().includes('daniel') // Daniel is often a good British voice
    );
    
    // Add British voices first
    britishVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voices.indexOf(voice);
        option.textContent = `${voice.name} (${voice.lang}) ${voice.name.toLowerCase().includes('daniel') ? '⭐' : ''}`;
        voiceSelect. appendChild(option);
    });
    
    // Add separator if there are British voices
    if (britishVoices.length > 0 && englishVoices.length > britishVoices.length) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '─────────────';
        voiceSelect.appendChild(separator);
    }
    
    // Add other English voices
    englishVoices.forEach(voice => {
        if (!britishVoices.includes(voice)) {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.epub')) {
            handleFile(file);
        }
    });
    
    // Controls
    rateSlider.addEventListener('input', (e) => {
        rateValue.textContent = e.target.value + 'x';
    });
    
    pitchSlider.addEventListener('input', (e) => {
        pitchValue.textContent = e.target.value;
    });
    
    chapterSelect.addEventListener('change', (e) => {
        currentChapter = parseInt(e.target.value);
        updateTextPreview();
    });
    
    playBtn.addEventListener('click', playAudio);
    pauseBtn.addEventListener('click', pauseAudio);
    stopBtn.addEventListener('click', stopAudio);
    downloadBtn.addEventListener('click', downloadAudio);
}

// File handling
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.epub')) {
        handleFile(file);
    }
}

async function handleFile(file) {
    try {
        progressText.textContent = 'Loading EPUB file...';
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Parse EPUB structure
        bookData = await parseEPUB(zip);
        
        // Update UI
        bookTitle.textContent = bookData.title || file.name.replace('.epub', '');
        populateChapterList();
        updateTextPreview();
        
        // Show controls
        controlsSection.style.display = 'block';
        progressText.textContent = 'Ready to play';
        
    } catch (error) {
        console.error('Error processing EPUB:', error);
        alert('Error processing EPUB file. Please try another file.');
    }
}

async function parseEPUB(zip) {
    const parser = new DOMParser();
    const textContent = [];
    let title = 'Unknown Book';
    
    // Try to find OPF file
    const opfFile = Object.keys(zip.files).find(name => name.endsWith('.opf'));
    
    if (opfFile) {
        const opfContent = await zip.files[opfFile].async('string');
        const opfDoc = parser.parseFromString(opfContent, 'text/xml');
        
        // Get title
        const titleElement = opfDoc.querySelector('title');
        if (titleElement) {
            title = titleElement.textContent;
        }
    }
    
    // Extract text from HTML/XHTML files
    const htmlFiles = Object.keys(zip.files)
        .filter(name => name.endsWith('.html') || name.endsWith('.xhtml'))
        .sort();
    
    for (const fileName of htmlFiles) {
        const content = await zip.files[fileName].async('string');
        const doc = parser.parseFromString(content, 'text/html');
        
        // Remove scripts and styles
        doc.querySelectorAll('script, style').forEach(el => el.remove());
        
        // Get text content
        const bodyText = doc.body ? doc.body.textContent : doc.documentElement.textContent;
        const cleanText = bodyText.replace(/\s+/g, ' ').trim();
        
        if (cleanText.length > 50) { // Only add substantial content
            textContent.push({
                title: `Chapter ${textContent.length + 1}`,
                text: cleanText
            });
        }
    }
    
    return {
        title,
        chapters: textContent
    };
}

function populateChapterList() {
    chapterSelect.innerHTML = '';
    
    bookData.chapters.forEach((chapter, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = chapter.title;
        chapterSelect.appendChild(option);
    });
}

function updateTextPreview() {
    if (bookData && bookData.chapters[currentChapter]) {
        textPreview.textContent = bookData.chapters[currentChapter].text.substring(0, 500) + '...';
    }
}

// Audio playback
function playAudio() {
    if (!bookData || !bookData.chapters[currentChapter]) return;
    
    const text = bookData.chapters[currentChapter].text;
    currentUtterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    const selectedVoiceIndex = parseInt(voiceSelect.value);
    if (voices[selectedVoiceIndex]) {
        currentUtterance.voice = voices[selectedVoiceIndex];
    }
    
    // Set parameters for David Attenborough-like voice
    currentUtterance.rate = parseFloat(rateSlider.value);
    currentUtterance.pitch = parseFloat(pitchSlider.value);
    currentUtterance.volume = 1;
    
    // Event handlers
    currentUtterance.onstart = () => {
        isPlaying = true;
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        progressText.textContent = 'Playing...';
    };
    
    currentUtterance.onend = () => {
        isPlaying = false;
        playBtn.style.display = 'inline-flex';
        pauseBtn.style.display = 'none';
        progressText.textContent = 'Finished';
        progressFill.style.width = '100%';
    };
    
    currentUtterance.onpause = () => {
        playBtn.style.display = 'inline-flex';
        pauseBtn.style.display = 'none';
        progressText.textContent = 'Paused';
    };
    
    currentUtterance.onresume = () => {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        progressText.textContent = 'Playing...';
    };
    
    // Track progress
    let charIndex = 0;
    currentUtterance.onboundary = (event) => {
        if (event.name === 'word') {
            charIndex = event.charIndex;
            const progress = (charIndex / text.length) * 100;
            progressFill.style.width = progress + '%';
        }
    };
    
    speechSynthesis.speak(currentUtterance);
}

function pauseAudio() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
    } else if (speechSynthesis.paused) {
        speechSynthesis.resume();
    }
}

function stopAudio() {
    speechSynthesis.cancel();
    isPlaying = false;
    playBtn.style.display = 'inline-flex';
    pauseBtn.style.display = 'none';
    progressFill.style.width = '0%';
    progressText.textContent = 'Stopped';
}

// Download functionality
async function downloadAudio() {
    if (!bookData || !bookData.chapters[currentChapter]) return;
    
    alert('Note: Direct audio download is limited in browsers. The audio will play and you can use your system\'s audio recording tools to capture it. Alternatively, you can use the browser\'s built-in save functionality if available.');
    
    // Create a blob URL for the text content
    const text = bookData.chapters[currentChapter].text;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create download link for the text
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bookTitle.textContent} - Chapter ${currentChapter + 1}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
