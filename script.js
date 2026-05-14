const DEFAULT_API_PATH = '/api/chat';

let conversations = JSON.parse(localStorage.getItem('conversations') || '{}');
let currentConversationId = null;
let apiKey = localStorage.getItem('hackclubApiKey') || '';
let settings = JSON.parse(localStorage.getItem('chatSettings') || 'null') || {
  backendUrl: '',
  systemPrompt: 'You are a helpful, friendly assistant.',
  contextPrompt: '',
  temperature: 0.7,
  maxTokens: 2048,
  streamResponse: true,
  theme: 'light'
};
let isGenerating = false;

const elements = {
  messagesContainer: document.getElementById('messagesContainer'),
  messages: document.getElementById('messages'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  settingsApiKey: document.getElementById('settingsApiKey'),
  backendUrl: document.getElementById('backendUrl'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  apiKeyNote: document.getElementById('apiKeyNote'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  charCount: document.getElementById('charCount'),
  modelSelect: document.getElementById('modelSelect'),
  chatHistory: document.getElementById('chatHistory'),
  chatTitle: document.getElementById('chatTitle'),
  newChatBtn: document.getElementById('newChatBtn'),
  clearBtn: document.getElementById('clearBtn'),
  exportBtn: document.getElementById('exportBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettings: document.getElementById('closeSettings'),
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  systemPrompt: document.getElementById('systemPrompt'),
  contextPrompt: document.getElementById('contextPrompt'),
  temperature: document.getElementById('temperature'),
  tempValue: document.getElementById('tempValue'),
  maxTokens: document.getElementById('maxTokens'),
  streamResponse: document.getElementById('streamResponse'),
  themeSelect: document.getElementById('themeSelect'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  sidebar: document.querySelector('.sidebar'),
  toastContainer: document.getElementById('toastContainer')
};

init();

function init() {
  applyTheme(settings.theme);
  loadSettings();
  syncApiKeyInputs();
  updateApiKeyUI();
  setupEventListeners();
  renderChatHistory();
  autoResizeTextarea();

  if (window.location.protocol === 'file:') {
    showToast('Open the app through http://localhost:3000 after running node server.js', 'error');
  }

  if (isGitHubPages() && !normalizeBackendUrl(settings.backendUrl)) {
    showToast('GitHub Pages cannot run /api/chat. Add a backend URL in Settings.', 'warning');
  }

  const lastConversationId = localStorage.getItem('lastConversationId');
  if (lastConversationId && conversations[lastConversationId]) {
    loadConversation(lastConversationId);
  }
}

function setupEventListeners() {
  elements.messageInput.addEventListener('input', handleInputChange);
  elements.messageInput.addEventListener('keydown', handleKeyDown);
  elements.sendBtn.addEventListener('click', sendMessage);

  elements.apiKeyInput.addEventListener('input', syncApiKeyDraftFromPrompt);
  elements.settingsApiKey.addEventListener('input', syncApiKeyDraftFromSettings);
  elements.apiKeyInput.addEventListener('keydown', handleApiKeyKeyDown);
  elements.settingsApiKey.addEventListener('keydown', handleApiKeyKeyDown);
  elements.saveApiKeyBtn.addEventListener('click', () => saveApiKey(elements.apiKeyInput.value.trim()));
  elements.clearApiKeyBtn.addEventListener('click', clearApiKey);

  elements.newChatBtn.addEventListener('click', startNewChat);
  elements.clearBtn.addEventListener('click', clearCurrentChat);
  elements.exportBtn.addEventListener('click', exportChat);

  elements.settingsBtn.addEventListener('click', () => toggleModal(true));
  elements.closeSettings.addEventListener('click', () => toggleModal(false));
  elements.saveSettings.addEventListener('click', saveSettingsHandler);
  elements.resetSettings.addEventListener('click', resetSettingsHandler);
  elements.temperature.addEventListener('input', e => {
    elements.tempValue.textContent = e.target.value;
  });
  elements.themeSelect.addEventListener('change', e => {
    settings.theme = e.target.value;
    applyTheme(settings.theme);
  });
  elements.settingsModal.addEventListener('click', e => {
    if (e.target === elements.settingsModal) {
      toggleModal(false);
    }
  });

  elements.mobileMenuBtn.addEventListener('click', () => {
    elements.sidebar.classList.toggle('open');
  });

  document.querySelectorAll('.quick-prompt').forEach(button => {
    button.addEventListener('click', () => {
      elements.messageInput.value = button.dataset.prompt;
      handleInputChange();
      sendMessage();
    });
  });

  document.addEventListener('click', e => {
    if (
      window.innerWidth <= 768 &&
      !elements.sidebar.contains(e.target) &&
      !elements.mobileMenuBtn.contains(e.target)
    ) {
      elements.sidebar.classList.remove('open');
    }
  });
}

function handleInputChange() {
  elements.charCount.textContent = elements.messageInput.value.length;
  updateComposerState();
  autoResizeTextarea();
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!elements.sendBtn.disabled) {
      sendMessage();
    }
  }
}

function handleApiKeyKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveApiKey((e.target.value || '').trim());
  }
}

function syncApiKeyDraftFromPrompt() {
  elements.settingsApiKey.value = elements.apiKeyInput.value;
}

function syncApiKeyDraftFromSettings() {
  elements.apiKeyInput.value = elements.settingsApiKey.value;
}

function autoResizeTextarea() {
  const textarea = elements.messageInput;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

async function sendMessage() {
  if (window.location.protocol === 'file:') {
    showToast('This chat must run from http://localhost:3000, not file://', 'error');
    return;
  }

  if (!getApiUrl()) {
    showToast(getHostingHelpMessage(), 'error');
    toggleModal(true);
    return;
  }

  if (!hasApiKey()) {
    showToast('Add your Hack Club API key to start chatting.', 'warning');
    elements.apiKeyInput.focus();
    return;
  }

  const content = elements.messageInput.value.trim();
  if (!content || isGenerating) {
    return;
  }

  if (!currentConversationId) {
    currentConversationId = generateId();
    conversations[currentConversationId] = {
      id: currentConversationId,
      title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
      messages: [],
      createdAt: Date.now()
    };
  }

  elements.welcomeScreen.classList.add('hidden');

  const userMessage = {
    role: 'user',
    content,
    timestamp: Date.now()
  };

  conversations[currentConversationId].messages.push(userMessage);
  renderMessage(userMessage);

  elements.messageInput.value = '';
  handleInputChange();

  saveConversations();
  renderChatHistory();
  updateChatTitle();

  await generateResponse();
}

async function generateResponse() {
  isGenerating = true;
  updateComposerState();

  const typingDiv = createTypingIndicator();
  elements.messages.appendChild(typingDiv);
  scrollToBottom();

  const model = elements.modelSelect.value;
  const messages = buildMessages();

  try {
    if (settings.streamResponse) {
      await streamResponse(model, messages, typingDiv);
    } else {
      await fetchResponse(model, messages, typingDiv);
    }
  } catch (error) {
    console.error('API Error:', error);
    typingDiv.remove();
    showToast(error.message || 'Failed to get response. Please try again.', 'error');
  } finally {
    isGenerating = false;
    updateComposerState();
  }
}

function buildMessages() {
  const messages = [];

  if (settings.systemPrompt.trim()) {
    messages.push({ role: 'system', content: settings.systemPrompt.trim() });
  }

  if (settings.contextPrompt.trim()) {
    messages.push({
      role: 'system',
      content: `User context:\n${settings.contextPrompt.trim()}`
    });
  }

  const conversation = conversations[currentConversationId];
  for (const message of conversation.messages) {
    messages.push({ role: message.role, content: message.content });
  }

  return messages;
}

async function streamResponse(model, messages, typingDiv) {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hackclub-Api-Key': apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: parseFloat(settings.temperature),
      max_tokens: parseInt(settings.maxTokens, 10),
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  if (!response.body) {
    return fetchResponse(model, messages, typingDiv);
  }

  typingDiv.remove();

  const assistantMessage = { role: 'assistant', content: '', timestamp: Date.now() };
  const messageElement = renderMessage(assistantMessage, true);
  const bubbleElement = messageElement.querySelector('.message-bubble');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const lines = event.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta || {};
          const chunkText = delta.content || delta.reasoning || '';

          if (chunkText) {
            fullContent += chunkText;
            bubbleElement.innerHTML = formatMarkdown(fullContent);
            scrollToBottom();
          }
        } catch (error) {
          buffer = `${event}\n\n${buffer}`;
          break;
        }
      }
    }

    if (done) {
      break;
    }
  }

  assistantMessage.content = fullContent || 'No response received.';
  conversations[currentConversationId].messages.push(assistantMessage);
  saveConversations();
}

