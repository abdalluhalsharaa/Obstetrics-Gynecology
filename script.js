/* ============================================
   MEDICAL EXAM PRACTICE - MAIN JAVASCRIPT
   Modular, commented, and maintainable
   ============================================ */

// ============================================
// GLOBAL STATE
// ============================================
let allLectures = [];      // Parsed lectures data
let allYears = [];         // Parsed years data
let allQuestions = [];      // All questions combined for search
let currentExam = null;    // Current exam session state
let settings = {};         // User settings
let favorites = [];        // Favorite question IDs
let wrongQuestions = [];   // Wrong question IDs
let progress = {};         // Progress tracking

// Selection state
let selectedGroups = [];
let currentGroups = [];
let selectedMode = null;       // 'training' or 'exam'
let selectedDirection = null;  // 'oneway' or 'twoway'
let extraTime = 0;
let extraTimeAdded = false;    // Only allow adding once

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    loadProgress();
    loadFavorites();
    loadWrongQuestions();
    applySettings();
    await loadData();
    checkResumeExam();
    displayRandomQuote();
});

/**
 * Modification 5: Display a random quote under the logo
 */
function displayRandomQuote() {
    const quotes = [
        "لا توجد وصفة سحرية، ولا توجد طريقة ليس فيها العمل والتعب وبذل الجهد !",
        "الفشل ليس النهاية، بل هو خطوة ضرورية نحو القمة إذا تعلمت منه !",
        "العلم الذي تدرسه اليوم هو الأمل الذي ستمنحه لغيرك غداً !",
        "دراسة الطب هي ماراثون وليست سباقاً قصيراً؛ حافظ على أنفاسك وواصل التقدم !",
        "لا تنتظر الوقت المناسب، فالوقت لن يكون مثاليًا أبدًا. ابدأ من حيث تقف !"
        // أضف المزيد من النصوص هنا
    ];
    const quoteEl = document.getElementById('random-quote');
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteEl.textContent = quotes[randomIndex];
    }
}

// ============================================
// DATA LOADING AND PARSING
// ============================================

/**
 * Load both TXT files and parse them
 */
async function loadData() {
    try {
        const [lecturesRes, yearsRes] = await Promise.all([
            fetch('lectures.txt'),
            fetch('year.txt')
        ]);
        const lecturesText = await lecturesRes.text();
        const yearsText = await yearsRes.text();

        allLectures = parseFile(lecturesText, 'lecture');
        allYears = parseFile(yearsText, 'year');

        // Build combined question list for search
        allQuestions = [];
        allLectures.forEach(group => {
            group.questions.forEach(q => {
                q.source = 'lecture';
                q.groupName = group.name;
                allQuestions.push(q);
            });
        });
        allYears.forEach(group => {
            group.questions.forEach(q => {
                q.source = 'year';
                q.groupName = group.name;
                allQuestions.push(q);
            });
        });

        // Populate search filter
        populateSearchFilter();
    } catch (err) {
        console.error('Error loading data:', err);
        showToast('Error loading question data. Please check files.');
    }
}

/**
 * Parse a TXT file into groups of questions
 * @param {string} text - Raw file content
 * @param {string} type - 'lecture' or 'year'
 * @returns {Array} Array of group objects
 */
function parseFile(text, type) {
    const groups = [];
    const sections = text.split('/////').filter(s => s.trim());

    sections.forEach(section => {
        const lines = section.trim().split('\n');
        if (lines.length === 0) return;

        // First line is the group name
        const groupName = lines[0].trim();
        const questionsRaw = lines.slice(1).join('\n');

        // Split questions by ###
        const questionBlocks = questionsRaw.split('###').filter(q => q.trim());
        const questions = [];

        questionBlocks.forEach(block => {
            const q = parseQuestion(block.trim(), groupName);
            if (q) questions.push(q);
        });

        if (groupName && questions.length > 0) {
            groups.push({ name: groupName, type, questions });
        }
    });

    return groups;
}

/**
 * Parse a single question block into a structured object
 */
function parseQuestion(block, defaultBatch) {
    try {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 4) return null;

        let questionNumber = '';
        let questionText = '';
        let options = [];
        let correctAnswer = '';
        let explanation = '';
        let batchName = defaultBatch;
        let pageNumber = '';

        let i = 0;

        // Parse question number
        if (lines[i] && lines[i].match(/^Question\s+\d+/i)) {
            questionNumber = lines[i].replace(/^Question\s+/i, '').trim();
            i++;
        }

        // Parse question text
        let qTextLines = [];
        while (i < lines.length && !lines[i].match(/^[A-E]\)/)) {
            qTextLines.push(lines[i]);
            i++;
        }
        questionText = qTextLines.join(' ');

        // Parse options A to E
        while (i < lines.length && lines[i].match(/^[A-E]\)/)) {
            options.push(lines[i]);
            i++;
        }

        // Parse correct answer
        while (i < lines.length) {
            if (lines[i].match(/^Correct Answer:/i)) {
                correctAnswer = lines[i].replace(/^Correct Answer:\s*/i, '').trim();
                i++;
                break;
            }
            i++;
        }

        // Parse explanation
        let explanationLines = [];
        while (i < lines.length) {
            if (lines[i].match(/^Explanation:/i)) {
                explanationLines.push(lines[i].replace(/^Explanation:\s*/i, ''));
                i++;
                while (i < lines.length && !isMetadataLine(lines[i])) {
                    explanationLines.push(lines[i]);
                    i++;
                }
                break;
            }
            i++;
        }
        explanation = explanationLines.join(' ');

        // Parse metadata
        while (i < lines.length) {
            if (lines[i].match(/^P\d+/i)) {
                pageNumber = lines[i];
            } else if (lines[i].trim()) {
                batchName = lines[i];
            }
            i++;
        }

        const id = `${batchName}-Q${questionNumber}`.replace(/\s+/g, '-');

        return {
            id,
            number: questionNumber,
            text: questionText,
            options,
            correctAnswer,
            explanation,
            batchName,
            pageNumber,
            groupName: defaultBatch
        };
    } catch (err) {
        console.warn('Error parsing question block:', err);
        return null;
    }
}

