# CLAUDE CODE HANDOFF - Spend4Good Backend Setup

## 🎯 MISSION
Set up and test the Spend4Good WhatsApp-first nonprofit spend tracking backend on Ntando's local machine in the next 30 minutes.

---

## ✅ WHAT'S ALREADY DONE

### Database (Supabase)
- **Project ID:** rpkivjzkgmfwnitjdmcv
- **Project URL:** https://rpkivjzkgmfwnitjdmcv.supabase.co
- **Status:** ACTIVE_HEALTHY ✅
- **Schema:** Complete with all tables (organizations, users, projects, documents, comments, otp_codes)
- **RLS Policies:** Configured for multi-tenant isolation
- **Demo Data:** 3 orgs, 7 users, 3 projects, 5 documents

### Backend Code
- **Location:** All files are in `/mnt/user-data/outputs/spend4good-backend/`
- **Stack:** Node.js + Express + Supabase + Twilio
- **Features:** WhatsApp bot, OTP auth, document uploads, approval workflow

### Credentials (ALREADY CONFIGURED)
- **Twilio Account SID:** [SET IN RENDER ENV VARS]
- **Twilio Auth Token:** [SET IN RENDER ENV VARS]

---

## 🚀 YOUR TASKS (30-45 mins)

### Task 1: Get Supabase API Keys (2 mins)
1. Open browser to: https://supabase.com/dashboard/project/rpkivjzkgmfwnitjdmcv/settings/api
2. Copy "anon public" key
3. Copy "service_role" key
4. Update `.env` file with these keys

### Task 2: Get Twilio Phone Numbers (5 mins)
1. **WhatsApp Number:**
   - Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
   - Follow sandbox setup (user sends "join [code]" to Twilio number from their phone)
   - Copy the WhatsApp number (e.g., +14155238886)
   - Update `.env` with `TWILIO_WHATSAPP_NUMBER`

2. **Regular SMS Number:**
   - Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
   - Copy the trial phone number
   - Update `.env` with `TWILIO_PHONE_NUMBER`

### Task 3: Setup Project Locally (3 mins)
```bash
# Copy files from outputs to a working directory
cp -r /mnt/user-data/outputs/spend4good-backend ~/spend4good-backend
cd ~/spend4good-backend

# Install dependencies
npm install

# Verify .env file is configured
cat .env
```

### Task 4: Start Backend Server (1 min)
```bash
npm run dev
```

Expected output:
```
🚀 Spend4Good Backend running on port 3000
📱 WhatsApp webhook: http://localhost:3000/api/whatsapp/webhook
```

### Task 5: Setup Ngrok Tunnel (3 mins)
```bash
# In a NEW terminal window
# Check if ngrok is installed
which ngrok

# If not installed:
# Mac: brew install ngrok
# Or download from: https://ngrok.com/download

# Start ngrok
ngrok http 3000
```

