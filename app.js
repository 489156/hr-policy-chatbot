// =============================================================================
// 사내규정 Q&A 챗봇 - 완전한 JavaScript 코드
// GitHub Pages 호환, 순수 클라이언트사이드 시스템  
// =============================================================================

// 전역 변수 선언
let policyData = null;
let isAdminLoggedIn = false;
let recentQuestions = [];
let chatLogs = [];
let currentCategoryFilter = 'all';

// DOM 요소 참조
let elements = {};

// 하이브리드 검색 설정
const SEARCH_WEIGHTS = {
    KEYWORD: 6,
    NUMERIC: 10,
    PROCEDURE: 8,
    CATEGORY_BONUS: 5
};

const MIN_CONFIDENCE_SCORE = 5;
const ADMIN_PASSWORD = "hr2025!";

// =============================================================================
// 1. 초기화 함수들
// =============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 사내규정 Q&A 챗봇 시작');
    initializeApplication();
});

function initializeApplication() {
    try {
        // DOM 요소 초기화
        initializeDOMElements();
        
        // 이벤트 리스너 설정
        setupEventListeners();
        
        // 데이터 로드
        loadPolicyData();
        
        // UI 초기화
        initializeUI();
        
        console.log('✅ 애플리케이션 초기화 완료');
    } catch (error) {
        console.error('❌ 초기화 실패:', error);
        showError('시스템 초기화에 실패했습니다.');
    }
}

function initializeDOMElements() {
    elements = {
        questionInput: document.getElementById('questionInput'),
        chatMessages: document.getElementById('chatMessages'),
        sendBtn: document.querySelector('.send-btn'),
        recentQuestions: document.getElementById('recentQuestions'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        adminModal: document.getElementById('adminModal'),
        adminPassword: document.getElementById('adminPassword'),
        adminPanel: document.getElementById('adminPanel'),
        regulationsList: document.getElementById('regulationsList'),
        faqList: document.getElementById('faqList'),
        categoryBar: document.getElementById('categoryBar'),
        queryLogs: document.getElementById('queryLogs')
    };
    
    console.log('📋 DOM 요소 초기화 완료');
}

function setupEventListeners() {
    // Enter 키로 질문 전송
    if (elements.questionInput) {
        elements.questionInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleQuestion();
            }
        });
        
        // 실시간 입력 제안 (향후 확장 가능)
        elements.questionInput.addEventListener('input', function(e) {
            // TODO: 실시간 검색 제안 기능
        });
    }
    
    console.log('🔗 이벤트 리스너 설정 완료');
}

function initializeUI() {
    // 로컬 스토리지에서 최근 질문 불러오기
    loadRecentQuestions();
    
    // 자주 묻는 질문 로드
    loadFAQ();
    
    console.log('🎨 UI 초기화 완료');
}

// =============================================================================
// 2. 데이터 로딩 함수들
// =============================================================================