/**
 * Check if a line is metadata
 */
function isMetadataLine(line) {
    if (line.match(/^P\d+/i)) return true;
    if (line.match(/^\d+(st|nd|rd|th)\s+Year/i)) return true;
    if (line.match(/^[A-Z].*-\s*.+/)) return true;
    return false;
}

// ============================================
// NAVIGATION AND SCREEN MANAGEMENT
// ============================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function goHome() {
    // Modification 1: Auto-reload on back to home to fix exam reset bug
    window.location.reload();
}

function openSection(section) {
    switch (section) {
        case 'lectures':
            showSelectionScreen(allLectures, 'Select Lectures');
            break;
        case 'years':
            showSelectionScreen(allYears, 'Select Year Batches');
            break;
        case 'wrong':
            openWrongQuestions();
            break;
        case 'favorites':
            openFavoriteQuestions();
            break;
        case 'search':
            showScreen('search-screen');
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
            break;
    }
}

// ============================================
// SELECTION SCREEN (Lectures / Years)
// ============================================

function resetSelectionState() {
    selectedGroups = [];
    currentGroups = [];
    selectedMode = null;
    selectedDirection = null;
    extraTime = 0;
    extraTimeAdded = false;
}

function showSelectionScreen(groups, title) {
    resetSelectionState();
    currentGroups = groups;
    showScreen('selection-screen');
    document.getElementById('selection-title').textContent = title;

    const list = document.getElementById('selection-list');
    list.innerHTML = '';

    groups.forEach((group, idx) => {
        const item = document.createElement('div');
        item.className = 'selection-item';
        item.innerHTML = `
            <input type="checkbox" id="group-${idx}" onchange="toggleGroupSelection(${idx})">
            <label for="group-${idx}">
                <strong>${group.name}</strong>
                <br><small style="color:var(--text-muted)">${group.questions.length} questions</small>
            </label>
        `;
        item.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = item.querySelector('input');
                cb.checked = !cb.checked;
                toggleGroupSelection(idx);
            }
        };
        list.appendChild(item);
    });

    // Reset footer
    document.getElementById('selection-footer').classList.add('hidden');
    document.getElementById('direction-selection').classList.add('hidden');
    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
}

function toggleGroupSelection(idx) {
    const existingIdx = selectedGroups.indexOf(idx);
    if (existingIdx > -1) {
        selectedGroups.splice(existingIdx, 1);
    } else {
        selectedGroups.push(idx);
    }
    updateSelectionFooter();
}

function updateSelectionFooter() {
    const footer = document.getElementById('selection-footer');
    const totalQuestions = selectedGroups.reduce((sum, idx) => sum + currentGroups[idx].questions.length, 0);

    if (selectedGroups.length > 0) {
        footer.classList.remove('hidden');
        document.getElementById('selected-count').textContent = `${totalQuestions} questions selected`;
        document.getElementById('question-count-input').max = totalQuestions;
        document.getElementById('question-count-input').value = totalQuestions;
        document.getElementById('max-questions-label').textContent = `/ ${totalQuestions}`;
    } else {
        footer.classList.add('hidden');
    }

    // Reset downstream selections
    selectedMode = null;
    selectedDirection = null;
    document.getElementById('direction-selection').classList.add('hidden');
    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
}

// ============================================
// MODE AND DIRECTION SELECTION
// ============================================

/**
 * Select exam mode (training or exam)
 */
function selectMode(mode) {
    selectedMode = mode;
    selectedDirection = null;
    extraTime = 0;
    extraTimeAdded = false;

    // Update UI
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.getElementById(mode === 'training' ? 'btn-training-mode' : 'btn-exam-mode').classList.add('active');

    // Show direction selection
    document.getElementById('direction-selection').classList.remove('hidden');
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));

    // Hide timer and start until direction is chosen
    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
}

/**
 * Select navigation direction (oneway or twoway)
 */
function selectDirection(direction) {
    selectedDirection = direction;

    // Update UI
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
    document.getElementById(direction === 'oneway' ? 'btn-oneway' : 'btn-twoway').classList.add('active');

    // Show timer options for exam mode
    if (selectedMode === 'exam') {
        const count = parseInt(document.getElementById('question-count-input').value) || 0;
        const baseTime = count; // 1 min per question
        document.getElementById('base-time-display').textContent = `${baseTime} min`;
        document.getElementById('extra-time-display').textContent = `+0 min`;
        document.getElementById('total-time-display').textContent = `${baseTime} min`;
        document.getElementById('timer-options').classList.remove('hidden');

        // Reset extra time button
        const btn = document.getElementById('btn-add-extra');
        btn.disabled = false;
        btn.textContent = '+ Add 5 Extra Minutes';
        extraTime = 0;
        extraTimeAdded = false;
    } else {
        document.getElementById('timer-options').classList.add('hidden');
    }

    // Show start button
    document.getElementById('start-section').classList.remove('hidden');
}

