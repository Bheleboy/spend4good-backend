# 🚀 SPEND4GOOD - LAUNCH IN 2 HOURS

## ✅ WHAT'S ALREADY DONE

- ✅ Database schema live in Supabase
- ✅ Demo data created (3 orgs, 7 users, 3 projects, 5 documents)
- ✅ Backend API built with WhatsApp integration
- ✅ Twilio credentials configured
- ✅ Multi-tenant security with RLS
- ✅ Role-based permissions (5 roles)

---

## 🎯 YOUR 2-HOUR LAUNCH PLAN

### ⏱️ Step 1: Get Supabase API Keys (2 mins)

1. Go to: https://supabase.com/dashboard/project/rpkivjzkgmfwnitjdmcv/settings/api
2. Copy **"anon public"** key
3. Copy **"service_role"** key (keep secret!)
4. Open `.env` file in this folder
5. Paste both keys in the right places

### ⏱️ Step 2: Get Twilio WhatsApp Number (10 mins)

1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Click **"Send a WhatsApp message"**
3. Follow the sandbox setup:
   - Send `join [your-code]` to the Twilio WhatsApp number
   - Example: `join accept-party` to `+1 415 523 8886`
4. Copy the WhatsApp number (e.g., `+14155238886`)
5. Update `.env` file:
   ```
   TWILIO_WHATSAPP_NUMBER=+14155238886
   ```

### ⏱️ Step 3: Get Regular Phone Number (5 mins)

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. You should have a trial number already
3. If not, click **"Buy a number"** (free with trial credits)
4. Copy the number
5. Update `.env` file:
   ```
   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
   ```

### ⏱️ Step 4: Start Backend Server (2 mins)

```bash
cd spend4good-backend
chmod +x setup.sh
./setup.sh
npm run dev
```

You should see:
```
🚀 Spend4Good Backend running on port 3000
📱 WhatsApp webhook: http://localhost:3000/api/whatsapp/webhook
```

### ⏱️ Step 5: Setup Ngrok Tunnel (3 mins)

**Open a NEW terminal window:**

```bash
# Install ngrok (if not installed)
# Mac: brew install ngrok
# Or download: https://ngrok.com/download

ngrok http 3000
```

You'll see something like:
```
Forwarding https://abc123.ngrok.io -> http://localhost:3000
```

**Copy that HTTPS URL!**

### ⏱️ Step 6: Configure Twilio Webhook (2 mins)

1. Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
2. Under **"Sandbox Configuration"**
3. Find **"WHEN A MESSAGE COMES IN"**
4. Paste: `https://abc123.ngrok.io/api/whatsapp/webhook`
5. Click **Save**

### ⏱️ Step 7: TEST WHATSAPP BOT (5 mins)

Send WhatsApp messages to your Twilio number:

**Test 1: Help Command**
```
help
```
Expected: Bot replies with command list

**Test 2: Status Check**
```
status
```
Expected: Shows pending approvals count

**Test 3: Create Project (use demo PM number)**
```
Create project: Solar Installation Test
```
Expected: Confirmation message

**Test 4: Upload Receipt (send an image)**
```
[Send any image from your phone]
Caption: Receipt for Well Drilling, R2500
```
Expected: Document uploaded, pending approval

**Test 5: Approve Document**
```
Approve doc #[paste the ID from previous message]
```
Expected: Approval confirmation

### ⏱️ Step 8: Test OTP Authentication (3 mins)

```bash
# Request OTP to your phone
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27XXXXXXXXX"}'

# Check SMS on your phone for code

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27XXXXXXXXX", "code": "123456"}'
```

### ⏱️ Step 9: Build Admin Panel with Lovable (60 mins)

1. Go to: https://lovable.dev
2. Click **"Create new project"**
3. Name it: **"Spend4Good Admin"**
4. Open `ADMIN_PANEL_SPEC.md` from this folder
5. Copy **ENTIRE content** (Cmd+A, Cmd+C)
6. Paste into Lovable chat
7. Wait for Lovable to build (~30-60 mins)
8. Configure Supabase connection:
   - URL: `https://rpkivjzkgmfwnitjdmcv.supabase.co`
   - Anon Key: [paste from Step 1]
