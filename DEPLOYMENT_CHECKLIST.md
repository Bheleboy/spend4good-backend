# Spend4Good - Deployment & Testing Checklist

## Phase 1: Backend Setup (30 mins)

### ✅ Database (DONE)
- [x] Supabase project created: rpkivjzkgmfwnitjdmcv
- [x] Schema deployed with all tables
- [x] RLS policies configured
- [x] Demo data inserted
- [x] Security advisories checked

### ⏳ Twilio Setup (DO THIS NOW)

1. **Create Twilio Account**
   - Go to: https://www.twilio.com/try-twilio
   - Sign up (free trial gives $15 credit)
   - Verify your phone number

2. **Get Credentials**
   - Go to: https://console.twilio.com/
   - Copy `Account SID` and `Auth Token`
   - Save to `.env` file

3. **Enable WhatsApp Sandbox**
   - Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
   - Follow setup instructions
   - Send "join [sandbox-name]" to Twilio WhatsApp number
   - Copy WhatsApp number to `.env`

4. **Configure Webhook (after server is running)**
   - Install ngrok: `brew install ngrok` or download from https://ngrok.com
   - Run: `ngrok http 3000`
   - Copy HTTPS URL (e.g., `https://abc123.ngrok.io`)
   - Go to Twilio Console > Messaging > Settings
   - Set webhook URL: `https://abc123.ngrok.io/api/whatsapp/webhook`

### ⏳ Backend Deployment

**Option A: Local Testing First (RECOMMENDED)**
```bash
cd spend4good-backend
npm install
cp .env.example .env
# Fill in .env with Supabase + Twilio credentials
npm run dev
```

**Option B: Deploy to Render.com**
1. Push code to GitHub
2. Go to: https://render.com
3. Connect GitHub repo
4. Add environment variables
5. Deploy

**Option C: Deploy to Railway**
1. Push code to GitHub
2. Go to: https://railway.app
3. Connect GitHub repo
4. Add environment variables
5. Deploy

## Phase 2: Testing Backend (1 hour)

### Test Authentication

```bash
# Request OTP
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27821234567"}'

# Check your phone for OTP code

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27821234567", "code": "123456"}'
```

### Test WhatsApp Bot

1. **Send WhatsApp to Twilio number:**
   - Text: "help"
   - Expected: Bot replies with command list

2. **Test Status Command:**
   - Text: "status"
   - Expected: Shows pending approvals count

3. **Test Create Project (as Admin/PM):**
   - Text: "Create project: Solar Installation"
   - Expected: Confirmation message

4. **Test Image Upload (as Field Agent):**
   - Send an image
   - Caption: "Receipt for Well Drilling, R2500"
   - Expected: Document uploaded, pending approval message

5. **Test Approval (as PM):**
   - Text: "Approve doc #[id]"
   - Expected: Approval confirmation

### Test REST API

```bash
# Get projects
curl http://localhost:3000/api/projects \
  -H "x-user-phone: +27821234567"

# Get documents
curl http://localhost:3000/api/documents \
  -H "x-user-phone: +27821234567"

# Health check
curl http://localhost:3000/health
```

## Phase 3: Admin Panel Build (2-4 hours)

### Using Lovable (RECOMMENDED)

1. **Go to Lovable:** https://lovable.dev
2. **Create new project:** "Spend4Good Admin"
3. **Paste entire spec:** Copy content from `ADMIN_PANEL_SPEC.md`
4. **Build:** Let Lovable generate the dashboard
5. **Configure Supabase:**
   - Add Supabase URL: `https://rpkivjzkgmfwnitjdmcv.supabase.co`
   - Add anon key (get from Supabase dashboard)
6. **Test:** Login with demo phone numbers
7. **Deploy:** Push to Vercel from Lovable

### Manual Build (Alternative)

```bash
# Create Next.js app
npx create-next-app@latest spend4good-admin
cd spend4good-admin
npm install @supabase/supabase-js @tanstack/react-query
# Follow ADMIN_PANEL_SPEC.md to build components
```

## Phase 4: Integration Testing (30 mins)

### Test Complete Workflow

