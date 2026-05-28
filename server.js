require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ws = require('ws');
const supabase = createClient(
  process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, ''),
  { realtime: { transport: ws } }
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Session helpers ──────────────────────────────────────────────────────────

async function getOrCreateSession(phoneNumber) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();
  if (!error && data) return data;
  const { data: created } = await supabase
    .from('whatsapp_sessions')
    .insert({ phone_number: phoneNumber, state: 'IDLE', context: {} })
    .select()
    .single();
  return created || { phone_number: phoneNumber, state: 'IDLE', context: {} };
}

async function saveSession(phoneNumber, state, context) {
  await supabase
    .from('whatsapp_sessions')
    .upsert(
      { phone_number: phoneNumber, state, context, updated_at: new Date().toISOString() },
      { onConflict: 'phone_number' }
    );
}

async function getUserByPhone(phoneNumber) {
  const { data } = await supabase
    .from('users')
    .select('id, full_name, role, org_id')
    .eq('phone_number', phoneNumber)
    .single();
  return data || null;
}

function fmt(n) { return Number(n).toLocaleString('en-ZA'); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ─── Tool definitions ─────────────────────────────────────────────────────────

const tools = [
  {
    name: 'get_user_info',
    description: 'Get information about a user by their WhatsApp phone number',
    input_schema: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: 'WhatsApp number e.g. whatsapp:+1234567890' }
      },
      required: ['phone_number']
    }
  },
  {
    name: 'list_projects',
    description: "List all active projects available to the current user. Pass the user's WhatsApp phone number — the tool resolves their org automatically. Call this whenever the user wants to log an expense or choose a project, then present a numbered list for them to pick from.",
    input_schema: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: "The user's WhatsApp number, already known from the system prompt" }
      },
      required: ['phone_number']
    }
  },
  {
    name: 'get_project_budget',
    description: 'Get budget and spending summary for a project',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUID of the project' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'log_expense',
    description: 'Log a new expense against a project on behalf of a user',
    input_schema: {
      type: 'object',
      properties: {
        user_id:          { type: 'string', description: 'UUID of the submitting user' },
        project_id:       { type: 'string', description: 'UUID of the project' },
        amount:           { type: 'number', description: 'Expense amount in project currency' },
        description:      { type: 'string', description: 'What the expense is for' },
        category:         { type: 'string', description: 'transport | meals | supplies | accommodation | communications | equipment | salaries | other' },
        vendor_name:      { type: 'string', description: 'Vendor or payee name' },
        payment_method:   { type: 'string', description: 'cash | mobile_money | bank_transfer | card | other' },
        transaction_date: { type: 'string', description: 'Date of transaction YYYY-MM-DD (defaults to today)' }
      },
      required: ['user_id', 'project_id', 'amount', 'description']
    }
  },
  {
    name: 'list_pending_approvals',
    description: 'List all expenses currently pending approval for an approver',
    input_schema: {
      type: 'object',
      properties: {
        approver_id: { type: 'string', description: 'UUID of the approver' }
      },
      required: ['approver_id']
    }
  },
  {
    name: 'approve_expense',
    description: 'Approve a pending expense',
    input_schema: {
      type: 'object',
      properties: {
        expense_id:  { type: 'string', description: 'UUID of the expense to approve' },
        approver_id: { type: 'string', description: 'UUID of the approver' }
      },
      required: ['expense_id', 'approver_id']
    }
  },
  {
    name: 'reject_expense',
    description: 'Reject a pending expense with a reason',
    input_schema: {
      type: 'object',
      properties: {
        expense_id:  { type: 'string', description: 'UUID of the expense to reject' },
        approver_id: { type: 'string', description: 'UUID of the approver' },
        reason:      { type: 'string', description: 'Reason for rejection' }
      },
      required: ['expense_id', 'approver_id', 'reason']
    }
  }
];