9. Test login with demo number: `+27821234567`
10. Deploy to Vercel (built into Lovable)

### ⏱️ Step 10: Production Deployment (30 mins)

**Backend to Render.com:**

1. Push this folder to GitHub
2. Go to: https://render.com
3. Click **"New +" > "Web Service"**
4. Connect GitHub repo
5. Add environment variables from `.env`
6. Click **"Create Web Service"**
7. Wait for deployment
8. Copy production URL
9. Update Twilio webhook to production URL

**Admin Panel:**
- Already deployed via Lovable/Vercel in Step 9
- Update API endpoint in admin panel to Render URL

---

## 🎉 YOU'RE LIVE!

Your nonprofit spend tracking platform is now:
- ✅ Accepting WhatsApp uploads
- ✅ Processing OTP logins
- ✅ Managing multi-tenant data
- ✅ Handling approvals
- ✅ Running admin dashboard

---

## 📱 DEMO PHONE NUMBERS (for testing)

Login to admin panel with these:

| Phone | Name | Role | Password |
|-------|------|------|----------|
| +27821234567 | Sarah Admin | admin | OTP |
| +27821234568 | John PM | project_manager | OTP |
| +27821234569 | Mike Field | field_agent | OTP |
| +27821234570 | Lisa Numbers | accountant | OTP |
| +27821234571 | Gates Foundation Rep | funder | OTP |

---

## 💰 MONTHLY COSTS (100 active users)

| Service | Cost | Link |
|---------|------|------|
| Supabase Pro | $25 | https://supabase.com/pricing |
| Twilio WhatsApp | $50-100 | https://www.twilio.com/pricing/messaging |
| Render Starter | $7 | https://render.com/pricing |
| **TOTAL** | **$85-150** | Scale as you grow |

---

## 🆘 TROUBLESHOOTING

**WhatsApp not responding?**
- Check ngrok is running
- Verify webhook URL in Twilio console
- Check backend logs for errors

**OTP not received?**
- Check Twilio credits: https://console.twilio.com/
- Verify phone number format (+27...)
- Check Twilio logs: https://console.twilio.com/monitor/logs

**Admin panel not loading?**
- Check Supabase connection
- Open browser console (F12) for errors
- Verify API endpoint URL

**"Unauthorized" errors?**
- Check if user exists in database
- Verify OTP was verified successfully
- Check `x-user-phone` header is set

---

## 📞 SUPPORT

**Twilio Issues:**
- Twilio Console: https://console.twilio.com/
- Support: https://support.twilio.com/

**Supabase Issues:**
- Dashboard: https://supabase.com/dashboard
- Docs: https://supabase.com/docs

**Deployment Issues:**
- Render Support: https://render.com/docs
- Lovable Community: https://lovable.dev/community

---

## 🎯 FIRST PAYING CUSTOMER CHECKLIST

- [ ] Backend deployed to production
- [ ] Admin panel deployed to Vercel
- [ ] Custom domain configured (optional)
- [ ] Created real organization in database
- [ ] Added real admin user
- [ ] Admin successfully logged in
- [ ] Team members added
- [ ] First project created
- [ ] First document uploaded via WhatsApp
- [ ] First approval completed
- [ ] Invoice generated for first month

---

## 🚀 NEXT FEATURES TO BUILD

1. **OCR Integration** (extract amounts from receipts automatically)
2. **PDF Reports** (generate funder reports)
3. **Email Notifications** (approval alerts)
4. **Budget Alerts** (overspend warnings)
5. **Multi-currency** (USD, ZAR, KES, etc.)
6. **Offline Mode** (field agents with poor connectivity)
7. **Batch Uploads** (upload 10+ receipts at once)
8. **Analytics Dashboard** (spending trends, category breakdown)

---

**YOU'RE READY TO LAUNCH! 🔥**

Total time from here to production: **2 hours**
Time to first paying customer: **1-2 days**

Go get 'em! 💪