async function loadPolicyData() {
    try {
        showLoading(true);
        
        const response = await fetch('./data.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        policyData = await response.json();
        
        if (!policyData || !policyData.policies || !Array.isArray(policyData.policies)) {
            throw new Error('유효하지 않은 데이터 형식입니다.');
        }
        
        console.log(`📊 정책 데이터 로드 완료: ${policyData.policies.length}개 규정`);
        
        // UI 업데이트
        updateAdminRegulationsList();
        loadFAQ();
        
        showLoading(false);
        
    } catch (error) {
        console.error('❌ 데이터 로딩 실패:', error);
        showError(`규정 데이터를 불러올 수 없습니다: ${error.message}`);
        showLoading(false);
    }
}

function showLoading(show) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    if (elements.chatMessages) {
        const errorHtml = `
            <div class="message bot-message error">
                <div class="message-avatar">❌</div>
                <div class="message-content">
                    <div class="error-content">
                        <h4>시스템 오류</h4>
                        <p>${message}</p>
                        <button onclick="location.reload()" class="retry-btn">페이지 새로고침</button>
                    </div>
                </div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        elements.chatMessages.innerHTML += errorHtml;
        scrollToBottom();
    }
}

// =============================================================================
// 3. 하이브리드 검색 엔진
// =============================================================================

function executeHybridSearch(query) {
    if (!policyData || !policyData.policies) {
        return [];
    }
    
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
    const results = [];
    
    console.log('🔍 검색 실행:', query, '→ 키워드:', queryWords);
    
    policyData.policies.forEach(policy => {
        // 카테고리 필터 적용
        if (currentCategoryFilter !== 'all' && policy.category !== currentCategoryFilter) {
            return;
        }
        
        policy.sections.forEach(section => {
            const score = calculateSectionScore(section, policy, queryLower, queryWords, query);
            
            if (score.total >= MIN_CONFIDENCE_SCORE) {
                results.push({
                    policy,
                    section,
                    totalScore: score.total,
                    scoreBreakdown: score.breakdown,
                    matchedQuery: query
                });
            }
        });
    });
    
    // 점수 내림차순으로 정렬하고 상위 10개만 반환
    return results
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 10);
}

function calculateSectionScore(section, policy, queryLower, queryWords, originalQuery) {
    const scoreBreakdown = {
        exactMatch: 0,
        keywordMatch: 0,
        amountMatch: 0,
        procedureMatch: 0,
        categoryBonus: 0
    };
    
    const sectionText = section.content.toLowerCase();
    const titleText = section.title.toLowerCase();
    
    // 1. 정확한 매칭 (최고 점수)
    if (sectionText.includes(queryLower) || titleText.includes(queryLower)) {
        scoreBreakdown.exactMatch = 15;
    }
    
    // 2. 키워드 매칭
    queryWords.forEach(word => {
        if (titleText.includes(word)) {
            scoreBreakdown.keywordMatch += 8;
        }
        if (sectionText.includes(word)) {
            scoreBreakdown.keywordMatch += 5;
        }
    });
    
    // 추가: 키워드 태그 매칭
    if (section.keywords) {
        section.keywords.forEach(keyword => {
            if (keyword.toLowerCase().includes(word)) {
                scoreBreakdown.keywordMatch += 6;
            }
        });
    }
    
    // 3. 숫자(금액) 매칭
    const queryNumbers = originalQuery.match(/\d+/g);
    if (queryNumbers && section.amounts) {
        queryNumbers.forEach(num => {
            const numValue = parseInt(num);
            if (section.amounts.includes(numValue)) {
                scoreBreakdown.amountMatch += 10;
            } else if (section.amounts.some(amount => Math.abs(amount - numValue) / amount < 0.1)) {
                scoreBreakdown.amountMatch += 5;
            }
        });
    }
    
    // 4. 절차 키워드 매칭
    const procedureKeywords = ['신청', '승인', '절차', '방법', '과정'];
    if (procedureKeywords.some(kw => queryLower.includes(kw))) {
        if (section.procedures && section.procedures.length > 0) {
            scoreBreakdown.procedureMatch = 8;
        }
    }
    
    // 5. 카테고리 보너스
    if (policy.category && queryLower.includes(policy.category)) {
        scoreBreakdown.categoryBonus = 5;
    }
    
    const totalScore = Object.values(scoreBreakdown).reduce((sum, score) => sum + score, 0);
    
    if (totalScore >= 5) {
        console.log(`📊 검색 결과: ${policy.title} §${section.section} - 점수: ${totalScore}`, scoreBreakdown);
    }
    
    return {
        total: totalScore,
        breakdown: scoreBreakdown
    };
}

// =============================================================================
// 4. 응답 생성 함수들
// =============================================================================

function generateStructuredResponse(searchResults, originalQuery) {
    if (!searchResults || searchResults.length === 0) {
        return generateNoResultResponse(originalQuery);
    }
    
    const topResult = searchResults;
    const { policy, section } = topResult;
    
    // 1. 결론 생성 (맞춤형)
    let conclusion = `${policy.title} ${section.section}조에 따르면, `;
    
    if (originalQuery.includes('상한') || originalQuery.includes('한도')) {
        conclusion += `해당 항목의 상한은 **${formatAmount(section.amounts)}**입니다.`;
    } else if (originalQuery.includes('절차') || originalQuery.includes('방법')) {
        conclusion += `절차는 **${section.procedures?.join(' → ') || '해당 부서 문의'}**입니다.`;
    } else if (originalQuery.includes('얼마') || originalQuery.includes('금액')) {
        conclusion += `관련 금액 기준은 **${formatAmount(section.amounts)}**입니다.`;
    } else {
        conclusion += `${highlightImportantInfo(section.content)}`;
    }
    
    // 2. 핵심 정보 추출
    const keyInfo = extractKeyInfo(section, originalQuery);
    
    // 3. 다음 단계 생성
    let nextSteps = `${policy.owner}에 문의하거나 관련 신청서를 작성하세요.`;
    if (section.procedures && section.procedures.length > 0) {
        nextSteps = section.procedures.join(' → ');
    }
    
    // 4. 주의사항 수집
    const warnings = [];
    if (section.exceptions && section.exceptions.length > 0) {
        warnings.push(...section.exceptions);
    }
    if (policy.status !== 'active') {
        warnings.push('⚠️ 주의: 현재 비활성 상태인 규정입니다.');
    }
    
    return {
        conclusion: conclusion,
        keyInfo: keyInfo,
        source: {
            title: policy.title,
            version: policy.version,
            effectiveDate: policy.effectiveDate,
            section: `§${section.section}`,
            owner: policy.owner
        },
        nextSteps: nextSteps,
        warnings: warnings.length > 0 ? warnings : null,
        confidence: calculateConfidence(topResult.totalScore),
        additionalResults: searchResults.slice(1, 3) // 추가 관련 결과
    };
}

function generateNoResultResponse(query) {
    return {
        conclusion: `**"${query}"**에 대한 정확한 규정을 찾을 수 없습니다. HR팀 상담을 권장합니다.`,
        keyInfo: null,
        source: null,
        nextSteps: "HR팀 상담 티켓을 생성하거나 직접 문의하세요.",
        warnings: ["정확한 답변을 위해 HR팀에 문의해 주세요."],
        confidence: 0,
        isTicketNeeded: true
    };
}

function extractKeyInfo(section, query) {
    const keyInfo = {};
    
    // 금액 정보 추출
    if (section.amounts && section.amounts.length > 0) {
        if (query.includes('tier1') || query.includes('Tier1')) {
            const tier1Amounts = section.content.match(/Tier1[^0-9]*(\d{1,3}(?:,\d{3})*)/gi);
            if (tier1Amounts) {
                keyInfo['Tier1 기준'] = tier1Amounts.match(/(\d{1,3}(?:,\d{3})*)/) + '원';
            }
        }
        if (query.includes('tier2') || query.includes('Tier2')) {
            const tier2Amounts = section.content.match(/Tier2[^0-9]*(\d{1,3}(?:,\d{3})*)/gi);
            if (tier2Amounts) {
                keyInfo['Tier2 기준'] = tier2Amounts.match(/(\d{1,3}(?:,\d{3})*)/) + '원';
            }
        }
        
        // 일반 금액 정보
        section.amounts.forEach((amount, index) => {
            if (amount >= 1000) {
                keyInfo[`금액 ${index + 1}`] = amount.toLocaleString() + '원';
            } else if (amount <= 30) {
                keyInfo[`일수/개수`] = amount + '일';
            }
        });
    }
    
    // 절차 정보
    if (section.procedures && section.procedures.length > 0) {
        keyInfo['처리 절차'] = section.procedures.join(' → ');
    }
    
    return Object.keys(keyInfo).length > 0 ? keyInfo : null;
}

function highlightImportantInfo(content) {
    let highlighted = content;
    
    // 금액 강조
    highlighted = highlighted.replace(/(\d{1,3}(?:,\d{3})*원)/g, '<span class="amount-highlight">$1</span>');
    
    // Tier 강조  
    highlighted = highlighted.replace(/(Tier)/gi, '<strong>$1</strong>');
    
    // 일수 강조
    highlighted = highlighted.replace(/(\d+일)/g, '<strong style="color: var(--success-color)">$1</strong>');
    
    // 중요 키워드 강조
    const importantKeywords = ['필수', '금지', '예외', '승인', '신청'];
    importantKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        highlighted = highlighted.replace(regex, '<strong style="color: var(--primary-color)">$1</strong>');
    });
    
    return highlighted;
}

function formatAmount(amounts) {
    if (!amounts || amounts.length === 0) return '';
    
    return amounts
        .filter(amount => amount >= 1000)
        .map(amount => amount.toLocaleString() + '원')
        .join(', ');
}

function calculateConfidence(score) {
    // 0-100% 신뢰도 계산
    const maxScore = 50; // 예상 최대 점수
    let confidence = Math.min(100, Math.round((score / maxScore) * 100));
    
    // 최소 30% 보장
    if (confidence < 30) confidence = 30;
    
    return confidence;
}

// =============================================================================
// 5. UI 업데이트 함수들  
// =============================================================================

function handleQuestion() {
    const query = elements.questionInput?.value.trim();
    
    if (!query) {
        alert('질문을 입력해 주세요.');
        elements.questionInput?.focus();
        return;
    }
    
    if (!policyData) {
        alert('규정 데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.');
        return;
    }
    
    // 사용자 질문 표시
    displayUserMessage(query);
    
    // 검색 실행 및 답변 생성
    performSearch(query);
    
    // 입력창 초기화
    elements.questionInput.value = '';
    
    // 최근 질문에 추가
    addToRecentQuestions(query);
}

function askQuestion(question) {
    if (elements.questionInput) {
        elements.questionInput.value = question;
        elements.questionInput.focus();
        handleQuestion();
    }
}

function displayUserMessage(message) {
    const messageHtml = `
        <div class="message user-message">
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <p>${escapeHtml(message)}</p>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    
    elements.chatMessages.innerHTML += messageHtml;
    scrollToBottom();
}

function performSearch(query) {
    try {
        console.log('🔎 검색 시작:', query);
        
        // 로딩 메시지 표시
        const loadingId = showLoadingMessage();
        
        // 검색 실행
        const results = executeHybridSearch(query);
        
        // 로딩 메시지 제거
        removeLoadingMessage(loadingId);
        
        // 응답 생성 및 표시
        const response = generateStructuredResponse(results, query);
        displayBotResponse(response, query);
        
        // 로그 저장
        saveChatLog(query, response, results.length);
        
        console.log('✅ 검색 완료:', {
            query: query,
            resultsCount: results.length,
            category: currentCategoryFilter,
            topScore: results?.totalScore || 0
        });
        
    } catch (error) {
        console.error('❌ 검색 오류:', error);
        removeLoadingMessage(loadingId);
        displayErrorMessage('검색 중 오류가 발생했습니다.');
    }
}

function showLoadingMessage() {
    const loadingId = `loading-${Date.now()}`;
    const loadingHtml = `
        <div id="${loadingId}" class="message bot-message loading">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
                <p>규정을 검색하고 있습니다...</p>
            </div>
        </div>
    `;
    
    elements.chatMessages.innerHTML += loadingHtml;
    scrollToBottom();
    return loadingId;
}

function removeLoadingMessage(loadingId) {
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) {
        loadingElement.remove();
    }
}