async function fetchResponse(model, messages, typingDiv) {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hackclub-Api-Key': apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: parseFloat(settings.temperature),
      max_tokens: parseInt(settings.maxTokens, 10)
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const data = await response.json();
  const content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.message?.reasoning ||
    'No response received.';

  typingDiv.remove();

  const assistantMessage = { role: 'assistant', content, timestamp: Date.now() };
  conversations[currentConversationId].messages.push(assistantMessage);
  renderMessage(assistantMessage);
  saveConversations();
  scrollToBottom();
}

function renderMessage(message, isStreaming = false) {
  const div = document.createElement('div');
  div.className = `message ${message.role}`;

  const avatar = message.role === 'user' ? 'ME' : 'SL';
  const formattedContent = message.role === 'assistant'
    ? formatMarkdown(message.content)
    : escapeHtml(message.content);

  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-bubble">${isStreaming ? '' : formattedContent}</div>
      <div class="message-actions">
        <button class="message-action-btn copy-btn" title="Copy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        </button>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
    </div>
  `;

  div.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(message.content);
    showToast('Copied to clipboard!', 'success');
  });

  elements.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function createTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">SL</div>
    <div class="message-content">
      <div class="message-bubble">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;
  return div;
}

function renderChatHistory() {
  const sorted = Object.values(conversations).sort((a, b) => b.createdAt - a.createdAt);

  elements.chatHistory.innerHTML = sorted.map(conversation => `
    <div class="chat-history-item ${conversation.id === currentConversationId ? 'active' : ''}" data-id="${conversation.id}">
      <span class="chat-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
        </svg>
      </span>
      <span class="chat-title">${escapeHtml(conversation.title)}</span>
      <button class="delete-chat" data-id="${conversation.id}" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('');

  elements.chatHistory.querySelectorAll('.chat-history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (!e.target.closest('.delete-chat')) {
        loadConversation(item.dataset.id);
        elements.sidebar.classList.remove('open');
      }
    });
  });

  elements.chatHistory.querySelectorAll('.delete-chat').forEach(button => {
    button.addEventListener('click', e => {
      e.stopPropagation();
      deleteConversation(button.dataset.id);
    });
  });
}