/**
 * Add 5 extra minutes (only once)
 */
function addExtraTime() {
    if (extraTimeAdded) return;

    extraTime = 5;
    extraTimeAdded = true;

    const count = parseInt(document.getElementById('question-count-input').value) || 0;
    const baseTime = count;

    document.getElementById('extra-time-display').textContent = `+5 min`;
    document.getElementById('total-time-display').textContent = `${baseTime + 5} min`;

    // Disable the button
    const btn = document.getElementById('btn-add-extra');
    btn.disabled = true;
    btn.textContent = '✓ Extra 5 Minutes Added';
}

/**
 * Confirm and start the exam
 */
function confirmStartExam() {
    if (!selectedMode || !selectedDirection) {
        showToast('Please select mode and direction');
        return;
    }

    const count = parseInt(document.getElementById('question-count-input').value);
    if (!count || count < 1) {
        showToast('Please enter a valid number of questions');
        return;
    }

    let questions = [];
    selectedGroups.forEach(idx => {
        questions = questions.concat(currentGroups[idx].questions);
    });

    // Shuffle and limit
    questions = shuffleArray(questions).slice(0, count);

    // Initialize exam state
    currentExam = {
        mode: selectedMode,
        direction: selectedDirection,
        questions,
        currentIndex: 0,
        answers: new Array(questions.length).fill(null),
        firstAnswers: new Array(questions.length).fill(null),
        startTime: Date.now(),
        totalTime: (questions.length + extraTime) * 60 * 1000,
        submitted: false,
        showAnswer: false
    };

    saveExamState();
    showScreen('exam-screen');
    renderExam();

    if (selectedMode === 'exam') {
        startTimer();
    }
}

// ============================================
// EXAM RENDERING
// ============================================

function renderExam() {
    if (!currentExam) return;

    const { mode, direction, questions, currentIndex, answers } = currentExam;
    const question = questions[currentIndex];

    // Update progress display
    const remaining = questions.length - currentIndex;
    let progressText = `${currentIndex + 1}/${questions.length}`;

    if (mode === 'training') {
        const correct = currentExam.firstAnswers.filter((a, i) => {
            if (a === null) return false;
            return isAnswerCorrect(questions[i], a);
        }).length;
        const answered = currentExam.firstAnswers.filter(a => a !== null).length;
        const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        progressText += ` · ✓${correct} · ${pct}%`;
    } else {
        progressText += ` · ${remaining} left`;
    }
    document.getElementById('exam-progress').textContent = progressText;

    // Render question grid
    renderGrid();

    // Render question
    const container = document.getElementById('question-container');
    const isFav = favorites.includes(question.id);

    container.innerHTML = `
        <div class="question-header">
            <span class="question-number">Q${question.number || (currentIndex + 1)}</span>
            <div class="question-actions">
                <button class="icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${question.id}')" title="Favorite">✦</button>
                <button class="icon-btn" onclick="showLocation('${question.batchName}', '${question.number || currentIndex + 1}', '${question.pageNumber}')" title="Location">📍</button>
            </div>
        </div>
        <p class="question-text">${question.text}</p>
        <div class="options-list">
            ${question.options.map((opt, i) => {
                let cls = 'option-btn';
                if (answers[currentIndex] === i) cls += ' selected';
                if (mode === 'training' && currentExam.showAnswer) {
                    const correctIdx = getCorrectIndex(question);
                    if (i === correctIdx) cls += ' correct';
                    else if (answers[currentIndex] === i && i !== correctIdx) cls += ' wrong';
                }
                return `<button class="${cls}" onclick="selectOption(${i})">${opt}</button>`;
            }).join('')}
        </div>
        <div class="explanation-box ${(mode === 'training' && currentExam.showAnswer) ? 'visible' : ''}">
            <strong>Explanation:</strong> ${question.explanation}
        </div>
    `;

    renderExamNav();
}

function renderGrid() {
    const grid = document.getElementById('question-grid');
    const { questions, currentIndex, answers, mode, direction, firstAnswers } = currentExam;

    grid.innerHTML = '';
    questions.forEach((q, i) => {
        let cls = 'grid-btn';
        if (i === currentIndex) cls += ' current';
        else if (answers[i] !== null) {
            if (mode === 'training' && firstAnswers[i] !== null) {
                cls += isAnswerCorrect(q, firstAnswers[i]) ? ' answered' : ' wrong';
            } else {
                cls += ' answered';
            }
        }
        // Disable past questions in one-way mode
        if (direction === 'oneway' && i < currentIndex) cls += ' disabled';

        const btn = document.createElement('button');
        btn.className = cls;
        btn.textContent = i + 1;
        btn.onclick = () => navigateToQuestion(i);
        grid.appendChild(btn);
    });
}

