/* ============================================
   MEDICAL EXAM PRACTICE - MAIN JAVASCRIPT
   (نسخة مع تصليح الإعدادات والإحصائيات والاستئناف)
   ============================================ */

// ============================================
// GLOBAL STATE
// ============================================
let allLectures = [];
let allYears = [];
let allQuestions = [];
let currentExam = null;
let settings = {};
let favorites = [];
let wrongQuestions = [];
let progress = {};

// Selection state
let selectedGroups = [];
let currentGroups = [];
let selectedMode = null;
let selectedDirection = null;
let extraTime = 0;
let extraTimeAdded = false;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    loadProgress();
    loadFavorites();
    loadWrongQuestions();
    buildModals();          // بناء المودالات أولاً
    applySettings();       // تطبيق الإعدادات على الواجهة
    await loadData();
    checkResumeExam();     // فحص الامتحان غير المكتمل بعد تحميل البيانات
    displayRandomQuote();
    updateStartButtonIcon();
    
    // ربط الأزرار التي قد لا تكون ربطت عبر onclick في HTML
    bindButtons();
});

function bindButtons() {
    // نتأكد من وجود أزرار الإعدادات والإحصائيات في الصفحة الرئيسية
    const statsBtn = document.querySelector('.nav-btn--stats');
    const settingsBtn = document.querySelector('.nav-btn--settings');
    if (statsBtn) statsBtn.onclick = toggleStatistics;
    if (settingsBtn) settingsBtn.onclick = toggleSettings;
    
    // زر الإعدادات المختصر داخل الامتحان (يتم ربطه لاحقاً عند renderExam)
}

function displayRandomQuote() {
    const quotes = [
        "لا توجد وصفة سحرية، ولا توجد طريقة ليس فيها العمل والتعب وبذل الجهد !",
        "الفشل ليس النهاية، بل هو خطوة ضرورية نحو القمة إذا تعلمت منه !",
        "العلم الذي تدرسه اليوم هو الأمل الذي ستمنحه لغيرك غداً !",
        "دراسة الطب هي ماراثون وليست سباقاً قصيراً؛ حافظ على أنفاسك وواصل التقدم !",
        "لا تنتظر الوقت المناسب، فالوقت لن يكون مثاليًا أبدًا. ابدأ من حيث تقف !"
    ];
    const quoteEl = document.getElementById('random-quote');
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteEl.textContent = quotes[randomIndex];
    }
}

// ============================================
// DATA LOADING AND PARSING (نفس الكود السابق)
// ============================================
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

        populateSearchFilter();
    } catch (err) {
        console.error('Error loading data:', err);
        showToast('Error loading question data. Please check files.');
    }
}