function loadConversation(id) {
  currentConversationId = id;
  const conversation = conversations[id];
  if (!conversation) {
    return;
  }

  elements.messages.innerHTML = '';
  elements.welcomeScreen.classList.add('hidden');
  conversation.messages.forEach(renderMessage);
  updateChatTitle();
  renderChatHistory();
  localStorage.setItem('lastConversationId', id);
  scrollToBottom();
}

function updateChatTitle() {
  if (currentConversationId && conversations[currentConversationId]) {
    elements.chatTitle.textContent = conversations[currentConversationId].title;
  } else {
    elements.chatTitle.textContent = 'New Conversation';
  }
}

function startNewChat() {
  currentConversationId = null;
  elements.messages.innerHTML = '';
  elements.welcomeScreen.classList.remove('hidden');
  elements.chatTitle.textContent = 'New Conversation';
  renderChatHistory();
  elements.sidebar.classList.remove('open');
  localStorage.removeItem('lastConversationId');
}

function clearCurrentChat() {
  if (!currentConversationId) {
    return;
  }

  if (confirm('Are you sure you want to clear this conversation?')) {
    conversations[currentConversationId].messages = [];
    saveConversations();
    elements.messages.innerHTML = '';
    elements.welcomeScreen.classList.remove('hidden');
    showToast('Conversation cleared', 'success');
  }
}

function deleteConversation(id) {
  if (confirm('Delete this conversation?')) {
    delete conversations[id];
    saveConversations();

    if (id === currentConversationId) {
      startNewChat();
    }

    renderChatHistory();
    showToast('Conversation deleted', 'success');
  }
}