function renderExamNav() {
    const nav = document.getElementById('exam-nav');
    const { mode, direction, currentIndex, questions } = currentExam;

    let html = '';

    // Previous button (only in two-way mode)
    if (direction === 'twoway' && currentIndex > 0) {
        html += `<button class="btn-secondary" onclick="prevQuestion()">← Previous</button>`;
    } else {
        html += `<span></span>`;
    }

    // Next / Finish button
    if (mode === 'training') {
        if (currentExam.showAnswer) {
            if (currentIndex < questions.length - 1) {
                html += `<button class="btn-primary" onclick="nextQuestion()">Next →</button>`;
            } else {
                html += `<button class="btn-primary" onclick="finishExam()">Finish</button>`;
            }
        } else if (currentExam.answers[currentIndex] !== null && !currentExam.showAnswer) {
            html += `<button class="btn-small" onclick="showAnswer()">Show Answer</button>`;
        } else {
            html += `<span></span>`;
        }
    } else {
        // Exam mode
        if (currentExam.answers[currentIndex] !== null) {
            if (currentIndex < questions.length - 1) {
                html += `<button class="btn-primary" onclick="nextQuestion()">Next →</button>`;
            } else {
                html += `<button class="btn-primary" onclick="finishExam()">Submit Exam</button>`;
            }
        } else {
            html += `<span></span>`;
        }
    }

    nav.innerHTML = html;
}

// ============================================
// EXAM INTERACTION LOGIC
// ============================================

function selectOption(optionIndex) {
    if (!currentExam || currentExam.submitted) return;
    const { mode, currentIndex } = currentExam;

    // In training mode, if answer already shown, don't allow change
    if (mode === 'training' && currentExam.showAnswer) return;

    currentExam.answers[currentIndex] = optionIndex;

    // Record first answer
    if (currentExam.firstAnswers[currentIndex] === null) {
        currentExam.firstAnswers[currentIndex] = optionIndex;
    }

    if (mode === 'training') {
        const question = currentExam.questions[currentIndex];
        const isCorrect = isAnswerCorrect(question, optionIndex);

        if (isCorrect) {
            currentExam.showAnswer = true;
            showFireworks();
            saveExamState();
            renderExam();
        } else {
            renderExam();
            if (!wrongQuestions.includes(question.id)) {
                wrongQuestions.push(question.id);
                saveWrongQuestions();
            }
        }
    } else {
        saveExamState();
        renderExam();
    }
}

function showAnswer() {
    if (!currentExam) return;
    currentExam.showAnswer = true;

    const question = currentExam.questions[currentExam.currentIndex];
    if (currentExam.firstAnswers[currentExam.currentIndex] !== null) {
        if (!isAnswerCorrect(question, currentExam.firstAnswers[currentExam.currentIndex])) {
            if (!wrongQuestions.includes(question.id)) {
                wrongQuestions.push(question.id);
                saveWrongQuestions();
            }
        }
    }

    saveExamState();
    renderExam();
}

function nextQuestion() {
    if (!currentExam) return;
    if (currentExam.currentIndex < currentExam.questions.length - 1) {
        currentExam.currentIndex++;
        currentExam.showAnswer = false;
        saveExamState();
        renderExam();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prevQuestion() {
    if (!currentExam) return;
    // Only allow in two-way mode
    if (currentExam.direction !== 'twoway') return;
    if (currentExam.currentIndex > 0) {
        currentExam.currentIndex--;
        if (currentExam.mode === 'training') {
            currentExam.showAnswer = currentExam.answers[currentExam.currentIndex] !== null;
        }
        renderExam();
    }
}

function navigateToQuestion(index) {
    if (!currentExam) return;
    const { direction, currentIndex } = currentExam;

    // In one-way mode, can't go back or skip
    if (direction === 'oneway') {
        if (index < currentIndex) return;
        if (index > currentIndex) return;
    }

    // In two-way mode, can go to any answered question or current
    if (direction === 'twoway') {
        // Allow navigation to any question up to the furthest reached
        currentExam.currentIndex = index;
        if (currentExam.mode === 'training') {
            currentExam.showAnswer = currentExam.answers[index] !== null;
        }
        renderExam();
    }
}

function toggleGrid() {
    const grid = document.getElementById('question-grid');
    grid.classList.toggle('hidden');
}

function exitExam() {
    if (currentExam && !currentExam.submitted) {
        if (confirm('Are you sure you want to exit? Your progress will be saved.')) {
            saveExamState();
            currentExam = null;
            goHome();
        }
    } else {
        currentExam = null;
        goHome();
    }
}

// ============================================
// TIMER LOGIC (Real Exam Mode)
// ============================================

let timerInterval = null;

function startTimer() {
    const timerEl = document.getElementById('exam-timer');
    timerEl.classList.remove('hidden');

    timerInterval = setInterval(() => {
        if (!currentExam || currentExam.submitted) {
            clearInterval(timerInterval);
            return;
        }

        const elapsed = Date.now() - currentExam.startTime;
        const remaining = currentExam.totalTime - elapsed;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timeUp();
            return;
        }

        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        if (remaining <= 60000) {
            timerEl.classList.add('timer-danger');
        } else {
            timerEl.classList.remove('timer-danger');
        }
    }, 1000);
}

function timeUp() {
    const unanswered = currentExam.answers.filter(a => a === null).length;
    showToast(`Time is up! ${unanswered} questions unanswered.`);
    finishExam();
}

// ============================================
// FINISH EXAM AND RESULTS
// ============================================

function finishExam() {
    if (!currentExam) return;
    currentExam.submitted = true;
    currentExam.endTime = Date.now();

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    saveProgress();
    clearExamState();

    if (currentExam.mode === 'exam') {
        showScreen('results-screen');
        showWaitingMessages();
    } else {
        showResults();
    }
}

function showWaitingMessages() {
    const waitDiv = document.getElementById('results-waiting');
    const contentDiv = document.getElementById('results-content');
    const msgEl = document.getElementById('waiting-message');

    waitDiv.classList.remove('hidden');
    contentDiv.innerHTML = '';

    const messages = [
        "Processing your answers...",
        "Calculating your score...",
        "Analyzing your performance...",
        "Almost there...",
        "Preparing your results..."
    ];

    let msgIdx = 0;
    const msgInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        msgEl.textContent = messages[msgIdx];
    }, 2000);

    setTimeout(() => {
        clearInterval(msgInterval);
        waitDiv.classList.add('hidden');
        showResults();
    }, 10000);
}