1. **Field Agent Uploads Receipt:**
   - WhatsApp: Send image + "Receipt for Well Drilling, R2500"
   - Admin Panel: Check Documents page - should see pending document

2. **Project Manager Approves:**
   - Option A: WhatsApp - "Approve doc #[id]"
   - Option B: Admin Panel - Click Approve button
   - Verify: Status changes to "approved"

3. **Accountant Views Report:**
   - Admin Panel: Go to project details
   - Check expense summary
   - Generate report (future feature)

4. **Funder Checks Status:**
   - WhatsApp: "status"
   - Admin Panel: View dashboard metrics

### Test Multi-Tenant Isolation

1. Login as user from Organization A
2. Try to access data from Organization B
3. Expected: Should NOT see other org's data

## Phase 5: Production Deployment (1 hour)

### Backend Deployment Checklist

- [ ] Environment variables set in production
- [ ] Twilio webhook URL updated to production URL
- [ ] Database connection tested
- [ ] CORS configured for admin panel domain
- [ ] SSL/HTTPS enabled
- [ ] Error logging configured (Sentry)

### Admin Panel Deployment Checklist

- [ ] Supabase connection configured
- [ ] API endpoint updated to production
- [ ] Build successful
- [ ] Deployed to Vercel/Netlify
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active

## Phase 6: Go-Live Preparation

### Create Real Organization

```sql
-- In Supabase SQL editor
INSERT INTO organizations (name, slug, country, onboarding_status)
VALUES ('Your Nonprofit Name', 'your-nonprofit-slug', 'South Africa', 'active');

-- Get the org ID, then add admin user
INSERT INTO users (phone_number, org_id, role, full_name, email)
VALUES ('+27XXXXXXXXX', '[org_id]', 'admin', 'Your Name', 'your@email.com');
```

### Onboarding Checklist

- [ ] Admin user created
- [ ] Admin receives OTP and logs in
- [ ] Admin adds team members (PM, Field Agents, etc.)
- [ ] Admin creates first project
- [ ] Field agent tests document upload
- [ ] PM tests approval workflow

## Phase 7: Monitoring & Maintenance

### Daily Checks

- [ ] Check Twilio message logs
- [ ] Review pending approvals
- [ ] Check error logs
- [ ] Monitor Supabase usage

### Weekly Checks

- [ ] Review user activity
- [ ] Check storage usage
- [ ] Review approval patterns
- [ ] User feedback collection

### Monthly Checks

- [ ] Cost analysis (Twilio, Supabase, hosting)
- [ ] Performance optimization
- [ ] Feature requests review
- [ ] Security audit

## Cost Tracking

**Monthly Estimates (100 active users):**

| Service | Cost | Notes |
|---------|------|-------|
| Supabase Pro | $25 | 8GB database, 100GB storage |
| Twilio WhatsApp | $50-100 | ~500-1000 messages/month |
| Render/Railway | $7-20 | Starter plan |
| **Total** | **$85-150** | Scales with usage |

## Troubleshooting

### WhatsApp not responding
- Check ngrok is running (local) or webhook URL is correct (production)
- Check Twilio logs: https://console.twilio.com/monitor/logs/messages
- Verify backend is running and healthy

### OTP not received
- Check Twilio credits
- Verify phone number format (+27...)
- Check Twilio message logs

### Admin panel not loading data
- Check Supabase connection
- Verify RLS policies
- Check browser console for errors
- Verify API endpoint URL

### Documents not uploading
- Check Supabase storage permissions
- Verify file size limits
- Check storage bucket exists

## Next Features (Future)

- [ ] OCR integration (Tesseract.js or Google Vision)
- [ ] PDF report generation
- [ ] Email notifications
- [ ] Funder dashboard with custom reports
- [ ] Budget alerts
- [ ] Expense categorization
- [ ] Multi-currency support
- [ ] Offline mode for field agents
- [ ] Batch document upload
- [ ] Advanced analytics

## Support Resources

- Twilio Docs: https://www.twilio.com/docs/whatsapp
- Supabase Docs: https://supabase.com/docs
- Lovable Community: https://lovable.dev/community

---

**READY TO LAUNCH!** 🚀

Follow this checklist step-by-step and you'll have a production-ready nonprofit spend tracking platform in 1-2 days.