// ─── Tool implementations ─────────────────────────────────────────────────────

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'get_user_info': {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, role, phone_number, org_id, email, is_active, setup_step')
          .eq('phone_number', input.phone_number)
          .single();
        if (error) return { error: error.message };
        return data || { error: 'User not found' };
      }

      case 'list_projects': {
        const { data: user, error: uErr } = await supabase
          .from('users')
          .select('org_id')
          .eq('phone_number', input.phone_number)
          .single();
        if (uErr || !user) return { error: 'Could not identify user from phone number' };

        const { data, error } = await supabase
          .from('projects')
          .select('id, name, status, budget_amount, currency, start_date, end_date')
          .eq('org_id', user.org_id)
          .eq('status', 'active')
          .order('name');
        if (error) return { error: error.message };
        return {
          count: (data || []).length,
          projects: (data || []).map((p, i) => ({ index: i + 1, ...p }))
        };
      }

      case 'get_project_budget': {
        const { data: project, error: pErr } = await supabase
          .from('projects')
          .select('id, name, budget_amount, currency, status, start_date, end_date')
          .eq('id', input.project_id)
          .single();
        if (pErr) return { error: pErr.message };

        const { data: exps, error: eErr } = await supabase
          .from('expenses')
          .select('amount, status')
          .eq('project_id', input.project_id);
        if (eErr) return { error: eErr.message };

        const approved = (exps || [])
          .filter(e => e.status === 'approved')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pending = (exps || [])
          .filter(e => e.status === 'pending')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        return {
          ...project,
          spent_approved: approved,
          spent_pending:  pending,
          remaining:      (project.budget_amount || 0) - approved
        };
      }

      case 'log_expense': {
        const { data: user, error: uErr } = await supabase
          .from('users')
          .select('org_id')
          .eq('id', input.user_id)
          .single();
        if (uErr) return { error: `User lookup failed: ${uErr.message}` };

        const validCategories = ['transport','meals','supplies','accommodation','communications','equipment','salaries','other'];
        const validMethods    = ['cash','mobile_money','bank_transfer','card','other'];

        const { data, error } = await supabase
          .from('expenses')
          .insert({
            org_id:           user.org_id,
            project_id:       input.project_id,
            submitted_by:     input.user_id,
            amount:           input.amount,
            description:      input.description,
            category:         validCategories.includes(input.category) ? input.category : 'other',
            vendor_name:      input.vendor_name || null,
            payment_method:   validMethods.includes(input.payment_method) ? input.payment_method : 'cash',
            transaction_date: input.transaction_date || new Date().toISOString().split('T')[0],
            status:           'pending'
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, expense: data };
      }

      case 'list_pending_approvals': {
        const { data, error } = await supabase
          .from('expenses')
          .select('id, amount, currency, description, category, vendor_name, payment_method, transaction_date, created_at, users!submitted_by(full_name), projects(name)')
          .eq('status', 'pending')
          .eq('approver_id', input.approver_id)
          .order('created_at', { ascending: false });
        if (error) return { error: error.message };
        return { count: (data || []).length, pending: data || [] };
      }

      case 'approve_expense': {
        const { data, error } = await supabase
          .from('expenses')
          .update({
            status:      'approved',
            approved_by: input.approver_id,
            approved_at: new Date().toISOString()
          })
          .eq('id', input.expense_id)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, expense: data };
      }

      case 'reject_expense': {
        const { data, error } = await supabase
          .from('expenses')
          .update({
            status:           'rejected',
            rejection_reason: input.reason
          })
          .eq('id', input.expense_id)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, expense: data };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Claude conversation history (expense / approval flows) ───────────────────

async function loadHistory(userPhone) {
  const { data, error } = await supabase
    .from('conversation_history')
    .select('messages')
    .eq('phone_number', userPhone)
    .single();
  if (error || !data) return [];
  return data.messages || [];
}

async function saveHistory(userPhone, messages) {
  await supabase
    .from('conversation_history')
    .upsert(
      { phone_number: userPhone, messages, updated_at: new Date().toISOString() },
      { onConflict: 'phone_number' }
    );
}

async function processWithClaude(userPhone, userMessage) {
  const savedHistory = await loadHistory(userPhone);
  const history = [...savedHistory, { role: 'user', content: userMessage }];

  const system = `You are Spend4Good AI, a helpful assistant for nonprofit expense tracking over WhatsApp.
You help field workers log expenses, check project budgets, and finance managers review/approve expenses.
Always be concise — responses are delivered via WhatsApp.
The user's WhatsApp number is: ${userPhone}
Today's date: ${new Date().toISOString().split('T')[0]}

IMPORTANT RULES:
- Never ask the user for their org ID, user ID, project ID, or any UUID. You resolve all of these via tools.
- When you need to identify the user, call get_user_info with their WhatsApp number above.
- When you need a project, call list_projects (passing the WhatsApp number) and show a numbered list.
- The user picks by name or number — you map their choice to the correct project ID silently.
- Never expose raw UUIDs or internal IDs to the user.`;

  let messages = [...history];

  for (let iterations = 0; iterations < 10; iterations++) {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      tools,
      messages
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(c => c.type === 'text');
      const reply = text ? text.text : 'Sorry, I could not generate a response.';
      const finalHistory = [...messages, { role: 'assistant', content: response.content }];
      await saveHistory(userPhone, finalHistory.slice(-20));
      return reply;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = await Promise.all(
        response.content
          .filter(b => b.type === 'tool_use')
          .map(async b => ({
            type:        'tool_result',
            tool_use_id: b.id,
            content:     JSON.stringify(await executeTool(b.name, b.input))
          }))
      );

      messages.push({ role: 'user', content: toolResults });
    } else {
      break;
    }
  }

  return 'I encountered an issue processing your request. Please try again.';
}