function showResults() {
    showScreen('results-screen');
    const contentDiv = document.getElementById('results-content');
    const { questions, answers, firstAnswers, startTime, endTime, mode } = currentExam;

    const total = questions.length;
    const answeredCount = answers.filter(a => a !== null).length;
    const unanswered = total - answeredCount;

    let correct = 0;
    const answersToCheck = mode === 'exam' ? answers : firstAnswers;
    answersToCheck.forEach((ans, i) => {
        if (ans !== null && isAnswerCorrect(questions[i], ans)) {
            correct++;
        }
    });

    const incorrect = answeredCount - correct;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const timeSpent = endTime ? Math.round((endTime - startTime) / 1000) : 0;
    const mins = Math.floor(timeSpent / 60);
    const secs = timeSpent % 60;

    if (score > 50) {
        showFireworks();
    }

    contentDiv.innerHTML = `
        <div class="result-score">${score}%</div>
        <div class="result-details">
            <div class="result-card">
                <div class="value">${correct}/${total}</div>
                <div class="label">Correct</div>
            </div>
            <div class="result-card">
                <div class="value">${mins}m ${secs}s</div>
                <div class="label">Time Spent</div>
            </div>
            <div class="result-card">
                <div class="value">${unanswered}</div>
                <div class="label">Unanswered</div>
            </div>
            <div class="result-card">
                <div class="value">${incorrect}</div>
                <div class="label">Incorrect</div>
            </div>
        </div>
        <button class="btn-primary mt-20" onclick="reviewExam()">Review Questions</button>
        <button class="btn-secondary mt-10" onclick="goHome()">Back to Home</button>
    `;
}

function reviewExam() {
    if (!currentExam) return;
    const { questions, answers } = currentExam;
    const reviewDiv = document.getElementById('results-review');
    reviewDiv.classList.remove('hidden');

    let html = '<h3 class="mt-20" style="text-align:left">Review</h3>';
    questions.forEach((q, i) => {
        const userAnswer = answers[i];
        const correctIdx = getCorrectIndex(q);
        const isCorrect = userAnswer === correctIdx;

        html += `
            <div class="question-container mt-10" style="border-left: 4px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'}">
                <div class="question-header">
                    <span class="question-number">Q${q.number || (i+1)}</span>
                    <span style="color: ${isCorrect ? 'var(--success)' : 'var(--danger)'}; font-weight:600">
                        ${isCorrect ? '✓ Correct' : '✗ Wrong'}
                    </span>
                </div>
                <p class="question-text">${q.text}</p>
                <div class="options-list">
                    ${q.options.map((opt, oi) => {
                        let cls = 'option-btn';
                        if (oi === correctIdx) cls += ' correct';
                        if (oi === userAnswer && oi !== correctIdx) cls += ' wrong';
                        return `<div class="${cls}" style="cursor:default">${opt}</div>`;
                    }).join('')}
                </div>
                <div class="explanation-box visible">
                    <strong>Explanation:</strong> ${q.explanation}
                </div>
            </div>
        `;
    });

    reviewDiv.innerHTML = html;
}

// ============================================
// SEARCH LOGIC
// ============================================

function populateSearchFilter() {
    const filter = document.getElementById('search-filter');
    filter.innerHTML = '<option value="all">All Years</option>';
    allYears.forEach(y => {
        filter.innerHTML += `<option value="${y.name}">${y.name}</option>`;
    });
}

function performSearch() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const filter = document.getElementById('search-filter').value;
    const resultsDiv = document.getElementById('search-results');

    if (query.length < 2) {
        resultsDiv.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Type at least 2 characters to search...</p>';
        return;
    }

    let results = allQuestions.filter(q => {
        const searchText = (q.text + ' ' + q.options.join(' ') + ' ' + q.explanation).toLowerCase();
        const matchesQuery = searchText.includes(query);
        const matchesFilter = filter === 'all' || q.batchName.includes(filter) || q.groupName.includes(filter);
        return matchesQuery && matchesFilter;
    });

    if (results.length === 0) {
        resultsDiv.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">No results found.</p>';
        return;
    }

    resultsDiv.innerHTML = results.slice(0, 50).map(q => `
        <div class="search-result-item" onclick="openReadonly('${q.id}')">
            <p><strong>Q${q.number}:</strong> ${q.text.substring(0, 120)}${q.text.length > 120 ? '...' : ''}</p>
            <div class="search-result-meta">
                📍 ${q.batchName} · Question ${q.number} · ${q.pageNumber}
            </div>
        </div>
    `).join('');
}