function exportChat() {
  if (!currentConversationId) {
    return;
  }

  const conversation = conversations[currentConversationId];
  const text = conversation.messages
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n---\n\n');

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${conversation.title}.txt`;
  link.click();
  URL.revokeObjectURL(url);

  showToast('Chat exported!', 'success');
}

function loadSettings() {
  elements.settingsApiKey.value = apiKey;
  elements.backendUrl.value = settings.backendUrl || '';
  elements.systemPrompt.value = settings.systemPrompt;
  elements.contextPrompt.value = settings.contextPrompt || '';
  elements.temperature.value = settings.temperature;
  elements.tempValue.textContent = settings.temperature;
  elements.maxTokens.value = settings.maxTokens;
  elements.streamResponse.checked = settings.streamResponse;
  elements.themeSelect.value = settings.theme;
}

function saveSettingsHandler() {
  const nextApiKey = elements.settingsApiKey.value.trim();
  if (nextApiKey !== apiKey) {
    if (nextApiKey) {
      saveApiKey(nextApiKey, false);
    } else {
      clearApiKey(false);
    }
  }

  settings.systemPrompt = elements.systemPrompt.value;
  settings.backendUrl = normalizeBackendUrl(elements.backendUrl.value);
  settings.contextPrompt = elements.contextPrompt.value;
  settings.temperature = parseFloat(elements.temperature.value);
  settings.maxTokens = parseInt(elements.maxTokens.value, 10);
  settings.streamResponse = elements.streamResponse.checked;
  settings.theme = elements.themeSelect.value;

  localStorage.setItem('chatSettings', JSON.stringify(settings));
  applyTheme(settings.theme);
  toggleModal(false);
  showToast('Settings saved!', 'success');
}

function resetSettingsHandler() {
  settings = {
    backendUrl: '',
    systemPrompt: 'You are a helpful, friendly assistant.',
    contextPrompt: '',
    temperature: 0.7,
    maxTokens: 2048,
    streamResponse: true,
    theme: 'light'
  };
  loadSettings();
  applyTheme(settings.theme);
  showToast('Settings reset to default', 'success');
}

function toggleModal(show) {
  elements.settingsModal.classList.toggle('active', show);
}

function applyTheme(theme) {
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button class="toast-close">&times;</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideInRight var(--transition-normal) reverse';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function saveApiKey(nextKey, showConfirmation = true) {
  if (!nextKey) {
    showToast('Paste a Hack Club API key first.', 'warning');
    return false;
  }

  apiKey = nextKey;
  localStorage.setItem('hackclubApiKey', apiKey);
  syncApiKeyInputs();
  updateApiKeyUI();

  if (showConfirmation) {
    showToast('API key saved.', 'success');
  }

  return true;
}

function clearApiKey(showConfirmation = true) {
  apiKey = '';
  localStorage.removeItem('hackclubApiKey');
  syncApiKeyInputs();
  updateApiKeyUI();

  if (showConfirmation) {
    showToast('API key cleared.', 'success');
  }
}

function syncApiKeyInputs() {
  elements.apiKeyInput.value = apiKey;
  elements.settingsApiKey.value = apiKey;
}

function updateApiKeyUI() {
  const saved = hasApiKey();
  elements.apiKeyStatus.textContent = saved ? 'Saved' : 'Required';
  elements.apiKeyStatus.classList.toggle('saved', saved);
  elements.apiKeyNote.textContent = saved
    ? `Using ${maskApiKey(apiKey)} for new requests.`
    : 'Paste your key once, then start chatting.';
  updateComposerState();
}

function updateComposerState() {
  const blockedByFileProtocol = window.location.protocol === 'file:';
  const blockedByMissingKey = !hasApiKey();
  const blockedByMissingBackend = !getApiUrl();

  elements.messageInput.disabled = blockedByFileProtocol || blockedByMissingKey || blockedByMissingBackend;
  elements.messageInput.placeholder = blockedByFileProtocol
    ? 'Open the app from http://localhost:3000'
    : blockedByMissingBackend
      ? 'Add a backend URL in Settings for static hosting'
    : blockedByMissingKey
      ? 'Add your Hack Club API key to begin'
      : 'Type your message...';

  elements.sendBtn.disabled =
    blockedByFileProtocol ||
    blockedByMissingKey ||
    blockedByMissingBackend ||
    isGenerating ||
    elements.messageInput.value.trim().length === 0;
}

function hasApiKey() {
  return apiKey.trim().length > 0;
}

function maskApiKey(value) {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMarkdown(text) {
  let html = escapeHtml(text);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  return html;
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
  if (currentConversationId) {
    localStorage.setItem('lastConversationId', currentConversationId);
  }
}

async function parseApiError(response) {
  const fallback = `HTTP error! status: ${response.status}`;

  if (response.status === 405 && isGitHubPages() && !normalizeBackendUrl(settings.backendUrl)) {
    return getHostingHelpMessage();
  }

  try {
    const data = await response.clone().json();
    const message = data?.error?.message || data?.message || data?.detail;
    return message ? `${fallback} - ${message}` : fallback;
  } catch (jsonError) {
    try {
      const text = await response.text();
      return text ? `${fallback} - ${text}` : fallback;
    } catch (textError) {
      return fallback;
    }
  }
}

function getApiUrl() {
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  if (backendUrl) {
    return `${backendUrl}${DEFAULT_API_PATH}`;
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return DEFAULT_API_PATH;
  }

  return '';
}

function normalizeBackendUrl(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function isGitHubPages() {
  return window.location.hostname.endsWith('github.io');
}

function getHostingHelpMessage() {
  return 'GitHub Pages is static hosting, so it cannot handle POST /api/chat. Run this app locally with node server.js or deploy server.js somewhere and add that backend URL in Settings.';
}