// ─── Session-aware message handler ───────────────────────────────────────────

async function handleMessage(phoneNumber, message, mediaUrl, mediaContentType) {
  const session  = await getOrCreateSession(phoneNumber);
  const { state, context } = session;
  const msg      = (message || '').trim();
  const msgLower = msg.toLowerCase();

  if (mediaUrl) {
    await saveSession(phoneNumber, 'AWAITING_DOCUMENT_TYPE', {
      ...context,
      mediaUrl,
      mediaContentType: mediaContentType || 'application/octet-stream'
    });
    return 'Got it. What type of document is this? Reply:\n1 Invoice\n2 Receipt\n3 Report';
  }

  switch (state) {

    case 'IDLE': {
      if (msgLower.includes('register') && (msgLower.includes('company') || msgLower.includes('org') || msgLower.includes('organisation') || msgLower.includes('organization'))) {
        await saveSession(phoneNumber, 'AWAITING_ORG_NAME', {});
        return "What is your organisation's name?";
      }
      if (/^add\s+project$/i.test(msg) || msgLower.includes('add project') || msgLower.includes('create project') || msgLower.includes('new project')) {
        const user = await getUserByPhone(phoneNumber);
        if (!user) return "You need to register your organisation first. Reply 'register my company' to get started.";
        await saveSession(phoneNumber, 'AWAITING_PROJECT_NAME', { userId: user.id, orgId: user.org_id });
        return 'What is the project name?';
      }
      if (/^add\s+user$/i.test(msg) || msgLower.includes('add user') || msgLower.includes('invite user')) {
        return "To add a team member, share this WhatsApp number with them and ask them to message 'join [your org name]'. You can also manage users directly in the admin panel.";
      }
      return await processWithClaude(phoneNumber, msg);
    }

    case 'AWAITING_ORG_NAME': {
      if (!msg) return "Please enter your organisation's name.";
      await saveSession(phoneNumber, 'AWAITING_ORG_REG_NUMBER', { ...context, orgName: msg });
      return "What is your registration number? Reply 'skip' if you don't have one.";
    }

    case 'AWAITING_ORG_REG_NUMBER': {
      const regNumber = msgLower === 'skip' ? null : msg;
      const orgName   = context.orgName;
      const slug      = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: orgName, slug, registration_number: regNumber, country: 'ZA', onboarding_status: 'active' })
        .select()
        .single();

      if (orgErr) {
        await saveSession(phoneNumber, 'IDLE', {});
        return "Sorry, we couldn't register your organisation. Please try again.";
      }

      const { data: user } = await supabase
        .from('users')
        .upsert(
          { phone_number: phoneNumber, org_id: org.id, role: 'admin', full_name: 'Admin', is_active: true },
          { onConflict: 'phone_number' }
        )
        .select('id')
        .single();

      await saveSession(phoneNumber, 'IDLE', { orgId: org.id, userId: user?.id });
      return `${orgName} registered. You are the admin. Reply 'add user' to invite a team member or 'add project' to create your first project.`;
    }

    case 'AWAITING_PROJECT_NAME': {
      if (!msg) return 'Please enter the project name.';
      await saveSession(phoneNumber, 'AWAITING_PROJECT_BUDGET', { ...context, projectName: msg });
      return 'What is the total budget for this project? (e.g. R150000)';
    }

    case 'AWAITING_PROJECT_BUDGET': {
      const rawBudget = msg.replace(/[^0-9.]/g, '');
      const budget    = parseFloat(rawBudget);
      if (isNaN(budget) || budget <= 0) {
        return 'Please enter a valid budget amount (e.g. R150000).';
      }

      let { userId, orgId } = context;
      if (!userId || !orgId) {
        const user = await getUserByPhone(phoneNumber);
        if (!user) {
          await saveSession(phoneNumber, 'IDLE', {});
          return "Couldn't find your account. Please register first.";
        }
        userId = user.id;
        orgId  = user.org_id;
      }

      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          org_id:        orgId,
          name:          context.projectName,
          budget_amount: budget,
          currency:      'ZAR',
          status:        'active',
          created_by:    userId
        })
        .select()
        .single();

      if (projErr) {
        await saveSession(phoneNumber, 'IDLE', { ...context, userId, orgId });
        return "Sorry, we couldn't create the project. Please try again.";
      }

      await saveSession(phoneNumber, 'IDLE', { orgId, userId, lastProjectId: project.id });
      return `Project created - ${context.projectName}, budget R${fmt(budget)}. Reply 'add user', 'log expense', or 'upload document'.`;
    }

    case 'AWAITING_DOCUMENT_TYPE': {
      const typeMap = {
        '1': 'invoice', 'invoice': 'invoice',
        '2': 'receipt', 'receipt': 'receipt',
        '3': 'report',  'report':  'report'
      };
      const docType = typeMap[msgLower];
      if (!docType) {
        return 'Please reply with:\n1 Invoice\n2 Receipt\n3 Report';
      }

      const user = await getUserByPhone(phoneNumber);
      if (!user) {
        await saveSession(phoneNumber, 'IDLE', {});
        return "Couldn't find your account. Please register first.";
      }

      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('org_id', user.org_id)
        .eq('status', 'active')
        .order('name');

      if (!projects || projects.length === 0) {
        await saveSession(phoneNumber, 'IDLE', {});
        return "You have no active projects. Reply 'add project' to create one first.";
      }

      const projectList = projects.map((p, i) => `${i + 1} ${p.name}`).join('\n');
      await saveSession(phoneNumber, 'AWAITING_DOCUMENT_PROJECT', {
        ...context,
        documentType: docType,
        projects:     projects.map(p => ({ id: p.id, name: p.name })),
        userId:       user.id,
        orgId:        user.org_id
      });
      return `Which project?\n${projectList}`;
    }

    case 'AWAITING_DOCUMENT_PROJECT': {
      const projects = context.projects || [];
      let project    = null;

      const num = parseInt(msg, 10);
      if (!isNaN(num) && num >= 1 && num <= projects.length) {
        project = projects[num - 1];
      } else {
        project = projects.find(p => p.name.toLowerCase().includes(msgLower));
      }

      if (!project) {
        const list = projects.map((p, i) => `${i + 1} ${p.name}`).join('\n');
        return `Please choose a project:\n${list}`;
      }

      const { error: docErr } = await supabase
        .from('documents')
        .insert({
          org_id:        context.orgId,
          project_id:    project.id,
          uploaded_by:   context.userId,
          file_path:     context.mediaUrl || '',
          file_name:     `${context.documentType}_${Date.now()}`,
          document_type: context.documentType,
          status:        'pending'
        });

      await saveSession(phoneNumber, 'IDLE', { orgId: context.orgId, userId: context.userId });

      if (docErr) return "Sorry, couldn't file the document. Please try again.";
      return `${cap(context.documentType)} filed under ${project.name}. Pending approval.`;
    }

    default: {
      await saveSession(phoneNumber, 'IDLE', {});
      return await processWithClaude(phoneNumber, msg);
    }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post(['/webhook', '/api/whatsapp/webhook'], async (req, res) => {
  const twiml   = new twilio.twiml.MessagingResponse();
  const {
    Body: userMessage,
    From: userPhone,
    MediaUrl0:         mediaUrl,
    MediaContentType0: mediaContentType
  } = req.body;

  console.log(`[webhook] IN  from=${userPhone} msg="${userMessage}" media=${mediaUrl || 'none'}`);

  try {
    if (!userPhone) {
      twiml.message('Invalid request.');
      return res.type('text/xml').send(twiml.toString());
    }
    const reply = await handleMessage(userPhone, userMessage, mediaUrl, mediaContentType);
    console.log(`[webhook] OUT to=${userPhone} reply="${String(reply).slice(0, 80)}..."`);
    twiml.message(reply);
  } catch (error) {
    console.error('WEBHOOK ERROR:', error.message);
    console.error('WEBHOOK STACK:', error.stack);
    const errTwiml = new twilio.twiml.MessagingResponse();
    errTwiml.message('Sorry, something went wrong. Please try again.');
    return res.type('text/xml').send(errTwiml.toString());
  }
  res.type('text/xml').send(twiml.toString());
});

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
    services_configured: {
      supabase:  !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      twilio:    !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER),
      anthropic: !!process.env.ANTHROPIC_API_KEY
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spend4Good server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Webhook: http://localhost:${PORT}/webhook`);
});