Copy the HTTPS URL (e.g., https://abc123.ngrok.io)

### Task 6: Configure Twilio Webhook (2 mins)
1. Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
2. Under "WHEN A MESSAGE COMES IN"
3. Paste: `https://[your-ngrok-url].ngrok.io/api/whatsapp/webhook`
4. Save

### Task 7: Test Everything (10 mins)

**Test 1: Health Check**
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","timestamp":"..."}`

**Test 2: OTP to Ntando's Phone**
```bash
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27XXXXXXXXX"}'
```
Check phone for SMS with OTP code.

**Test 3: Verify OTP**
```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27XXXXXXXXX", "code": "123456"}'
```

**Test 4: WhatsApp Bot**
From Ntando's phone, send WhatsApp to Twilio number:
```
help
```
Expected: Bot replies with command list

**Test 5: Document Upload Simulation**
Send image via WhatsApp with caption:
```
Receipt for Well Drilling, R2500
```
Expected: Bot confirms upload, shows pending status

**Test 6: Approval (using demo PM number)**
Send WhatsApp:
```
status
```
Then approve a document:
```
Approve doc #[id from previous message]
```

### Task 8: Demo Login Test (5 mins)
Test REST API with demo users:

```bash
# Get projects (as Admin)
curl http://localhost:3000/api/projects \
  -H "x-user-phone: +27821234567"

# Get documents (as PM)
curl http://localhost:3000/api/documents \
  -H "x-user-phone: +27821234568"
```

---

## 📋 CHECKLIST

Copy this to track progress:

```
[ ] Task 1: Got Supabase API keys and updated .env
[ ] Task 2: Got Twilio phone numbers and updated .env
[ ] Task 3: Installed npm dependencies
[ ] Task 4: Backend server running on localhost:3000
[ ] Task 5: Ngrok tunnel running
[ ] Task 6: Twilio webhook configured
[ ] Test 1: Health check passed
[ ] Test 2: OTP SMS received on phone
[ ] Test 3: OTP verification successful
[ ] Test 4: WhatsApp bot responding to "help"
[ ] Test 5: WhatsApp image upload works
[ ] Test 6: WhatsApp approval workflow works
[ ] Test 7: REST API endpoints working
[ ] DONE: Backend is fully functional! 🎉
```

---

## 🔑 CREDENTIALS REFERENCE

**Supabase:**
- Project ID: rpkivjzkgmfwnitjdmcv
- URL: https://rpkivjzkgmfwnitjdmcv.supabase.co
- Anon Key: [GET FROM DASHBOARD]
- Service Role Key: [GET FROM DASHBOARD]

**Twilio:**
- Account SID: [SET IN RENDER ENV VARS]
- Auth Token: [SET IN RENDER ENV VARS]
- Phone Number: [GET FROM DASHBOARD]
- WhatsApp Number: [GET FROM DASHBOARD]

**Demo Users (for testing):**
- Admin: +27821234567
- PM: +27821234568
- Field Agent: +27821234569
- Accountant: +27821234570
- Funder: +27821234571

---

## 🐛 TROUBLESHOOTING

**Server won't start:**
- Check Node.js version: `node --version` (need 18+)
- Check .env file exists: `ls -la .env`
- Check all env vars are set: `cat .env`

**WhatsApp not responding:**
- Verify ngrok is running: check terminal output
- Verify webhook URL in Twilio console
- Check backend logs for errors
- Test webhook manually: `curl https://your-ngrok.ngrok.io/api/whatsapp/webhook`

**OTP not received:**
- Check Twilio account credits: https://console.twilio.com/
- Verify phone number format (+27...)
- Check Twilio message logs: https://console.twilio.com/monitor/logs/messages

**"Unauthorized" errors:**
- Verify x-user-phone header is set
- Check user exists in database
- Verify OTP was verified successfully

---

## 📊 DATABASE SCHEMA REFERENCE

**Tables:**
- `organizations` - Nonprofit orgs
- `users` - Phone-based users with roles
- `projects` - Projects within orgs
- `documents` - Uploaded receipts/invoices
- `comments` - Document comments
- `otp_codes` - Phone verification

**Roles:**
- `admin` - Full access
- `project_manager` - Create projects, approve docs
- `accountant` - View only, comment
- `funder` - View only, comment, reports
- `field_agent` - Upload docs, view own

---

## 🎯 AFTER SUCCESSFUL TESTING

Once everything works, help Ntando:

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Spend4Good backend"
   git remote add origin [Ntando's GitHub repo]
   git push -u origin main
   ```

2. **Deploy to Render.com:**
   - Use `render.yaml` config
   - Add all env vars from `.env`
   - Update Twilio webhook to production URL

3. **Build Admin Panel:**
   - Open `ADMIN_PANEL_SPEC.md`
   - Copy entire content to Lovable
   - Let Lovable build the dashboard
   - Deploy to Vercel

---

## 💡 NEXT STEPS AFTER TESTING

- [ ] Deploy backend to production (Render/Railway)
- [ ] Build admin panel in Lovable
- [ ] Add OCR for receipt scanning
- [ ] Implement PDF report generation
- [ ] Set up error monitoring (Sentry)
- [ ] Configure production domains

---

## 📞 SUPPORT RESOURCES

- Twilio Docs: https://www.twilio.com/docs/whatsapp
- Supabase Docs: https://supabase.com/docs
- Express Docs: https://expressjs.com/
- Ngrok Docs: https://ngrok.com/docs

---

## 🎉 SUCCESS CRITERIA

You're done when:
1. ✅ Backend server running locally
2. ✅ WhatsApp bot responding to messages
3. ✅ OTP authentication working
4. ✅ Document upload via WhatsApp functional
5. ✅ Approval workflow tested
6. ✅ REST API endpoints responding
7. ✅ Ngrok tunnel active
8. ✅ Twilio webhook configured

**Then show Ntando the working WhatsApp bot and get ready to deploy! 🚀**

---

**ESTIMATED TOTAL TIME: 30-45 minutes**

**START WITH TASK 1 AND WORK THROUGH THE CHECKLIST.**

Good luck, Claude Code! 💪
