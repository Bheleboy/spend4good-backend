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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: { 'x-supabase-bypass-rls': 'true' }
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
    
    // Extract phone number (remove 'whatsapp:' prefix)
    const phoneNumber = From.replace('whatsapp:', '');
    
    // Get user
    const user = await getUserByPhone(phoneNumber);
    
    if (!user) {
      await sendWhatsAppMessage(phoneNumber, 
        '❌ You are not registered. Please contact your organization admin or sign up at spend4good.com'
      );
      return res.status(200).send('OK');
    }
    
    // Update user context for RLS
    await supabase.rpc('set_config', {
      setting_name: 'app.current_user_phone',
      setting_value: phoneNumber
    });
    
    const message = Body?.trim().toLowerCase() || '';
    
    // Handle image uploads
    if (MediaUrl0 && MediaContentType0?.startsWith('image/')) {
      await handleImageUpload(user, MediaUrl0, message);
      return res.status(200).send('OK');
    }
    
    // Parse text commands
    await parseCommand(user, message, phoneNumber);
    
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
    
    // Simple parsing (will enhance with NLP later)
    const projectMatch = caption.match(/for (.+?),/i);
    const amountMatch = caption.match(/[R$€£]\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    
    const projectName = projectMatch ? projectMatch[1].trim() : 'Unknown';
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
    
    // Find project by name
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('org_id', user.org_id)
      .ilike('name', `%${projectName}%`)
      .limit(1);
    
    if (!projects || projects.length === 0) {
      response = `❌ Project "${projectName}" not found. Available projects:\n`;
      
      const { data: allProjects } = await supabase
        .from('projects')
        .select('name')
        .eq('org_id', user.org_id)
        .eq('status', 'active');
      
      allProjects?.forEach(p => {
        response += `- ${p.name}\n`;
      });
      
      response += `\nPlease try again with correct project name.`;
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
      response = `❌ Failed to upload document. Please try again.`;
    } else {
      response = `✅ Document uploaded successfully!\n\n`;
      response += `📁 Project: ${project.name}\n`;
      response += `💰 Amount: R${amount.toFixed(2)}\n`;
      response += `📋 Document ID: ${doc.id}\n`;
      response += `⏳ Status: Pending approval\n\n`;
      response += `Your project manager will review this shortly.`;
    }
    
    await sendWhatsAppMessage(user.phone_number, response);
  } catch (error) {
    console.error('Image upload error:', error);
    await sendWhatsAppMessage(user.phone_number, 
      '❌ Failed to process image upload. Please try again.'
    );
  }
}

// Parse text commands
async function parseCommand(user, message, phoneNumber) {
  let response = '';
  
  // Help command
  if (message.includes('help')) {
    response = getHelpText(user.role);
  }
  
  // Create project command
  else if (message.startsWith('create project:')) {
    if (!hasPermission(user.role, 'create_project')) {
      response = `❌ You don't have permission to create projects.`;
    } else {
      const projectName = message.replace('create project:', '').trim();
      
      const { data, error } = await supabase
        .from('projects')
        .insert({
          org_id: user.org_id,
          name: projectName,
          created_by: user.id,
          status: 'active'
        })
        .select()
        .single();
      
      if (error) {
        response = `❌ Failed to create project: ${error.message}`;
      } else {
        response = `✅ Project "${projectName}" created successfully!\n📋 ID: ${data.id}`;
      }
    }
  }
  
  // Status command
  else if (message.includes('status')) {
    const { data: pending } = await supabase
      .from('documents')
      .select('id, file_name, amount, project_id')
      .eq('org_id', user.org_id)
      .eq('status', 'pending');
    
    if (user.role === 'field_agent') {
      const myDocs = pending?.filter(d => d.uploaded_by === user.id) || [];
      response = `📊 Your Status:\n\n`;
      response += `⏳ Pending Approvals: ${myDocs.length}\n`;
    } else {
      response = `📊 Organization Status:\n\n`;
      response += `⏳ Pending Approvals: ${pending?.length || 0}\n`;
    }
  }
  
  // Approve document command
  else if (message.startsWith('approve doc #')) {
    if (!hasPermission(user.role, 'approve_doc')) {
      response = `❌ You don't have permission to approve documents.`;
    } else {
      const docId = message.replace('approve doc #', '').trim();
      
      const { error } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', docId)
        .eq('org_id', user.org_id);
      
      if (error) {
        response = `❌ Failed to approve document.`;
      } else {
        response = `✅ Document #${docId} approved!`;
      }
    }
  }
  
  // Default response
  else {
    response = `👋 Hi ${user.full_name}!\n\nI didn't understand that command. Type "help" to see available commands.`;
  }
  
  await sendWhatsAppMessage(phoneNumber, response);
}

// Get help text based on role
function getHelpText(role) {
  const common = `📱 Spend4Good WhatsApp Bot\n\nAvailable Commands:\n\n`;
  
  const commands = {
    admin: [
      '• "Create project: [name]" - Create new project',
      '• "Status" - Check pending approvals',
      '• "Approve doc #[id]" - Approve document',
      '• "Reject doc #[id]: [reason]" - Reject document',
      '• Send image + "Receipt for [Project], R[amount]"'
    ],
    project_manager: [
      '• "Create project: [name]" - Create new project',
      '• "Status" - Check pending approvals',
      '• "Approve doc #[id]" - Approve document',
      '• "Reject doc #[id]: [reason]" - Reject document',
      '• Send image + "Receipt for [Project], R[amount]"'
    ],
    field_agent: [
      '• Send image + "Receipt for [Project], R[amount]"',
      '• "Status" - Check your pending approvals',
      '• "Help" - Show this help'
    ],
    accountant: [
      '• "Status" - Check pending approvals',
      '• "Report [Project]" - Generate project report',
      '• "Help" - Show this help'
    ],
    funder: [
      '• "Status" - Check pending approvals',
      '• "Report [Project]" - Generate project report',
      '• "Help" - Show this help'
    ]
  };
  
  return common + (commands[role] || commands.field_agent).join('\n');
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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