// ============================================
// READ-ONLY VIEWER
// ============================================

function openReadonly(questionId) {
    const question = allQuestions.find(q => q.id === questionId);
    if (!question) return;

    showScreen('readonly-screen');
    const content = document.getElementById('readonly-content');
    const correctIdx = getCorrectIndex(question);

    content.innerHTML = `
        <div class="question-header">
            <span class="question-number">Question ${question.number}</span>
            <div class="question-actions">
                <button class="icon-btn ${favorites.includes(question.id) ? 'active' : ''}" onclick="toggleFavorite('${question.id}'); openReadonly('${question.id}');" title="Favorite">✦</button>
                <button class="icon-btn" onclick="showLocation('${question.batchName}', '${question.number}', '${question.pageNumber}')" title="Location">📍</button>
            </div>
        </div>
        <p class="question-text">${question.text}</p>
        <div class="options-list">
            ${question.options.map((opt, i) => `
                <div class="option-btn ${i === correctIdx ? 'correct' : ''}" style="cursor:default">${opt}</div>
            `).join('')}
        </div>
        <div class="explanation-box visible">
            <strong>Explanation:</strong> ${question.explanation}
        </div>
        <div class="mt-20" style="color:var(--text-light); font-size:0.9rem; padding:12px; background:var(--border-light); border-radius:var(--radius-sm);">
            <p><strong>Batch:</strong> ${question.batchName}</p>
            <p><strong>Page:</strong> ${question.pageNumber}</p>
        </div>
    `;
}

function closeReadonly() {
    if (document.getElementById('search-input') && document.getElementById('search-input').value) {
        showScreen('search-screen');
    } else {
        goHome();
    }
}

// ============================================
// WRONG QUESTIONS
// ============================================

function openWrongQuestions() {
    const questions = allQuestions.filter(q => wrongQuestions.includes(q.id));

    if (questions.length === 0) {
        showToast('No wrong questions yet!');
        return;
    }

    showScreen('selection-screen');
    document.getElementById('selection-title').textContent = 'Wrong Questions';

    const list = document.getElementById('selection-list');
    list.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <p style="font-size:1.1rem; font-weight:600; margin-bottom:16px;">${questions.length} wrong questions available</p>
            <div class="mode-buttons" style="max-width:400px; margin:0 auto;">
                <button class="btn-mode" onclick="startSpecialExam(getWrongQuestionObjects(), 'training', 'twoway')">
                    <span class="mode-icon">🎓</span>
                    <span class="mode-label">Training</span>
                </button>
                <button class="btn-mode" onclick="startSpecialExam(getWrongQuestionObjects(), 'exam', 'oneway')">
                    <span class="mode-icon">📝</span>
                    <span class="mode-label">Exam</span>
                </button>
            </div>
            <button class="btn-danger mt-20" onclick="clearWrongQuestions()">Clear Wrong Questions</button>
        </div>
    `;

    document.getElementById('selection-footer').classList.add('hidden');
}

function getWrongQuestionObjects() {
    return allQuestions.filter(q => wrongQuestions.includes(q.id));
}

function clearWrongQuestions() {
    if (confirm('Clear all wrong questions?')) {
        wrongQuestions = [];
        saveWrongQuestions();
        goHome();
        showToast('Wrong questions cleared');
    }
}

// ============================================
// FAVORITES LOGIC
// ============================================

function toggleFavorite(questionId) {
    const idx = favorites.indexOf(questionId);
    if (idx > -1) {
        favorites.splice(idx, 1);
    } else {
        favorites.push(questionId);
    }
    saveFavorites();

    if (currentExam && !currentExam.submitted) {
        renderExam();
    }
}

function openFavoriteQuestions() {
    const questions = allQuestions.filter(q => favorites.includes(q.id));

    if (questions.length === 0) {
        showToast('No favorite questions yet!');
        return;
    }

    showScreen('selection-screen');
    document.getElementById('selection-title').textContent = 'Favorite Questions';

    const list = document.getElementById('selection-list');
    list.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <p style="font-size:1.1rem; font-weight:600; margin-bottom:16px;">${questions.length} favorite questions</p>
            <div class="mode-buttons" style="max-width:400px; margin:0 auto;">
                <button class="btn-mode" onclick="startSpecialExam(getFavoriteQuestionObjects(), 'training', 'twoway')">
                    <span class="mode-icon">🎓</span>
                    <span class="mode-label">Training</span>
                </button>
                <button class="btn-mode" onclick="startSpecialExam(getFavoriteQuestionObjects(), 'exam', 'oneway')">
                    <span class="mode-icon">📝</span>
                    <span class="mode-label">Exam</span>
                </button>
            </div>
            <button class="btn-danger mt-20" onclick="clearFavorites()">Clear Favorites</button>
        </div>
    `;

    document.getElementById('selection-footer').classList.add('hidden');
}

function getFavoriteQuestionObjects() {
    return allQuestions.filter(q => favorites.includes(q.id));
}

function clearFavorites() {
    if (confirm('Clear all favorites?')) {
        favorites = [];
        saveFavorites();
        goHome();
        showToast('Favorites cleared');
    }
}

/**
 * Start exam from wrong/favorite questions
 */
