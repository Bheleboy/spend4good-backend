require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase with service role (bypasses RLS)
// Trim keys to remove any accidental newlines/spaces from env var paste
const supabase = createClient(
  process.env.SUPABASE_URL?.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, ''),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via SMS
async function sendOTP(phoneNumber, code) {
  try {
    await twilioClient.messages.create({
      body: `Your Spend4Good verification code is: ${code}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    return false;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`
    });
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    return false;
  }
}

// Get user by phone number
async function getUserByPhone(phoneNumber) {
  const { data, error } = await supabase
    .from('users')
    .select('*, organizations(*)')
    .eq('phone_number', phoneNumber)
    .single();

  if (error) {
    console.error('getUserByPhone error:', error.message, '| phone:', phoneNumber);
    return null;
  }
  return data;
}

// Check user permission
function hasPermission(userRole, action) {
  const permissions = {
    admin: ['create_org', 'add_users', 'create_project', 'upload_doc', 'approve_doc', 'view_all', 'comment', 'generate_report'],
    project_manager: ['create_project', 'upload_doc', 'approve_doc', 'view_all', 'comment', 'generate_report'],
    accountant: ['view_all', 'comment', 'generate_report'],
    funder: ['view_all', 'comment', 'generate_report'],
    field_agent: ['upload_doc', 'view_own']
  };
  
  return permissions[userRole]?.includes(action) || false;
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Request OTP
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Generate OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Save OTP to database
    const { error } = await supabase
      .from('otp_codes')
      .insert({
        phone_number,
        code,
        expires_at: expiresAt.toISOString()
      });
    
    if (error) {
      console.error('Error saving OTP:', error);
      return res.status(500).json({ error: 'Failed to generate OTP' });
    }
    
    // Send OTP via SMS
    const sent = await sendOTP(phone_number, code);
    
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
    
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone_number, code } = req.body;
    
    if (!phone_number || !code) {
      return res.status(400).json({ error: 'Phone number and code required' });
    }
    
    // Get OTP from database
    const { data: otpData, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone_number', phone_number)
      .eq('code', code)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (otpError || !otpData) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Mark OTP as verified
    await supabase
      .from('otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', otpData.id);
    
    // Get or create user
    let user = await getUserByPhone(phone_number);
    
    if (!user) {
      // New user - they need to be added to an org by admin
      return res.json({ 
        success: true, 
        verified: true,
        new_user: true,
        message: 'Phone verified. Contact your organization admin to complete setup.'
      });
    }
    
    // Update last login
    await supabase
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString(),
        otp_verified_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    res.json({ 
      success: true, 
      verified: true,
      user: {
        id: user.id,
        phone_number: user.phone_number,
        full_name: user.full_name,
        role: user.role,
        org_id: user.org_id,
        org_name: user.organizations?.name
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// WHATSAPP WEBHOOK
// ============================================

app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const { From, Body, MediaUrl0, MediaContentType0 } = req.body;

    const phoneNumber = From.replace('whatsapp:', '');
    const message = Body?.trim() || '';

    // Get user (including inactive/pending users)
    const { data: user } = await supabase
      .from('users')
      .select('*, organizations(*)')
      .eq('phone_number', phoneNumber)
      .single();

    // ── ONBOARDING FLOW for invited (not yet active) users ──
    if (user && !user.is_active) {

      // Step 1: User is awaiting OTP verification
      if (user.setup_step === 'awaiting_otp') {
        const code = message.trim();
        const { data: otpData } = await supabase
          .from('otp_codes')
          .select('*')
          .eq('phone_number', phoneNumber)
          .eq('code', code)
          .is('verified_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!otpData) {
          await sendWhatsAppMessage(phoneNumber,
            `That code doesn't look right. Please check and try again, or ask your admin to resend your invite.`
          );
        } else {
          await supabase.from('otp_codes').update({ verified_at: new Date().toISOString() }).eq('id', otpData.id);
          await supabase.from('users').update({ setup_step: 'awaiting_name' }).eq('id', user.id);
          await sendWhatsAppMessage(phoneNumber,
            `✅ Perfect, your number is verified!\n\nWhat's your full name?`
          );
        }
        return res.status(200).send('OK');
      }

      // Step 2: User has verified OTP, waiting for their name
      if (user.setup_step === 'awaiting_name') {
        const fullName = message.trim();
        if (fullName.length < 2) {
          await sendWhatsAppMessage(phoneNumber, `Please reply with your full name to complete setup.`);
        } else {
          await supabase.from('users').update({
            full_name: fullName,
            is_active: true,
            setup_step: null,
            otp_verified_at: new Date().toISOString()
          }).eq('id', user.id);

          await sendWhatsAppMessage(phoneNumber,
            `🎉 Welcome to Spend4Good, ${fullName}!\n\nYou're all set as a *${user.role.replace('_', ' ')}* at *${user.organizations?.name}*.\n\nType *help* to see what you can do.`
          );
        }
        return res.status(200).send('OK');
      }
    }

    // ── UNREGISTERED user ──
    if (!user) {
      await sendWhatsAppMessage(phoneNumber,
        `Hi! You're not registered on Spend4Good yet.\n\nAsk your organisation admin to invite you — they'll send a link to this number.`
      );
      return res.status(200).send('OK');
    }

    // ── ACTIVE user — normal flow ──
    if (MediaUrl0 && MediaContentType0?.startsWith('image/')) {
      await handleImageUpload(user, MediaUrl0, message.toLowerCase());
      return res.status(200).send('OK');
    }

    await parseCommand(user, message.toLowerCase(), phoneNumber);
    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle image upload from WhatsApp
async function handleImageUpload(user, mediaUrl, caption) {
  try {
    // Extract project name and amount from caption
    // Expected format: "Receipt for Project Name, R2500" or "Invoice Project X $100"
    
    let response = '';
    
    if (!hasPermission(user.role, 'upload_doc')) {
      response = `❌ You don't have permission to upload documents. Contact your project manager.`;
      await sendWhatsAppMessage(user.phone_number, response);
      return;
    }
    
    // Flexible natural language parsing
    // Handles: "Petrol R350 Well Drilling", "Receipt for drilling, R2500", "R200 transport"
    const amountMatch = caption.match(/R\s?(\d+(?:[.,]\d{1,2})?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;

    // Try to find project name from caption (after "for" keyword, or just guess from words)
    const forMatch = caption.match(/for\s+(.+?)(?:,|R|\d|$)/i);
    const projectName = forMatch ? forMatch[1].trim() : '';
    
    // Find project by name
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('org_id', user.org_id)
      .ilike('name', `%${projectName}%`)
      .limit(1);
    
    if (!projects || projects.length === 0) {
      const { data: allProjects } = await supabase
        .from('projects')
        .select('name')
        .eq('org_id', user.org_id)
        .eq('status', 'active');

      response = `I couldn't match this to a project${projectName ? ` called "${projectName}"` : ''}.\n\nYour active projects are:\n\n`;
      allProjects?.forEach((p, i) => { response += `${i + 1}. ${p.name}\n`; });
      response += `\nSend the photo again and mention the project name in your caption.`;
      await sendWhatsAppMessage(user.phone_number, response);
      return;
    }
    
    const project = projects[0];
    
    // Create document record (actual file upload would happen here in production)
    const fileName = `whatsapp-${Date.now()}.jpg`;
    const filePath = `uploads/${user.org_id}/${project.id}/${fileName}`;
    
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        org_id: user.org_id,
        project_id: project.id,
        uploaded_by: user.id,
        file_path: filePath,
        file_name: fileName,
        file_type: caption.toLowerCase().includes('invoice') ? 'invoice' : 'receipt',
        amount: amount,
        description: caption,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating document:', error);
      response = `Something went wrong saving that receipt. Please try sending it again.`;
    } else {
      response = `✅ Got it! Your receipt has been saved.\n\n`;
      response += `📁 Project: ${project.name}\n`;
      response += `💰 Amount: R${amount.toFixed(2)}\n`;
      response += `⏳ Waiting for approval\n\n`;
      response += `Your project manager will review it shortly and you'll hear back here.`;
    }
    
    await sendWhatsAppMessage(user.phone_number, response);
  } catch (error) {
    console.error('Image upload error:', error);
    await sendWhatsAppMessage(user.phone_number, 
      '❌ Failed to process image upload. Please try again.'
    );
  }
}

// Parse text commands - conversational natural language
async function parseCommand(user, message, phoneNumber) {
  let response = '';
  const msg = message.toLowerCase().trim();

  // ── ADD USER (admin only) ──
  // Accepts: "add +27831234567 as field agent", "invite +27831234567 accountant"
  if (msg.includes('add ') || msg.includes('invite ')) {
    if (!hasPermission(user.role, 'add_users')) {
      response = `Sorry, only admins can invite new users.`;
      await sendWhatsAppMessage(phoneNumber, response);
      return;
    }

    const phoneMatch = message.match(/(\+?\d[\d\s\-]{8,14}\d)/);
    const invitePhone = phoneMatch ? phoneMatch[1].replace(/\s|-/g, '') : null;

    const roleMap = {
      'field agent': 'field_agent', 'fieldagent': 'field_agent',
      'project manager': 'project_manager', 'projectmanager': 'project_manager', 'pm': 'project_manager',
      'accountant': 'accountant',
      'funder': 'funder',
      'admin': 'admin'
    };
    let assignedRole = 'field_agent';
    for (const [keyword, roleValue] of Object.entries(roleMap)) {
      if (msg.includes(keyword)) { assignedRole = roleValue; break; }
    }

    if (!invitePhone) {
      response = `Please include the person's phone number.\n\nExample:\n*add +27831234567 as field agent*\n\nRoles: field agent, project manager, accountant, funder, admin`;
      await sendWhatsAppMessage(phoneNumber, response);
      return;
    }

    // Check if already exists
    const { data: existing } = await supabase.from('users').select('id, is_active').eq('phone_number', invitePhone).single();
    if (existing?.is_active) {
      response = `${invitePhone} is already registered on Spend4Good.`;
      await sendWhatsAppMessage(phoneNumber, response);
      return;
    }

    // Generate OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for invite

    if (existing && !existing.is_active) {
      // Re-invite: update role and resend OTP
      await supabase.from('users').update({ role: assignedRole, setup_step: 'awaiting_otp' }).eq('id', existing.id);
    } else {
      // New invite
      await supabase.from('users').insert({
        phone_number: invitePhone,
        full_name: 'Pending',
        role: assignedRole,
        org_id: user.org_id,
        is_active: false,
        setup_step: 'awaiting_otp'
      });
    }

    await supabase.from('otp_codes').insert({ phone_number: invitePhone, code, expires_at: expiresAt.toISOString() });

    // Send OTP to new user via WhatsApp
    await sendWhatsAppMessage(invitePhone,
      `👋 Hi! You've been invited to join *${user.organizations?.name}* on Spend4Good by ${user.full_name}.\n\nYour role will be: *${assignedRole.replace('_', ' ')}*\n\nYour verification code is:\n\n*${code}*\n\nReply to this message with that code to activate your account.`
    );

    const roleLabel = assignedRole.replace('_', ' ');
    response = `✅ Invite sent to ${invitePhone} as *${roleLabel}*.\n\nThey'll receive a WhatsApp message with a verification code. Once they confirm, they're in!`;
    await sendWhatsAppMessage(phoneNumber, response);
    return;
  }

  // Greetings
  if (/^(hi|hello|hey|howzit|sawubona|hola|good\s?(morning|afternoon|evening))/.test(msg)) {
    response = `👋 Hi ${user.full_name}! Welcome to Spend4Good.\n\nWhat would you like to do?\n\n1️⃣ See what needs approval\n2️⃣ Start a new project\n3️⃣ See all projects\n\nJust reply with a number or tell me what you need.`;
  }

  // Help
  else if (msg.includes('help') || msg.includes('what can you do') || msg.includes('commands')) {
    response = getHelpText(user.role);
  }

  // User replies with just "1", "2", "3" after greeting
  else if (msg === '1' || msg.includes('what needs approval') || msg.includes('pending') || msg.includes('waiting') || msg.includes('status') || msg.includes('review')) {
    const { data: pending } = await supabase
      .from('documents')
      .select('id, description, amount, vendor_name, projects(name), users!documents_uploaded_by_fkey(full_name)')
      .eq('org_id', user.org_id)
      .eq('status', 'pending');

    if (!pending || pending.length === 0) {
      response = `✅ All clear! There's nothing waiting for approval right now.`;
    } else if (user.role === 'field_agent') {
      response = `📋 Here are your receipts waiting for approval:\n\n`;
      pending.forEach((doc, i) => {
        response += `${i + 1}. ${doc.description || doc.vendor_name || 'Receipt'} — R${doc.amount?.toFixed(2) || '0.00'}\n   Project: ${doc.projects?.name || 'Unknown'}\n\n`;
      });
    } else {
      response = `📋 ${pending.length} receipt${pending.length > 1 ? 's' : ''} waiting for your approval:\n\n`;
      pending.forEach((doc, i) => {
        response += `${i + 1}. ${doc.description || doc.vendor_name || 'Receipt'} — R${doc.amount?.toFixed(2) || '0.00'}\n   From: ${doc.users?.full_name || 'Unknown'} | Project: ${doc.projects?.name || 'Unknown'}\n\n`;
      });
      response += `To approve, reply: *approve 1* (or whichever number)\nTo reject, reply: *reject 1 reason here*`;
    }
  }

  // Approve by number or keyword
  else if (msg.startsWith('approve') || msg.startsWith('yes') || msg.startsWith('ok approve')) {
    if (!hasPermission(user.role, 'approve_doc')) {
      response = `Sorry, you don't have permission to approve documents. Only admins and project managers can do that.`;
    } else {
      const numMatch = msg.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0]) : null;

      const { data: pending } = await supabase
        .from('documents')
        .select('id, description, amount, vendor_name')
        .eq('org_id', user.org_id)
        .eq('status', 'pending');

      if (!pending || pending.length === 0) {
        response = `There's nothing waiting for approval right now. ✅`;
      } else if (!num || num < 1 || num > pending.length) {
        response = `Which one would you like to approve? Reply with a number between 1 and ${pending.length}.\n\nType *pending* to see the list again.`;
      } else {
        const doc = pending[num - 1];
        await supabase
          .from('documents')
          .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
          .eq('id', doc.id);
        response = `✅ Done! "${doc.description || doc.vendor_name}" (R${doc.amount?.toFixed(2)}) has been approved.`;
      }
    }
  }

  // Reject by number
  else if (msg.startsWith('reject') || msg.startsWith('decline') || msg.startsWith('no to')) {
    if (!hasPermission(user.role, 'approve_doc')) {
      response = `Sorry, you don't have permission to reject documents.`;
    } else {
      const numMatch = msg.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0]) : null;
      const reasonMatch = msg.match(/\d+\s+(.*)/);
      const reason = reasonMatch ? reasonMatch[1].trim() : 'No reason given';

      const { data: pending } = await supabase
        .from('documents')
        .select('id, description, amount, vendor_name')
        .eq('org_id', user.org_id)
        .eq('status', 'pending');

      if (!pending || pending.length === 0) {
        response = `There's nothing waiting for approval right now. ✅`;
      } else if (!num || num < 1 || num > pending.length) {
        response = `Which one would you like to reject? Reply with: *reject 1 reason here*\n\nType *pending* to see the list again.`;
      } else {
        const doc = pending[num - 1];
        await supabase
          .from('documents')
          .update({ status: 'rejected', rejection_reason: reason })
          .eq('id', doc.id);
        response = `❌ "${doc.description || doc.vendor_name}" has been rejected.\nReason: ${reason}`;
      }
    }
  }

  // Create project
  else if (msg === '2' || msg.includes('new project') || msg.includes('create project') || msg.includes('start a project') || msg.includes('add a project')) {
    if (!hasPermission(user.role, 'create_project')) {
      response = `Sorry, only admins and project managers can create projects. Ask your admin to set one up.`;
    } else {
      // Extract project name after keywords
      let projectName = msg
        .replace(/new project|create project|start a project|add a project/gi, '')
        .replace(/called|named/gi, '')
        .trim();

      if (!projectName || projectName.length < 2) {
        response = `Sure! What would you like to call the project?\n\nJust reply with the project name, e.g:\n*New project: Well Drilling Phase 2*`;
      } else {
        const { data, error } = await supabase
          .from('projects')
          .insert({ org_id: user.org_id, name: projectName, created_by: user.id, status: 'active' })
          .select().single();

        if (error) {
          response = `Something went wrong creating the project. Please try again.`;
        } else {
          response = `✅ Project "${data.name}" is live and ready to use!\n\nYour team can now upload receipts and invoices for this project.`;
        }
      }
    }
  }

  // List projects
  else if (msg === '3' || msg.includes('show projects') || msg.includes('list projects') || msg.includes('our projects') || msg.includes('all projects') || msg.includes('projects')) {
    const { data: projects } = await supabase
      .from('projects')
      .select('name, budget_amount, currency, status')
      .eq('org_id', user.org_id)
      .eq('status', 'active');

    if (!projects || projects.length === 0) {
      response = `No active projects yet. To start one, say *new project* followed by the name.`;
    } else {
      response = `📁 Your active projects:\n\n`;
      projects.forEach((p, i) => {
        response += `${i + 1}. ${p.name}`;
        if (p.budget_amount) response += ` — Budget: R${p.budget_amount.toLocaleString()}`;
        response += `\n`;
      });
    }
  }

  // Default
  else {
    response = `Hi ${user.full_name}! I didn't quite catch that. 😊\n\nHere's what I can help with:\n\n• Type *pending* to see what needs approval\n• Type *projects* to see your projects\n• Type *new project [name]* to create a project\n• Send a photo to upload a receipt\n• Type *help* for more options`;
  }

  await sendWhatsAppMessage(phoneNumber, response);
}

// Get help text based on role - plain language
function getHelpText(role) {
  const header = `👋 Here's what you can do on Spend4Good:\n\n`;

  const commands = {
    admin: [
      `👤 *Invite someone* — type "add +27831234567 as field agent"`,
      `📋 *See pending approvals* — type "pending"`,
      `✅ *Approve a receipt* — type "approve 1"`,
      `❌ *Reject a receipt* — type "reject 1 reason here"`,
      `📁 *See projects* — type "projects"`,
      `➕ *Start a new project* — type "new project Well Drilling"`,
      `🧾 *Upload a receipt* — send a photo and describe it`,
    ],
    project_manager: [
      `📋 *See pending approvals* — type "pending"`,
      `✅ *Approve a receipt* — type "approve 1"`,
      `❌ *Reject a receipt* — type "reject 1 reason here"`,
      `📁 *See projects* — type "projects"`,
      `➕ *Start a new project* — type "new project [name]"`,
      `🧾 *Upload a receipt* — send a photo and describe it`,
    ],
    field_agent: [
      `🧾 *Upload a receipt* — send a photo with a caption like "Petrol for site visit, R350"`,
      `📋 *Check your receipts* — type "pending"`,
      `📁 *See projects* — type "projects"`,
    ],
    accountant: [
      `📋 *See pending receipts* — type "pending"`,
      `📁 *See projects* — type "projects"`,
    ],
    funder: [
      `📋 *See pending receipts* — type "pending"`,
      `📁 *See projects* — type "projects"`,
    ],
  };

  const list = (commands[role] || commands.field_agent).join('\n\n');
  return header + list + `\n\n_Just type naturally — I'll understand you!_`;
}

// ============================================
// REST API ROUTES
// ============================================

// Get user profile
app.get('/api/users/me', async (req, res) => {
  try {
    const phoneNumber = req.headers['x-user-phone'];
    
    if (!phoneNumber) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByPhone(phoneNumber);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get projects
app.get('/api/projects', async (req, res) => {
  try {
    const phoneNumber = req.headers['x-user-phone'];
    const user = await getUserByPhone(phoneNumber);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', user.org_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ projects: data });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get documents
app.get('/api/documents', async (req, res) => {
  try {
    const phoneNumber = req.headers['x-user-phone'];
    const user = await getUserByPhone(phoneNumber);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    let query = supabase
      .from('documents')
      .select('*, projects(name), users!documents_uploaded_by_fkey(full_name)')
      .eq('org_id', user.org_id);
    
    // Field agents only see their own documents
    if (user.role === 'field_agent') {
      query = query.eq('uploaded_by', user.id);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ documents: data });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.3', timestamp: new Date().toISOString() });
});

// Debug endpoint - checks env vars and Supabase connection
app.get('/debug', async (req, res) => {
  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    SUPABASE_ANON_KEY_length: process.env.SUPABASE_ANON_KEY?.length || 0,
    TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER,
  };

  let dbTest = null;
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    dbTest = error ? { error: error.message } : { ok: true };
  } catch (e) {
    dbTest = { error: e.message };
  }

  res.json({ env: envCheck, db: dbTest });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Spend4Good Backend running on port ${PORT}`);
  console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/api/whatsapp/webhook`);
});

module.exports = app;