function displayBotResponse(response, originalQuery) {
    const confidence = response.confidence || 0;
    const confidenceClass = getConfidenceClass(confidence);
    
    let responseHtml = `
        <div class="message bot-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="response-header">
                    <div class="confidence-badge ${confidenceClass}">
                        신뢰도 ${confidence}%
                    </div>
                </div>
                ${createAnswerSectionsHTML(response)}
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    
    elements.chatMessages.innerHTML += responseHtml;
    scrollToBottom();
}

function createAnswerSectionsHTML(response) {
    let html = '';
    
    // 1. 결론
    html += `
        <div class="answer-section">
            <div class="section-header">
                <span class="section-icon">📋</span>
                <h3 class="section-title">결론</h3>
            </div>
            <div class="conclusion-content">
                ${response.conclusion}
            </div>
        </div>
    `;
    
    // 2. 핵심 정보
    if (response.keyInfo) {
        html += `
            <div class="answer-section">
                <div class="section-header">
                    <span class="section-icon">📊</span>
                    <h3 class="section-title">핵심 정보</h3>
                </div>
                <table class="key-info-table">
                    <tbody>
                        ${Object.entries(response.keyInfo).map(([key, value]) => `
                            <tr>
                                <th>${key}</th>
                                <td>${formatAmount(value)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // 3. 출처
    if (response.source) {
        html += `
            <div class="answer-section">
                <div class="section-header">
                    <span class="section-icon">📚</span>
                    <h3 class="section-title">출처</h3>
                </div>
                <div class="source-info">
                    <div class="source-badge">
                        <div class="source-title">${response.source.title}</div>
                        <div class="source-meta">
                            ${response.source.version} | ${response.source.effectiveDate} | ${response.source.section} | ${response.source.owner}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 4. 다음 단계
    html += `
        <div class="answer-section">
            <div class="section-header">
                <span class="section-icon">⏭️</span>
                <h3 class="section-title">다음 단계</h3>
            </div>
            <div class="next-steps-content">
                <p>${response.nextSteps}</p>
                <div class="action-buttons">
                    ${response.isTicketNeeded ? 
                        '<button class="action-button" onclick="contactHR(\'email\')">HR팀 이메일</button>' +
                        '<button class="action-button" onclick="contactHR(\'phone\')">HR팀 전화</button>' :
                        '<button class="action-button" onclick="contactHR(\'email\')">문의하기</button>'
                    }
                    <button class="action-button" onclick="copyResult('${escapeQuotes(response.conclusion)}')">결과 복사</button>
                </div>
            </div>
        </div>
    `;
    
    // 5. 주의사항
    if (response.warnings && response.warnings.length > 0) {
        html += `
            <div class="answer-section">
                <div class="section-header">
                    <span class="section-icon">⚠️</span>
                    <h3 class="section-title">주의사항</h3>
                </div>
                <div class="warnings-content">
                    ${response.warnings.map(warning => `
                        <div class="warning-item">
                            <span class="warning-icon">⚠️</span>
                            <span>${warning}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    return html;
}

function getConfidenceClass(confidence) {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium'; 
    return 'low';
}

function scrollToBottom() {
    if (elements.chatMessages) {
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }
}

function displayErrorMessage(message) {
    const errorHtml = `
        <div class="message bot-message error">
            <div class="message-avatar">❌</div>
            <div class="message-content">
                <p>${message}</p>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    
    elements.chatMessages.innerHTML += errorHtml;
    scrollToBottom();
}

// =============================================================================
// 6. 유틸리티 함수들
// =============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function addToRecentQuestions(question) {
    // 중복 제거
    recentQuestions = recentQuestions.filter(q => q !== question);
    
    // 맨 앞에 추가
    recentQuestions.unshift(question);
    
    // 최대 5개만 유지
    if (recentQuestions.length > 5) {
        recentQuestions = recentQuestions.slice(0, 5);
    }
    
    // 로컬 스토리지에 저장
    try {
        localStorage.setItem('hr-chatbot-recent', JSON.stringify(recentQuestions));
    } catch (e) {
        console.warn('로컬 스토리지 저장 실패:', e);
    }
    
    // UI 업데이트
    updateRecentQuestionsUI();
}

function loadRecentQuestions() {
    try {
        const saved = localStorage.getItem('hr-chatbot-recent');
        if (saved) {
            recentQuestions = JSON.parse(saved);
            updateRecentQuestionsUI();
        }
    } catch (e) {
        console.warn('최근 질문 로드 실패:', e);
        recentQuestions = [];
    }
}

function updateRecentQuestionsUI() {
    if (!elements.recentQuestions) return;
    
    if (recentQuestions.length === 0) {
        elements.recentQuestions.innerHTML = '<p class="empty-text">최근 질문이 없습니다</p>';
        return;
    }
    
    elements.recentQuestions.innerHTML = recentQuestions
        .map(question => `
            <button class="recent-question-btn" onclick="askQuestion('${escapeQuotes(question)}')">
                ${escapeHtml(question)}
            </button>
        `).join('');
}

function loadFAQ() {
    if (!elements.faqList || !policyData?.commonQuestions) return;
    
    elements.faqList.innerHTML = policyData.commonQuestions
        .map(item => `
            <button class="faq-item" onclick="askQuestion('${escapeQuotes(item.question)}')">
                <div class="faq-question">${escapeHtml(item.question)}</div>
                <div class="faq-category">${escapeHtml(item.category)}</div>
            </button>
        `).join('');
}

function saveChatLog(question, response, resultsCount) {
    const log = {
        timestamp: new Date().toISOString(),
        question: question,
        answerSummary: response.conclusion?.slice(0, 100) || 'No answer',
        confidence: response.confidence || 0,
        resultsCount: resultsCount,
        category: currentCategoryFilter,
        source: response.source?.title || 'No source'
    };
    
    chatLogs.unshift(log);
    
    // 최대 50개 로그만 유지
    if (chatLogs.length > 50) {
        chatLogs = chatLogs.slice(0, 50);
    }
    
    updateAdminLogsUI();
}

// =============================================================================
// 7. 관리자 기능들
// =============================================================================

function toggleAdminMode() {
    if (!isAdminLoggedIn) {
        if (elements.adminModal) {
            elements.adminModal.classList.toggle('hidden');
            elements.adminPassword?.focus();
        }
    } else {
        if (elements.adminPanel) {
            elements.adminPanel.classList.toggle('hidden');
        }
    }
}

function adminLogin() {
    const password = elements.adminPassword?.value;
    
    if (password === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        elements.adminModal?.classList.add('hidden');
        elements.adminPanel?.classList.remove('hidden');
        elements.adminPassword.value = '';
        
        updateAdminRegulationsList();
        updateAdminLogsUI();
        
        console.log('✅ 관리자 로그인 성공');
    } else {
        alert('잘못된 비밀번호입니다.');
        elements.adminPassword?.focus();
    }
}

function updateAdminRegulationsList() {
    if (!elements.regulationsList || !policyData?.policies) return;
    
    elements.regulationsList.innerHTML = policyData.policies
        .map(policy => `
            <div class="regulation-item">
                <div class="regulation-header">
                    <strong>${policy.title}</strong>
                    <span class="regulation-meta">${policy.version} | ${policy.effectiveDate}</span>
                </div>
                <div class="regulation-details">
                    <span class="regulation-owner">${policy.owner}</span>
                    <span class="regulation-category">${policy.category}</span>
                    <span class="regulation-status ${policy.status}">${policy.status}</span>
                </div>
                <div class="regulation-sections">
                    ${policy.sections.length}개 조항
                </div>
            </div>
        `).join('');
}

function updateAdminLogsUI() {
    if (!elements.queryLogs) return;
    
    if (chatLogs.length === 0) {
        elements.queryLogs.innerHTML = '<p class="empty-text">질의응답 로그가 없습니다</p>';
        return;
    }
    
    elements.queryLogs.innerHTML = chatLogs
        .slice(0, 20) // 최근 20개만 표시
        .map(log => `
            <div class="log-item">
                <div class="log-header">
                    <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
                    <span class="log-confidence ${getConfidenceClass(log.confidence)}">
                        ${log.confidence}%
                    </span>
                </div>
                <div class="log-question">${escapeHtml(log.question)}</div>
                <div class="log-answer">${escapeHtml(log.answerSummary)}...</div>
                <div class="log-meta">
                    <span>${log.source}</span>
                    <span>${log.resultsCount}개 결과</span>
                    <span>${log.category}</span>
                </div>
            </div>
        `).join('');
}

// =============================================================================
// 8. 카테고리 및 필터 기능들
// =============================================================================

function toggleCategoryFilter() {
    if (elements.categoryBar) {
        elements.categoryBar.classList.toggle('hidden');
    }
}

function filterByCategory(category) {
    currentCategoryFilter = category;
    
    // 활성 상태 업데이트
    document.querySelectorAll('.category-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    console.log('🏷️ 카테고리 필터 변경:', category);
}

// =============================================================================
// 9. 외부 연동 함수들
// =============================================================================

function contactHR(type) {
    switch(type) {
        case 'email':
            window.open('mailto:hr@company.com?subject=사내규정 문의', '_blank');
            break;
        case 'phone':
            alert('HR팀 전화번호: 02-1234-5678\n\n업무시간: 평일 09:00-18:00');
            break;
        default:
            alert('HR팀 연락처:\n📞 02-1234-5678\n📧 hr@company.com');
    }
}

function copyResult(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('결과가 클립보드에 복사되었습니다!');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        document.execCommand('copy');
        alert('결과가 복사되었습니다!');
    } catch (err) {
        alert('복사에 실패했습니다. 수동으로 복사해 주세요.');
    } finally {
        document.body.removeChild(textArea);
    }
}

// =============================================================================
// 10. 디버그 및 개발 도구들
// =============================================================================

// 개발자 콘솔에서 사용할 수 있는 디버그 함수들
if (typeof window !== 'undefined') {
    window.hrChatbotDebug = {
        // 현재 데이터 확인
        showData: () => {
            console.log('📊 정책 데이터:', policyData);
        },
        
        // 검색 테스트
        testSearch: (query) => {
            if (!policyData) {
                console.log('데이터가 로드되지 않았습니다');
                return;
            }
            const results = executeHybridSearch(query);
            console.log(`검색어: "${query}"`, results);
            return results;
        },
        
        // 히스토리 확인
        showHistory: () => {
            console.log('📜 검색 히스토리:', recentQuestions);
        },
        
        // 통계 정보
        getStats: () => {
            return {
                totalPolicies: policyData?.policies?.length || 0,
                currentCategory: currentCategoryFilter,
                searchHistoryLength: recentQuestions.length,
                chatLogsLength: chatLogs.length
            };
        }
    };
    
    console.log('🛠️ 디버그 도구가 window.hrChatbotDebug에 추가되었습니다');
}