function startSpecialExam(questions, mode, direction) {
    if (questions.length === 0) {
        showToast('No questions available');
        return;
    }

    currentExam = {
        mode,
        direction: direction || 'twoway',
        questions: shuffleArray([...questions]),
        currentIndex: 0,
        answers: new Array(questions.length).fill(null),
        firstAnswers: new Array(questions.length).fill(null),
        startTime: Date.now(),
        totalTime: (questions.length + 5) * 60 * 1000,
        submitted: false,
        showAnswer: false
    };

    saveExamState();
    showScreen('exam-screen');
    renderExam();

    if (mode === 'exam') {
        startTimer();
    }
}

// ============================================
// STATISTICS LOGIC
// ============================================

function toggleStatistics() {
    const panel = document.getElementById('statistics-panel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) {
        renderStatistics();
    }
}

function renderStatistics() {
    const content = document.getElementById('stats-content');
    let html = '';

    // Lectures progress
    html += '<div class="stat-section"><h4>Lectures Progress</h4>';
    if (allLectures.length === 0) {
        html += '<p style="color:var(--text-muted)">No lecture data loaded.</p>';
    }
    allLectures.forEach(lecture => {
        const key = `lecture-${lecture.name}`;
        const prog = progress[key] || { answered: 0, correct: 0, questionIds: [], correctIds: [] };
        const total = lecture.questions.length;
        // Modification 4: Use questionIds length for accurate count
        const answeredCount = prog.questionIds ? prog.questionIds.length : prog.answered;
        const pct = total > 0 ? Math.min(100, Math.round((answeredCount / total) * 100)) : 0;
        let status = pct === 0 ? 'Not Started' : pct >= 100 ? 'Completed' : 'In Progress';
        let statusColor = pct === 0 ? 'var(--text-muted)' : pct >= 100 ? 'var(--success)' : 'var(--warning)';

        html += `
            <div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
                    <span style="font-weight:500;font-size:0.9rem">${lecture.name}</span>
                    <span style="font-size:0.8rem;color:${statusColor};font-weight:600">${status} (${pct}%)</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    // Years progress (pie chart)
    html += '<div class="stat-section"><h4>Years Progress</h4>';
    let completed = 0, inProgress = 0, notStarted = 0;
    allYears.forEach(year => {
        const key = `year-${year.name}`;
        const prog = progress[key] || { answered: 0, correct: 0, questionIds: [], correctIds: [] };
        const total = year.questions.length;
        const answeredCount = prog.questionIds ? prog.questionIds.length : prog.answered;
        const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
        if (pct >= 100) completed++;
        else if (pct > 0) inProgress++;
        else notStarted++;
    });

    const totalYears = allYears.length || 1;
    const completedPct = (completed / totalYears) * 100;
    const inProgressPct = (inProgress / totalYears) * 100;

    html += `
        <div class="pie-chart-container">
            <div class="pie-chart" style="background: conic-gradient(
                var(--success) 0% ${completedPct}%,
                var(--warning) ${completedPct}% ${completedPct + inProgressPct}%,
                var(--border) ${completedPct + inProgressPct}% 100%
            )"></div>
        </div>
        <div class="stat-legend">
            <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div> Completed (${completed})</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--warning)"></div> In Progress (${inProgress})</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--border)"></div> Not Started (${notStarted})</div>
        </div>
    `;
    html += '</div>';

    // Summary
    html += `
        <div class="stat-section">
            <h4>Summary</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div style="padding:12px; background:var(--border-light); border-radius:var(--radius-sm); text-align:center;">
                    <div style="font-size:1.3rem; font-weight:700; color:var(--warning);">${favorites.length}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Favorites</div>
                </div>
                <div style="padding:12px; background:var(--border-light); border-radius:var(--radius-sm); text-align:center;">
                    <div style="font-size:1.3rem; font-weight:700; color:var(--danger);">${wrongQuestions.length}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Wrong</div>
                </div>
            </div>
            <p style="margin-top:12px; font-size:0.85rem; color:var(--text-muted);">Total Questions: ${allQuestions.length}</p>
        </div>
    `;

    content.innerHTML = html;
}

function resetProgress() {
    if (confirm('Are you sure you want to reset ALL progress? This cannot be undone.')) {
        progress = {};
        favorites = [];
        wrongQuestions = [];
        localStorage.removeItem('exam-progress');
        localStorage.removeItem('exam-favorites');
        localStorage.removeItem('exam-wrong');
        localStorage.removeItem('exam-state');
        showToast('All progress has been reset');
        renderStatistics();
    }
}

// ============================================
// SETTINGS HANDLING
// ============================================

function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('visible');
}

function toggleDarkMode() {
    const isDark = document.getElementById('dark-mode-toggle').checked;
    document.documentElement.setAttribute('data-dark', isDark);
    settings.darkMode = isDark;
    saveSettings();
}

function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    settings.theme = theme;
    saveSettings();
}

function changeSound(sound) {
    const audio = document.getElementById('bg-audio');
    if (sound === 'none') {
        audio.pause();
        audio.src = '';
    } else {
        // Modification 3: Fix audio path (GitHub Pages usually serves from root or relative)
        audio.src = `${sound}.mp3`;
        audio.volume = (settings.volume || 50) / 100;
        audio.play().catch(err => {
            console.warn('Audio play failed:', err);
            // Try alternative path if first fails
            audio.src = `audio/${sound}.mp3`;
            audio.play().catch(e => console.warn('Alternative audio path also failed'));
        });
    }
    settings.bgSound = sound;
    saveSettings();
}

function changeVolume(value) {
    const audio = document.getElementById('bg-audio');
    audio.volume = value / 100;
    settings.volume = value;
    saveSettings();
}

function toggleAnimations() {
    const enabled = document.getElementById('animations-toggle').checked;
    document.documentElement.setAttribute('data-animations', enabled);
    settings.animations = enabled;
    saveSettings();
}

function applySettings() {
    document.getElementById('dark-mode-toggle').checked = settings.darkMode || false;
    document.documentElement.setAttribute('data-dark', settings.darkMode || false);

    document.getElementById('theme-selector').value = settings.theme || 'default';
    document.documentElement.setAttribute('data-theme', settings.theme || 'default');

    document.getElementById('sound-selector').value = settings.sound || 'none';
    document.getElementById('volume-control').value = settings.volume || 50;

    document.getElementById('animations-toggle').checked = settings.animations !== false;
    document.documentElement.setAttribute('data-animations', settings.animations !== false);
}

// ============================================
// LOCALSTORAGE HANDLING
// ============================================

function saveSettings() {
    localStorage.setItem('exam-settings', JSON.stringify(settings));
}

function loadSettings() {
    try {
        settings = JSON.parse(localStorage.getItem('exam-settings')) || {};
    } catch { settings = {}; }
}

function saveProgress() {
    if (!currentExam) return;
    const { questions, firstAnswers } = currentExam;

    questions.forEach((q, i) => {
        // Modification 4: Improve statistics accuracy
        if (firstAnswers[i] !== null) {
            const key = `${q.source}-${q.groupName}`;
            if (!progress[key]) progress[key] = { answered: 0, correct: 0, questionIds: [], correctIds: [] };
            
            // Ensure arrays exist
            if (!progress[key].questionIds) progress[key].questionIds = [];
            if (!progress[key].correctIds) progress[key].correctIds = [];

            if (!progress[key].questionIds.includes(q.id)) {
                progress[key].questionIds.push(q.id);
                progress[key].answered = progress[key].questionIds.length;
            }

            const isCorrect = isAnswerCorrect(q, firstAnswers[i]);
            if (isCorrect && !progress[key].correctIds.includes(q.id)) {
                progress[key].correctIds.push(q.id);
                progress[key].correct = progress[key].correctIds.length;
            }
        }
    });

    localStorage.setItem('exam-progress', JSON.stringify(progress));
}

function loadProgress() {
    try {
        progress = JSON.parse(localStorage.getItem('exam-progress')) || {};
    } catch { progress = {}; }
}

function saveFavorites() {
    localStorage.setItem('exam-favorites', JSON.stringify(favorites));
}

function loadFavorites() {
    try {
        favorites = JSON.parse(localStorage.getItem('exam-favorites')) || [];
    } catch { favorites = []; }
}

function saveWrongQuestions() {
    localStorage.setItem('exam-wrong', JSON.stringify(wrongQuestions));
}

function loadWrongQuestions() {
    try {
        wrongQuestions = JSON.parse(localStorage.getItem('exam-wrong')) || [];
    } catch { wrongQuestions = []; }
}

function saveExamState() {
    if (!currentExam) return;
    localStorage.setItem('exam-state', JSON.stringify(currentExam));
}

function clearExamState() {
    localStorage.removeItem('exam-state');
}

function checkResumeExam() {
    try {
        const saved = JSON.parse(localStorage.getItem('exam-state'));
        if (saved && !saved.submitted) {
            if (confirm('You have an unfinished exam. Would you like to resume?')) {
                currentExam = saved;
                showScreen('exam-screen');
                renderExam();
                if (saved.mode === 'exam') {
                    startTimer();
                }
            } else {
                clearExamState();
            }
        }
    } catch {
        clearExamState();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function isAnswerCorrect(question, answerIndex) {
    if (answerIndex === null || answerIndex === undefined) return false;
    return answerIndex === getCorrectIndex(question);
}

function getCorrectIndex(question) {
    const correctLetter = question.correctAnswer.charAt(0).toUpperCase();
    const letters = ['A', 'B', 'C', 'D', 'E'];
    return letters.indexOf(correctLetter);
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function showLocation(batch, number, page) {
    showToast(`${batch} · Q${number} · ${page}`);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('visible');
    setTimeout(() => {
        toast.classList.remove('visible');
        toast.classList.add('hidden');
    }, 3000);
}

// ============================================
// FIREWORKS ANIMATION
// ============================================

function showFireworks() {
    if (settings.animations === false) return;

    const canvas = document.getElementById('fireworks-canvas');
    canvas.classList.remove('hidden');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'];

    // Create multiple burst points
    const bursts = [
        { x: canvas.width * 0.3, y: canvas.height * 0.3 },
        { x: canvas.width * 0.7, y: canvas.height * 0.4 },
        { x: canvas.width * 0.5, y: canvas.height * 0.25 }
    ];

    bursts.forEach(burst => {
        for (let i = 0; i < 40; i++) {
            const angle = (Math.PI * 2 * i) / 40;
            const speed = 3 + Math.random() * 5;
            particles.push({
                x: burst.x,
                y: burst.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 3.5 + 1.5,
                life: 1
            });
        }
    });

    let frame = 0;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life -= 0.012;

            if (p.life > 0) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        frame++;
        if (frame < 120) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.classList.add('hidden');
        }
    }

    animate();
}
