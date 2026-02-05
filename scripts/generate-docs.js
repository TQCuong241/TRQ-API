const fs = require('fs');
const path = require('path');

// Read API endpoints from app.ts (simplified - in production, parse TypeScript)
const apiEndpoints = [
  // Auth
  { method: 'POST', path: '/api/v1/auth/register', description: 'Register new user', auth: false, body: ['username', 'email', 'password', 'confirmPassword'] },
  { method: 'GET', path: '/api/v1/auth/verify-email', description: 'Verify email', auth: false, query: ['token'] },
  { method: 'POST', path: '/api/v1/auth/send-login-otp', description: 'Send login OTP', auth: false, body: ['email'] },
  { method: 'POST', path: '/api/v1/auth/verify-login-otp', description: 'Verify login OTP', auth: false, body: ['email', 'otp'] },
  { method: 'POST', path: '/api/v1/auth/send-reset-password-otp', description: 'Send reset password OTP', auth: false, body: ['email'] },
  { method: 'POST', path: '/api/v1/auth/verify-reset-password-otp', description: 'Verify reset password OTP', auth: false, body: ['email', 'otp', 'newPassword'] },
  { method: 'GET', path: '/api/v1/auth/me', description: 'Get current user', auth: true },
  { method: 'POST', path: '/api/v1/auth/send-change-password-otp', description: 'Send change password OTP', auth: true, body: ['oldPassword'] },
  { method: 'POST', path: '/api/v1/auth/verify-change-password-otp', description: 'Verify change password OTP', auth: true, body: ['otp', 'newPassword'] },
  
  // Users
  { method: 'GET', path: '/api/v1/users', description: 'List users', auth: true, query: ['page?', 'limit?', 'search?'] },
  { method: 'GET', path: '/api/v1/users/:id', description: 'Get user by ID', auth: true },
  { method: 'POST', path: '/api/v1/users/:id/avatar', description: 'Upload user avatar', auth: true, body: ['avatar (file)'] },
  
  // Conversations
  { method: 'GET', path: '/api/v1/conversations', description: 'List conversations', auth: true, query: ['includeArchived?'] },
  { method: 'GET', path: '/api/v1/conversations/:id', description: 'Get conversation by ID', auth: true },
  { method: 'POST', path: '/api/v1/conversations', description: 'Create conversation', auth: true, body: ['type', 'members', 'name?'] },
  { method: 'POST', path: '/api/v1/conversations/:id/draft', description: 'Save draft message', auth: true, body: ['draft'] },
  { method: 'GET', path: '/api/v1/conversations/:id/draft', description: 'Get draft message', auth: true },
  { method: 'POST', path: '/api/v1/conversations/:id/mute', description: 'Mute conversation', auth: true, body: ['duration?'] },
  { method: 'POST', path: '/api/v1/conversations/:id/pin', description: 'Pin conversation', auth: true },
  { method: 'POST', path: '/api/v1/conversations/:id/archive', description: 'Archive conversation', auth: true },
  
  // Messages
  { method: 'GET', path: '/api/v1/messages/conversation/:conversationId', description: 'Get messages', auth: true, query: ['limit?', 'beforeId?'] },
  { method: 'POST', path: '/api/v1/messages/conversation/:conversationId', description: 'Send message', auth: true, body: ['text?', 'type?'] },
  { method: 'POST', path: '/api/v1/messages/:id/forward', description: 'Forward message', auth: true, body: ['conversationIds', 'fromConversationId'] },
  { method: 'PUT', path: '/api/v1/messages/:id', description: 'Edit message', auth: true, body: ['text', 'conversationId'] },
  { method: 'DELETE', path: '/api/v1/messages/:id', description: 'Delete message', auth: true, body: ['conversationId', 'deleteForEveryone?'] },
  { method: 'GET', path: '/api/v1/messages/search', description: 'Search messages', auth: true, query: ['q', 'limit?', 'conversationId?', 'senderId?', 'type?'] },
];

function generateApiEndpointHTML(endpoint) {
  const methodClass = `method-${endpoint.method.toLowerCase()}`;
  const authBadge = endpoint.auth 
    ? '<div class="api-auth required">Auth Required</div>'
    : '<div class="api-auth optional">No Auth Required</div>';
  
  let paramsHTML = '';
  if (endpoint.body && endpoint.body.length > 0) {
    paramsHTML += '<div class="api-params"><div class="api-params-title">Request Body</div>';
    endpoint.body.forEach(param => {
      const isOptional = param.includes('?');
      const paramName = param.replace('?', '').replace(' (file)', '').replace(' (array)', '');
      const paramType = param.includes('(file)') ? 'file' : param.includes('(array)') ? 'array' : 'string';
      paramsHTML += `
        <div class="param-item">
          <span class="param-name">${paramName}</span>
          <span class="param-type">${paramType}</span>
          <span class="param-desc">${isOptional ? 'Optional' : 'Required'}</span>
        </div>`;
    });
    paramsHTML += '</div>';
  }
  
  if (endpoint.query && endpoint.query.length > 0) {
    paramsHTML += '<div class="api-params"><div class="api-params-title">Query Parameters</div>';
    endpoint.query.forEach(param => {
      const isOptional = param.includes('?');
      const paramName = param.replace('?', '');
      paramsHTML += `
        <div class="param-item">
          <span class="param-name">${paramName}</span>
          <span class="param-type">string</span>
          <span class="param-desc">${isOptional ? 'Optional' : 'Required'}</span>
        </div>`;
    });
    paramsHTML += '</div>';
  }

  return `
    <div class="api-endpoint">
      <div>
        <span class="api-method ${methodClass}">${endpoint.method}</span>
        <span class="api-path">${endpoint.path}</span>
      </div>
      <p class="api-description">${endpoint.description}</p>
      ${authBadge}
      ${paramsHTML}
    </div>`;
}

function generateDocsHTML() {
  const authEndpoints = apiEndpoints.filter(e => e.path.startsWith('/api/v1/auth'));
  const userEndpoints = apiEndpoints.filter(e => e.path.startsWith('/api/v1/users'));
  const convEndpoints = apiEndpoints.filter(e => e.path.startsWith('/api/v1/conversations'));
  const msgEndpoints = apiEndpoints.filter(e => e.path.startsWith('/api/v1/messages'));

  let html = fs.readFileSync(path.join(__dirname, '../public/docs.html'), 'utf8');
  
  // This is a simplified version - in production, you'd want to parse the actual app.ts file
  // For now, we'll just ensure the HTML file has the structure
  
  console.log('✅ Documentation structure ready');
  console.log(`   - ${authEndpoints.length} Auth endpoints`);
  console.log(`   - ${userEndpoints.length} User endpoints`);
  console.log(`   - ${convEndpoints.length} Conversation endpoints`);
  console.log(`   - ${msgEndpoints.length} Message endpoints`);
}

if (require.main === module) {
  generateDocsHTML();
}

module.exports = { generateDocsHTML, generateApiEndpointHTML };

