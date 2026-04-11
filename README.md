# Spend4Good Backend API

WhatsApp-first nonprofit spend tracking platform with Twilio and Supabase.

## Features

- 🔐 Phone-based authentication with OTP
- 📱 WhatsApp bot for document uploads and approvals
- 👥 Multi-tenant architecture with RLS
- 🎯 Role-based permissions (Admin, PM, Accountant, Funder, Field Agent)
- 📄 Document upload and approval workflows
- 💬 Comment system for collaboration
- 📊 Project tracking and reporting

## Architecture

```
WhatsApp → Twilio → Backend API → Supabase (Postgres + Storage)
                                       ↓
                              Admin Panel (Lovable)
```

## Quick Start

### 1. Prerequisites

- Node.js >= 18.0.0
- Supabase account (already set up: rpkivjzkgmfwnitjdmcv)
- Twilio account with WhatsApp enabled

### 2. Installation

```bash
cd spend4good-backend
npm install
```

### 3. Environment Setup

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 4. Get Supabase Credentials

```bash
# Go to Supabase Dashboard: https://supabase.com/dashboard/project/rpkivjzkgmfwnitjdmcv/settings/api

# Copy these values to .env:
# - SUPABASE_URL (already filled in)
# - SUPABASE_SERVICE_ROLE_KEY
# - SUPABASE_ANON_KEY
```

### 5. Twilio Setup

1. **Create Twilio Account**: https://www.twilio.com/try-twilio
2. **Get Account SID and Auth Token**: https://console.twilio.com/
3. **Enable WhatsApp**: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
4. **Get WhatsApp Number**: Follow Twilio's WhatsApp sandbox setup

### 6. Start Server

```bash
npm run dev
```

Server will start on http://localhost:3000

### 7. Ngrok Setup (for WhatsApp webhook)

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Add to Twilio WhatsApp Sandbox settings:
# Webhook URL: https://abc123.ngrok.io/api/whatsapp/webhook
```

## API Endpoints

### Authentication

**Request OTP**
```bash
POST /api/auth/request-otp
Content-Type: application/json

{
  "phone_number": "+27821234567"
}
```

**Verify OTP**
```bash
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone_number": "+27821234567",
  "code": "123456"
}
```

### Projects

**Get All Projects**
```bash
GET /api/projects
Headers:
  x-user-phone: +27821234567
```

### Documents

**Get All Documents**
```bash
GET /api/documents
Headers:
  x-user-phone: +27821234567
```

### WhatsApp Webhook

```bash
POST /api/whatsapp/webhook
# Automatically handled by Twilio
```

## WhatsApp Commands

### Field Agent
```
Send image + "Receipt for Well Drilling, R2500"
Send image + "Invoice for Water Pumps, R45000"
"Status"
```

### Project Manager / Admin
```
"Create project: Solar Panel Installation"
"Approve doc #abc123"
"Reject doc #xyz789: Duplicate receipt"
"Status"
```

### Accountant / Funder
```
"Status"
"Report for Well Drilling"
```

## Testing with Demo Users

Use these phone numbers to test different roles:

- `+27821234567` - Sarah Admin (admin)
- `+27821234568` - John PM (project_manager)
- `+27821234569` - Mike Field (field_agent)
- `+27821234570` - Lisa Numbers (accountant)
- `+27821234571` - Gates Foundation Rep (funder)

## Database Schema

See `schema.sql` for complete database structure.

**Key Tables:**
- `organizations` - Nonprofit organizations
- `users` - Users with phone-based auth
- `projects` - Projects within each org
- `documents` - Uploaded receipts/invoices
- `comments` - Collaboration comments
- `otp_codes` - Phone verification codes

## Deployment

### Option 1: Render.com (Recommended)

1. Push code to GitHub
2. Connect to Render: https://render.com
3. Add environment variables
4. Deploy

### Option 2: Railway.app

1. Push code to GitHub
2. Connect to Railway: https://railway.app
3. Add environment variables
4. Deploy

### Option 3: Vercel (Serverless)

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Add environment variables
4. Deploy

## Security

- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Multi-tenant data isolation
- ✅ Phone-based OTP verification
- ✅ Role-based access control
- ✅ Secure function search paths

## Monitoring

Add these tools for production:
- Sentry for error tracking
- LogRocket for session replay
- Twilio Monitor for webhook logs

## Cost Estimation (100 active users)

- Supabase: $25/month (Pro plan)
- Twilio WhatsApp: $50-100/month (depends on messages)
- Hosting (Render/Railway): $7-20/month
- **Total: ~$85-150/month**

## Next Steps

1. ✅ Database schema deployed
2. ✅ Backend API built
3. ⏳ Admin panel (build with Lovable)
4. ⏳ OCR integration (Tesseract.js or Google Vision)
5. ⏳ PDF report generation
6. ⏳ Payment/invoicing system

## Support

For issues or questions, contact: ntando@spend4good.com

## License

MIT