function parseFile(text, type) {
    const groups = [];
    const sections = text.split('/////').filter(s => s.trim());

    sections.forEach(section => {
        const lines = section.trim().split('\n');
        if (lines.length === 0) return;

        const groupName = lines[0].trim();
        const questionsRaw = lines.slice(1).join('\n');

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

function parseQuestion(block, defaultBatch) {
    try {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 4) return null;

        let questionNumber = '';
        let questionText = '';
        let options = [];
        let correctAnswerLetter = '';
        let correctAnswerText = '';
        let explanation = '';
        let batchName = defaultBatch;
        let pageNumber = '';

        let i = 0;

        if (lines[i] && lines[i].match(/^Question\s+\d+/i)) {
            questionNumber = lines[i].replace(/^Question\s+/i, '').trim();
            i++;
        }

        let qTextLines = [];
        while (i < lines.length && !lines[i].match(/^[A-E]\)/)) {
            qTextLines.push(lines[i]);
            i++;
        }
        questionText = qTextLines.join(' ');

        while (i < lines.length && lines[i].match(/^[A-E]\)/)) {
            options.push(lines[i]);
            i++;
        }

        while (i < lines.length) {
            if (lines[i].match(/^Correct Answer:/i)) {
                correctAnswerLetter = lines[i].replace(/^Correct Answer:\s*/i, '').trim().charAt(0);
                i++;
                break;
            }
            i++;
        }

        const correctOption = options.find(opt => opt.startsWith(correctAnswerLetter + ')'));
        if (correctOption) {
            correctAnswerText = correctOption.substring(2).trim();
        } else {
            correctAnswerText = '';
        }

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
            optionsRaw: options,
            correctAnswerLetter,
            correctAnswerText,
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

function isMetadataLine(line) {
    if (line.match(/^P\d+/i)) return true;
    if (line.match(/^\d+(st|nd|rd|th)\s+Year/i)) return true;
    if (line.match(/^[A-Z].*-\s*.+/)) return true;
    return false;
}

// ============================================
// خلط الخيارات
// ============================================
function shuffleOptions(question) {
    const opts = question.optionsRaw.map((opt, idx) => {
        const letter = opt.charAt(0);
        const text = opt.substring(2).trim();
        return { letter, text, originalIndex: idx };
    });
    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const newOptions = [];
    const newLetters = ['A', 'B', 'C', 'D', 'E'];
    opts.forEach((opt, newIdx) => {
        const newLetter = newLetters[newIdx];
        newOptions.push(`${newLetter}) ${opt.text}`);
        opt.newLetter = newLetter;
    });
    const correctNew = newOptions.find(opt => opt.substring(2).trim() === question.correctAnswerText);
    const correctNewLetter = correctNew ? correctNew.charAt(0) : 'A';
    return {
        shuffledOptions: newOptions,
        mappedCorrectLetter: correctNewLetter,
        originalCorrectText: question.correctAnswerText
    };
}

// ============================================
// NAVIGATION
// ============================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    // إخفاء لوحات الإعدادات والإحصائيات عند تغيير الشاشة
    document.getElementById('settings-panel')?.classList.remove('visible');
    document.getElementById('statistics-panel')?.classList.remove('visible');
}

function goHome() {
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
// SELECTION SCREEN (مختصر للطول)
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

    const searchContainer = document.getElementById('selection-search-container');
    const searchInput = document.getElementById('selection-search');
    if (groups === allLectures) {
        searchContainer.classList.remove('hidden');
        searchInput.value = '';
    } else {
        searchContainer.classList.add('hidden');
    }

    const list = document.getElementById('selection-list');
    list.innerHTML = '';

    groups.forEach((group, idx) => {
        const item = document.createElement('div');
        item.className = 'selection-item';
        item.dataset.groupName = group.name.toLowerCase();
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

    document.getElementById('selection-footer').classList.add('hidden');
    document.getElementById('direction-selection').classList.add('hidden');
    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
}

function filterSelectionList() {
    const searchTerm = document.getElementById('selection-search').value.toLowerCase().trim();
    const items = document.querySelectorAll('#selection-list .selection-item');
    items.forEach(item => {
        const groupName = item.dataset.groupName || '';
        item.style.display = groupName.includes(searchTerm) ? '' : 'none';
    });
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

    selectedMode = null;
    selectedDirection = null;
    document.getElementById('direction-selection').classList.add('hidden');
    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
}

// ============================================
// MODE AND DIRECTION
// ============================================
function selectMode(mode) {
    selectedMode = mode;
    selectedDirection = null;
    extraTime = 0;
    extraTimeAdded = false;

    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    document.getElementById(mode === 'training' ? 'btn-training-mode' : 'btn-exam-mode').classList.add('active');

    document.getElementById('direction-selection').classList.remove('hidden');
    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));

    document.getElementById('timer-options').classList.add('hidden');
    document.getElementById('start-section').classList.add('hidden');
}

function selectDirection(direction) {
    selectedDirection = direction;

    document.querySelectorAll('.btn-direction').forEach(b => b.classList.remove('active'));
    document.getElementById(direction === 'oneway' ? 'btn-oneway' : 'btn-twoway').classList.add('active');

    if (selectedMode === 'exam') {
        const count = parseInt(document.getElementById('question-count-input').value) || 0;
        document.getElementById('base-time-display').textContent = `${count} min`;
        document.getElementById('extra-time-display').textContent = `+0 min`;
        document.getElementById('total-time-display').textContent = `${count} min`;
        document.getElementById('timer-options').classList.remove('hidden');
        const btn = document.getElementById('btn-add-extra');
        btn.disabled = false;
        btn.textContent = '+ Add 5 Extra Minutes';
        extraTime = 0;
        extraTimeAdded = false;
    } else {
        document.getElementById('timer-options').classList.add('hidden');
    }

    document.getElementById('start-section').classList.remove('hidden');
}

function addExtraTime() {
    if (extraTimeAdded) return;
    extraTime = 5;
    extraTimeAdded = true;

    const count = parseInt(document.getElementById('question-count-input').value) || 0;
    document.getElementById('extra-time-display').textContent = `+5 min`;
    document.getElementById('total-time-display').textContent = `${count + 5} min`;

    const btn = document.getElementById('btn-add-extra');
    btn.disabled = true;
    btn.textContent = '✓ Extra 5 Minutes Added';
}

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

    questions = shuffleArray(questions).slice(0, count);

    const processedQuestions = questions.map(q => {
        const shuffled = shuffleOptions(q);
        return {
            ...q,
            shuffledOptions: shuffled.shuffledOptions,
            originalCorrectText: q.correctAnswerText
        };
    });

    currentExam = {
        mode: selectedMode,
        direction: selectedDirection,
        questions: processedQuestions,
        currentIndex: 0,
        answers: new Array(processedQuestions.length).fill(null),
        firstAnswers: new Array(processedQuestions.length).fill(null),
        startTime: Date.now(),
        totalTime: (processedQuestions.length + extraTime) * 60 * 1000,
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
// EXAM RENDERING (مع زر إعدادات فعال)
// ============================================
function renderExam() {
    if (!currentExam) return;

    const { mode, questions, currentIndex, answers } = currentExam;
    const question = questions[currentIndex];

    const remaining = questions.length - currentIndex;
    let progressText = `${currentIndex + 1}/${questions.length}`;

    if (mode === 'training') {
        const correct = currentExam.firstAnswers.filter((a, i) => {
            if (a === null) return false;
            const selectedText = questions[i].shuffledOptions[a].substring(2).trim();
            return selectedText === questions[i].originalCorrectText;
        }).length;
        const answered = currentExam.firstAnswers.filter(a => a !== null).length;
        const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        progressText += ` · ✓${correct} · ${pct}%`;
    } else {
        progressText += ` · ${remaining} left`;
    }
    document.getElementById('exam-progress').textContent = progressText;

    renderGrid();

    const container = document.getElementById('question-container');
    const isFav = favorites.includes(question.id);
    const shuffledOpts = question.shuffledOptions;

    container.innerHTML = `
        <div class="question-header">
            <span class="question-number">Q${question.number || (currentIndex + 1)}</span>
            <div class="question-actions">
                <button class="icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${question.id}')" title="Favorite">✦</button>
                <button class="icon-btn" onclick="showLocation('${question.batchName}', '${question.number || currentIndex + 1}', '${question.pageNumber}')" title="Location">📍</button>
                <button class="icon-btn" id="exam-settings-btn" title="Settings">⚙️</button>
            </div>
        </div>
        <p class="question-text">${question.text}</p>
        <div class="options-list">
            ${shuffledOpts.map((opt, i) => {
                let cls = 'option-btn';
                if (answers[currentIndex] === i) cls += ' selected';
                if (mode === 'training' && currentExam.showAnswer) {
                    const isCorrectOpt = (opt.substring(2).trim() === question.originalCorrectText);
                    if (isCorrectOpt) cls += ' correct';
                    else if (answers[currentIndex] === i && !isCorrectOpt) cls += ' wrong';
                }
                return `<button class="${cls}" onclick="selectOption(${i})">${opt}</button>`;
            }).join('')}
        </div>
        <div class="explanation-box ${(mode === 'training' && currentExam.showAnswer) ? 'visible' : ''}">
            <strong>Explanation:</strong> ${question.explanation}
        </div>
    `;

    // ربط زر الإعدادات بعد إضافته إلى DOM
    const settingsBtn = document.getElementById('exam-settings-btn');
    if (settingsBtn) settingsBtn.onclick = openExamSettings;

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
                const selectedText = q.shuffledOptions[firstAnswers[i]].substring(2).trim();
                const isCorrect = (selectedText === q.originalCorrectText);
                cls += isCorrect ? ' answered' : ' wrong';
            } else {
                cls += ' answered';
            }
        }
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

    if (direction === 'twoway' && currentIndex > 0) {
        html += `<button class="btn-secondary" onclick="prevQuestion()">← Previous</button>`;
    } else {
        html += `<span></span>`;
    }

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
// EXAM INTERACTION (اختصار)
// ============================================
function selectOption(optionIndex) {
    if (!currentExam || currentExam.submitted) return;
    const { mode, currentIndex } = currentExam;
    if (mode === 'training' && currentExam.showAnswer) return;

    currentExam.answers[currentIndex] = optionIndex;
    if (currentExam.firstAnswers[currentIndex] === null) {
        currentExam.firstAnswers[currentIndex] = optionIndex;
    }

    if (mode === 'training') {
        const question = currentExam.questions[currentIndex];
        const selectedText = question.shuffledOptions[optionIndex].substring(2).trim();
        const isCorrect = (selectedText === question.originalCorrectText);

        if (isCorrect) {
            currentExam.showAnswer = true;
            showCelebration();
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
    const question = currentExam.questions[currentExam.currentIndex];
    const userAnswerIdx = currentExam.answers[currentExam.currentIndex];
    if (userAnswerIdx !== null) {
        const selectedText = question.shuffledOptions[userAnswerIdx].substring(2).trim();
        const isCorrect = (selectedText === question.originalCorrectText);
        if (!isCorrect && currentExam.mode === 'training') {
            if (!wrongQuestions.includes(question.id)) {
                wrongQuestions.push(question.id);
                saveWrongQuestions();
            }
        }
    }
    currentExam.showAnswer = true;
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
    if (direction === 'oneway' && index < currentIndex) return;
    if (direction === 'twoway') {
        currentExam.currentIndex = index;
        if (currentExam.mode === 'training') {
            currentExam.showAnswer = currentExam.answers[index] !== null;
        }
        renderExam();
    }
}

function toggleGrid() {
    const grid = document.getElementById('question-grid');
    const btn = document.getElementById('btn-grid-toggle');
    grid.classList.toggle('hidden');
    btn.innerHTML = grid.classList.contains('hidden') ? '<span>☰</span> Show Grid' : '<span>☰</span> Hide Grid';
}

// ============================================
// EXIT EXAM WITH MODAL (يعمل بشكل مثالي)
// ============================================
function exitExam() {
    if (!currentExam || currentExam.submitted) {
        currentExam = null;
        goHome();
        return;
    }
    showExitConfirmModal();
}

function showExitConfirmModal() {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalButtons = document.getElementById('modal-buttons');
    
    modalTitle.textContent = 'خروج من الامتحان';
    modalBody.innerHTML = '<p>هل أنت متأكد من رغبتك بالخروج من الامتحان؟</p>';
    modalButtons.innerHTML = `
        <button class="btn-secondary" id="modal-no">لا</button>
        <button class="btn-primary" id="modal-yes">نعم</button>
    `;
    modal.classList.remove('hidden');
    
    document.getElementById('modal-yes').onclick = () => {
        modal.classList.add('hidden');
        showSaveProgressModal();
    };
    document.getElementById('modal-no').onclick = () => {
        modal.classList.add('hidden');
    };
}

function showSaveProgressModal() {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalButtons = document.getElementById('modal-buttons');
    
    modalTitle.textContent = 'حفظ التقدم';
    modalBody.innerHTML = '<p>هل تود حفظ تقدمك على الأسئلة التي أجبت عليها؟</p>';
    modalButtons.innerHTML = `
        <button class="btn-secondary" id="modal-cancel">العودة للامتحان</button>
        <button class="btn-danger" id="modal-no-save">لا والخروج</button>
        <button class="btn-primary" id="modal-save">نعم والخروج</button>
    `;
    modal.classList.remove('hidden');
    
    document.getElementById('modal-save').onclick = () => {
        modal.classList.add('hidden');
        saveExamState();
        currentExam = null;
        goHome();
    };
    document.getElementById('modal-no-save').onclick = () => {
        modal.classList.add('hidden');
        clearExamState();
        currentExam = null;
        goHome();
    };
    document.getElementById('modal-cancel').onclick = () => {
        modal.classList.add('hidden');
    };
}

// ============================================
// TIMER
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

        timerEl.classList.toggle('timer-danger', remaining <= 60000);
    }, 1000);
}

function timeUp() {
    const unanswered = currentExam.answers.filter(a => a === null).length;
    showToast(`Time is up! ${unanswered} questions unanswered.`);
    finishExam();
}

// ============================================
// FINISH EXAM & RESULTS (مختصر)
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
    answersToCheck.forEach((ansIdx, i) => {
        if (ansIdx !== null) {
            const selectedText = questions[i].shuffledOptions[ansIdx].substring(2).trim();
            if (selectedText === questions[i].originalCorrectText) correct++;
        }
    });

    const incorrect = answeredCount - correct;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const timeSpent = endTime ? Math.round((endTime - startTime) / 1000) : 0;
    const mins = Math.floor(timeSpent / 60);
    const secs = timeSpent % 60;

    if (score > 50) showCelebration();

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
    const { questions, answers, mode } = currentExam;
    const reviewDiv = document.getElementById('results-review');
    reviewDiv.classList.remove('hidden');

    let html = '<h3 class="mt-20" style="text-align:left">Review</h3>';
    questions.forEach((q, i) => {
        const userAnswerIdx = answers[i];
        let isCorrect = false;
        let selectedText = '';
        if (userAnswerIdx !== null) {
            selectedText = q.shuffledOptions[userAnswerIdx].substring(2).trim();
            isCorrect = (selectedText === q.originalCorrectText);
        }
        const correctIdx = q.shuffledOptions.findIndex(opt => opt.substring(2).trim() === q.originalCorrectText);
        const isFav = favorites.includes(q.id);

        html += `
            <div class="question-container mt-10" style="border-left: 4px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'}">
                <div class="question-header">
                    <span class="question-number">Q${q.number || (i+1)}</span>
                    <div class="question-actions">
                        <button class="icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${q.id}'); reviewExam();" title="Favorite">✦</button>
                        <button class="icon-btn" onclick="showLocation('${q.batchName}', '${q.number || i+1}', '${q.pageNumber}')" title="Location">📍</button>
                    </div>
                    <span style="color: ${isCorrect ? 'var(--success)' : 'var(--danger)'}; font-weight:600">
                        ${isCorrect ? '✓ Correct' : '✗ Wrong'}
                    </span>
                </div>
                <p class="question-text">${q.text}</p>
                <div class="options-list">
                    ${q.shuffledOptions.map((opt, oi) => {
                        let cls = 'option-btn';
                        if (oi === correctIdx) cls += ' correct';
                        if (oi === userAnswerIdx && oi !== correctIdx) cls += ' wrong';
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
// SEARCH, READONLY, WRONG, FAVORITES (مختصر)
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
        const searchText = (q.text + ' ' + q.optionsRaw.join(' ') + ' ' + q.explanation).toLowerCase();
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

function openReadonly(questionId) {
    const question = allQuestions.find(q => q.id === questionId);
    if (!question) return;

    const shuffled = shuffleOptions(question);
    showScreen('readonly-screen');
    const content = document.getElementById('readonly-content');
    const isFav = favorites.includes(question.id);
    const correctIdx = shuffled.shuffledOptions.findIndex(opt => opt.substring(2).trim() === question.correctAnswerText);

    content.innerHTML = `
        <div class="question-header">
            <span class="question-number">Question ${question.number}</span>
            <div class="question-actions">
                <button class="icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${question.id}'); openReadonly('${question.id}');" title="Favorite">✦</button>
                <button class="icon-btn" onclick="showLocation('${question.batchName}', '${question.number}', '${question.pageNumber}')" title="Location">📍</button>
            </div>
        </div>
        <p class="question-text">${question.text}</p>
        <div class="options-list">
            ${shuffled.shuffledOptions.map((opt, i) => `
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

function openWrongQuestions() {
    const questions = allQuestions.filter(q => wrongQuestions.includes(q.id));
    if (questions.length === 0) {
        showToast('No wrong questions yet!');
        return;
    }
    showQuestionListScreen(questions, 'Wrong Questions');
}

function openFavoriteQuestions() {
    const questions = allQuestions.filter(q => favorites.includes(q.id));
    if (questions.length === 0) {
        showToast('No favorite questions yet!');
        return;
    }
    showQuestionListScreen(questions, 'Favorite Questions');
}

function showQuestionListScreen(questions, title) {
    showScreen('selection-screen');
    document.getElementById('selection-title').textContent = title;
    document.getElementById('selection-search-container').classList.add('hidden');
    const list = document.getElementById('selection-list');
    list.innerHTML = '';
    
    questions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'selection-item';
        const shortText = q.text.length > 100 ? q.text.substring(0, 100) + '...' : q.text;
        const isFav = favorites.includes(q.id);
        item.innerHTML = `
            <div style="flex:1; padding: 10px;">
                <strong>Q${q.number}:</strong> ${shortText}
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">📚 ${q.batchName}</div>
            </div>
            <div class="question-actions" style="display:flex; gap:8px;">
                <button class="icon-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${q.id}'); showQuestionListScreen(questions, '${title}');" title="Favorite">✦</button>
                <button class="icon-btn" onclick="event.stopPropagation(); showLocation('${q.batchName}', '${q.number}', '${q.pageNumber}')" title="Location">📍</button>
            </div>
        `;
        item.onclick = () => openReadonly(q.id);
        list.appendChild(item);
    });
    
    document.getElementById('selection-footer').classList.add('hidden');
}

function toggleFavorite(questionId) {
    const idx = favorites.indexOf(questionId);
    if (idx > -1) {
        favorites.splice(idx, 1);
    } else {
        favorites.push(questionId);
    }
    saveFavorites();
    // تحديث الشاشات
    if (currentExam && !currentExam.submitted) renderExam();
    else if (document.getElementById('readonly-screen').classList.contains('active')) {
        const match = document.getElementById('readonly-content')?.innerHTML.match(/toggleFavorite\('([^']+)'/);
        if (match) openReadonly(match[1]);
    } else if (document.getElementById('selection-screen').classList.contains('active')) {
        const title = document.getElementById('selection-title').textContent;
        if (title === 'Wrong Questions') openWrongQuestions();
        else if (title === 'Favorite Questions') openFavoriteQuestions();
    }
}

function clearWrongQuestions() {
    if (confirm('Clear all wrong questions?')) {
        wrongQuestions = [];
        saveWrongQuestions();
        goHome();
        showToast('Wrong questions cleared');
    }
}

function clearFavorites() {
    if (confirm('Clear all favorites?')) {
        favorites = [];
        saveFavorites();
        goHome();
        showToast('Favorites cleared');
    }
}

// ============================================
// SETTINGS AND STATISTICS (تم إصلاحهما)
// ============================================
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    if (panel) {
        panel.classList.toggle('visible');
        // إخفاء لوحة الإحصائيات إذا كانت مفتوحة
        const statsPanel = document.getElementById('statistics-panel');
        if (statsPanel && statsPanel.classList.contains('visible')) {
            statsPanel.classList.remove('visible');
        }
    } else {
        console.warn('settings-panel not found');
    }
}

function toggleStatistics() {
    const panel = document.getElementById('statistics-panel');
    if (panel) {
        panel.classList.toggle('visible');
        if (panel.classList.contains('visible')) {
            renderStatistics();
            // إخفاء لوحة الإعدادات إذا كانت مفتوحة
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsPanel && settingsPanel.classList.contains('visible')) {
                settingsPanel.classList.remove('visible');
            }
        }
    } else {
        console.warn('statistics-panel not found');
    }
}

function renderStatistics() {
    const content = document.getElementById('stats-content');
    if (!content) return;
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between;">';

    // قسم السنوات
    html += '<div style="flex: 1; min-width: 280px; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;">';
    html += '<h4 style="color: var(--primary); margin-bottom: 16px;">📅 Years Statistics</h4>';
    allYears.forEach(year => {
        const key = `year-${year.name}`;
        const prog = progress[key] || { questionIds: [] };
        const total = year.questions.length;
        const answered = prog.questionIds ? prog.questionIds.length : 0;
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        html += `<div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="font-weight: 500; font-size: 0.9rem;">${year.name}</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${answered}/${total} (${pct}%)</span>
        </div>`;
    });
    const yearCompleted = allYears.filter(y => {
        const prog = progress[`year-${y.name}`] || { questionIds: [] };
        return prog.questionIds && prog.questionIds.length >= y.questions.length;
    }).length;
    const yearInProgress = allYears.filter(y => {
        const prog = progress[`year-${y.name}`] || { questionIds: [] };
        const answered = prog.questionIds ? prog.questionIds.length : 0;
        return answered > 0 && answered < y.questions.length;
    }).length;
    const yearNotStarted = allYears.length - yearCompleted - yearInProgress;
    const totalYears = allYears.length || 1;
    const yearCompletedPct = (yearCompleted / totalYears) * 100;
    const yearInProgressPct = (yearInProgress / totalYears) * 100;
    html += `<div style="margin-top: 20px; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 150px; height: 150px; border-radius: 50%; background: conic-gradient(
            var(--success) 0% ${yearCompletedPct}%,
            var(--warning) ${yearCompletedPct}% ${yearCompletedPct + yearInProgressPct}%,
            var(--border) ${yearCompletedPct + yearInProgressPct}% 100%
        );"></div>
        <div style="margin-top: 12px; display: flex; gap: 12px; font-size: 0.8rem;">
            <span>✅ ${yearCompleted} Completed</span>
            <span>🔄 ${yearInProgress} In Progress</span>
            <span>⬜ ${yearNotStarted} Not Started</span>
        </div>
    </div>`;
    html += '</div>';

    // قسم المحاضرات
    html += '<div style="flex: 1; min-width: 280px; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;">';
    html += '<h4 style="color: var(--primary); margin-bottom: 16px;">📚 Lectures Statistics</h4>';
    allLectures.forEach(lecture => {
        const key = `lecture-${lecture.name}`;
        const prog = progress[key] || { questionIds: [] };
        const total = lecture.questions.length;
        const answered = prog.questionIds ? prog.questionIds.length : 0;
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        html += `<div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="font-weight: 500; font-size: 0.9rem;">${lecture.name}</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${answered}/${total} (${pct}%)</span>
        </div>`;
    });
    const lectureCompleted = allLectures.filter(l => {
        const prog = progress[`lecture-${l.name}`] || { questionIds: [] };
        return prog.questionIds && prog.questionIds.length >= l.questions.length;
    }).length;
    const lectureInProgress = allLectures.filter(l => {
        const prog = progress[`lecture-${l.name}`] || { questionIds: [] };
        const answered = prog.questionIds ? prog.questionIds.length : 0;
        return answered > 0 && answered < l.questions.length;
    }).length;
    const lectureNotStarted = allLectures.length - lectureCompleted - lectureInProgress;
    const totalLectures = allLectures.length || 1;
    const lectureCompletedPct = (lectureCompleted / totalLectures) * 100;
    const lectureInProgressPct = (lectureInProgress / totalLectures) * 100;
    html += `<div style="margin-top: 20px; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 150px; height: 150px; border-radius: 50%; background: conic-gradient(
            var(--success) 0% ${lectureCompletedPct}%,
            var(--warning) ${lectureCompletedPct}% ${lectureCompletedPct + lectureInProgressPct}%,
            var(--border) ${lectureCompletedPct + lectureInProgressPct}% 100%
        );"></div>
        <div style="margin-top: 12px; display: flex; gap: 12px; font-size: 0.8rem;">
            <span>✅ ${lectureCompleted} Completed</span>
            <span>🔄 ${lectureInProgress} In Progress</span>
            <span>⬜ ${lectureNotStarted} Not Started</span>
        </div>
    </div>`;
    html += '</div>';
    html += '</div>';
    html += `<div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
        <span style="background: var(--border-light); padding: 8px 16px; border-radius: 20px;">⭐ ${favorites.length} Favorites</span>
        <span style="background: var(--border-light); padding: 8px 16px; border-radius: 20px;">❌ ${wrongQuestions.length} Wrong</span>
        <span style="background: var(--border-light); padding: 8px 16px; border-radius: 20px;">📋 ${allQuestions.length} Total Qs</span>
    </div>`;
    content.innerHTML = html;
}

function resetProgress() {
    if (confirm('Are you sure you want to reset ALL personal progress?')) {
        progress = {};
        favorites = [];
        wrongQuestions = [];
        localStorage.removeItem('exam-progress');
        localStorage.removeItem('exam-favorites');
        localStorage.removeItem('exam-wrong');
        localStorage.removeItem('exam-state');
        showToast('Personal progress reset.');
        if (document.getElementById('statistics-panel')?.classList.contains('visible')) renderStatistics();
    }
}

// ============================================
// EXAM SETTINGS BUTTON
// ============================================
function openExamSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
        // إظهارها فوق كل شيء
        settingsPanel.classList.toggle('visible');
        if (settingsPanel.classList.contains('visible')) {
            settingsPanel.style.zIndex = '2000';
            // إخفاء لوحة الإحصائيات إذا كانت مفتوحة
            const statsPanel = document.getElementById('statistics-panel');
            if (statsPanel) statsPanel.classList.remove('visible');
        } else {
            settingsPanel.style.zIndex = '';
        }
    } else {
        console.warn('settings-panel not found');
    }
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================
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
    updateStartButtonIcon();
}

function changeSound(sound) {
    const audio = document.getElementById('bg-audio');
    if (sound === 'none') {
        audio.pause();
        audio.src = '';
    } else {
        audio.src = `${sound}.mp3`;
        audio.volume = (settings.volume || 50) / 100;
        audio.play().catch(e => console.warn('Audio play failed'));
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
    const darkToggle = document.getElementById('dark-mode-toggle');
    if (darkToggle) darkToggle.checked = settings.darkMode || false;
    document.documentElement.setAttribute('data-dark', settings.darkMode || false);
    
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) themeSelector.value = settings.theme || 'default';
    document.documentElement.setAttribute('data-theme', settings.theme || 'default');
    
    const soundSelector = document.getElementById('sound-selector');
    if (soundSelector) soundSelector.value = settings.bgSound || 'none';
    
    const volumeControl = document.getElementById('volume-control');
    if (volumeControl) volumeControl.value = settings.volume || 50;
    
    const animationsToggle = document.getElementById('animations-toggle');
    if (animationsToggle) animationsToggle.checked = settings.animations !== false;
    document.documentElement.setAttribute('data-animations', settings.animations !== false);
    
    updateStartButtonIcon();
}

function updateStartButtonIcon() {
    const btn = document.getElementById('btn-start-exam');
    if (!btn) return;
    const theme = settings.theme || 'default';
    const icons = { default:'🚀', glassmorphism:'✨', 'minimal-dark':'🌑', 'medical-blue':'💉', neon:'💡', paper:'📜', 'soft-ivory':'🕯️', hackers:'👨‍💻', ghost:'👻', beach:'🏖️', desert:'🏜️' };
    btn.textContent = `${icons[theme] || '🚀'} Start Exam`;
}

// ============================================
// CELEBRATION (موحدة)
// ============================================
function showCelebration() {
    if (settings.animations === false) return;
    const canvas = document.getElementById('fireworks-canvas');
    canvas.classList.remove('hidden');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'];

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
        if (frame < 120) requestAnimationFrame(animate);
        else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.add('hidden'); }
    }
    animate();
}

// ============================================
// MODALS AND RESUME EXAM (تم إصلاح الاستئناف)
// ============================================
function buildModals() {
    if (!document.getElementById('custom-modal')) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'custom-modal';
        modalDiv.className = 'custom-modal hidden';
        modalDiv.innerHTML = `
            <div class="custom-modal-content">
                <h3 id="modal-title"></h3>
                <div id="modal-body"></div>
                <div id="modal-buttons" class="modal-buttons"></div>
            </div>
        `;
        document.body.appendChild(modalDiv);
        
        const style = document.createElement('style');
        style.textContent = `
            .custom-modal {
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(4px);
            }
            .custom-modal.hidden { display: none; }
            .custom-modal-content {
                background: var(--bg-card);
                border-radius: var(--radius);
                padding: 24px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                box-shadow: var(--shadow-lg);
                border: 1px solid var(--border);
                direction: rtl;
            }
            .custom-modal-content h3 {
                margin-bottom: 16px;
                color: var(--primary);
            }
            .modal-buttons {
                display: flex;
                gap: 12px;
                justify-content: center;
                margin-top: 24px;
                flex-wrap: wrap;
            }
            .modal-buttons button {
                padding: 10px 20px;
                border-radius: var(--radius-xs);
                font-size: 0.9rem;
                font-weight: 600;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }
}

function checkResumeExam() {
    try {
        const saved = localStorage.getItem('exam-state');
        if (saved) {
            const savedExam = JSON.parse(saved);
            if (savedExam && !savedExam.submitted) {
                showResumeModal(savedExam);
            } else {
                clearExamState();
            }
        }
    } catch(e) {
        console.warn('Error parsing exam state', e);
        clearExamState();
    }
}

function showResumeModal(savedExam) {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalButtons = document.getElementById('modal-buttons');
    
    modalTitle.textContent = 'استئناف الامتحان';
    modalBody.innerHTML = '<p>لديك امتحان غير مكتمل، هل تريد الاستمرار؟</p>';
    modalButtons.innerHTML = `
        <button class="btn-secondary" id="resume-no">لا</button>
        <button class="btn-primary" id="resume-yes">نعم</button>
    `;
    modal.classList.remove('hidden');
    
    document.getElementById('resume-yes').onclick = () => {
        modal.classList.add('hidden');
        currentExam = savedExam;
        // التأكد من أن الأسئلة تحتوي على shuffledOptions (قديمة من الحفظ) – إذا كانت مفقودة نعيد معالجتها
        if (currentExam.questions && currentExam.questions.length > 0 && !currentExam.questions[0].shuffledOptions) {
            // تم حفظ الامتحان بنسخة قديمة بدون shuffledOptions، نحتاج لإعادة معالجتها
            currentExam.questions = currentExam.questions.map(q => {
                if (!q.shuffledOptions) {
                    const shuffled = shuffleOptions(q);
                    return { ...q, shuffledOptions: shuffled.shuffledOptions, originalCorrectText: q.correctAnswerText };
                }
                return q;
            });
        }
        showScreen('exam-screen');
        renderExam();
        if (currentExam.mode === 'exam') startTimer();
    };
    document.getElementById('resume-no').onclick = () => {
        modal.classList.add('hidden');
        clearExamState();
        goHome();
    };
}

// إضافة مستمع لمنع فقدان الحالة عند إعادة تحميل الصفحة
window.addEventListener('beforeunload', (e) => {
    if (currentExam && !currentExam.submitted) {
        // تحذير عام (لا يمكن تخصيص الرسالة في المتصفحات الحديثة)
        e.preventDefault();
        e.returnValue = '';
    }
});

// ============================================
// LOCAL STORAGE
// ============================================
function saveSettings() { localStorage.setItem('exam-settings', JSON.stringify(settings)); }
function loadSettings() { try { settings = JSON.parse(localStorage.getItem('exam-settings')) || {}; } catch { settings = {}; } }
function saveProgress() {
    if (!currentExam) return;
    const { questions, firstAnswers } = currentExam;
    questions.forEach((q, i) => {
        if (firstAnswers[i] !== null) {
            const key = `${q.source}-${q.groupName}`;
            if (!progress[key]) progress[key] = { answered: 0, correct: 0, questionIds: [], correctIds: [] };
            if (!progress[key].questionIds) progress[key].questionIds = [];
            if (!progress[key].correctIds) progress[key].correctIds = [];
            if (!progress[key].questionIds.includes(q.id)) {
                progress[key].questionIds.push(q.id);
                progress[key].answered = progress[key].questionIds.length;
            }
            const selectedText = q.shuffledOptions[firstAnswers[i]].substring(2).trim();
            const isCorrect = (selectedText === q.originalCorrectText);
            if (isCorrect && !progress[key].correctIds.includes(q.id)) {
                progress[key].correctIds.push(q.id);
                progress[key].correct = progress[key].correctIds.length;
            }
        }
    });
    localStorage.setItem('exam-progress', JSON.stringify(progress));
}
function loadProgress() { try { progress = JSON.parse(localStorage.getItem('exam-progress')) || {}; } catch { progress = {}; } }
function saveFavorites() { localStorage.setItem('exam-favorites', JSON.stringify(favorites)); }
function loadFavorites() { try { favorites = JSON.parse(localStorage.getItem('exam-favorites')) || []; } catch { favorites = []; } }
function saveWrongQuestions() { localStorage.setItem('exam-wrong', JSON.stringify(wrongQuestions)); }
function loadWrongQuestions() { try { wrongQuestions = JSON.parse(localStorage.getItem('exam-wrong')) || []; } catch { wrongQuestions = []; } }
function saveExamState() { if (currentExam) localStorage.setItem('exam-state', JSON.stringify(currentExam)); }
function clearExamState() { localStorage.removeItem('exam-state'); }

// ============================================
// UTILITIES
// ============================================
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function showLocation(batch, number, page) { showToast(`${batch} · Q${number} · ${page}`); }

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
