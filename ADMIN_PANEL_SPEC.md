# Spend4Good Admin Panel - Lovable Build Spec

**Copy this entire prompt into Lovable to build the admin dashboard**

---

## Project Overview

Build an admin dashboard for Spend4Good, a nonprofit spend tracking platform. The dashboard manages organizations, users, projects, and document approvals.

## Tech Stack

- React + TypeScript
- Tailwind CSS
- Supabase (backend already set up)
- shadcn/ui components
- React Router for navigation

## Supabase Connection

Project URL: `https://rpkivjzkgmfwnitjdmcv.supabase.co`
Anon Key: `[Get from Supabase dashboard]`

## Database Schema

**Tables:**
- `organizations`: id, name, slug, country, onboarding_status, subscription_tier
- `users`: id, phone_number, org_id, role, full_name, email, is_active
- `projects`: id, org_id, name, description, budget_amount, currency, status
- `documents`: id, org_id, project_id, uploaded_by, file_name, amount, status (pending/approved/rejected)
- `comments`: id, document_id, user_id, comment_text

## Pages to Build

### 1. Login Page (`/login`)
- Phone number input
- OTP request/verification
- Call backend API: `POST /api/auth/request-otp` and `POST /api/auth/verify-otp`
- Store user session in localStorage

### 2. Dashboard (`/dashboard`)
- Show organization overview
- Key metrics:
  - Total active projects
  - Pending document approvals
  - Total approved expenses
  - Active users
- Recent activity feed
- Quick actions: Create project, Add user

### 3. Projects Page (`/projects`)
- List all projects in organization
- Filter by status (active/completed/archived)
- Search by project name
- Create new project modal
- Click project to see details

### 4. Project Details Page (`/projects/:id`)
- Project info: name, budget, dates, status
- Document list for this project
- Expense summary (total spent, remaining budget)
- Edit project button (admin/PM only)

### 5. Documents Page (`/documents`)
- Table view of all documents
- Columns: Date, Project, Uploader, Type, Amount, Status
- Filter by status (pending/approved/rejected)
- Filter by project
- Search by vendor/description
- Approve/Reject buttons (admin/PM only)
- View document modal (show image placeholder)

### 6. Users Page (`/users`)
- List all users in organization
- Columns: Name, Phone, Role, Status, Last Login
- Add user button (admin only)
- Edit user role (admin only)
- Activate/deactivate users

### 7. Settings Page (`/settings`)
- Organization details
- Subscription info
- WhatsApp bot status
- API webhook URL

## Key Components

### Navbar
- Logo
- Navigation links (Dashboard, Projects, Documents, Users, Settings)
- User profile dropdown
- Organization name

### Sidebar
- Collapsible
- Icons + labels
- Active state highlighting

### Document Approval Card
- Document info (project, amount, uploader, date)
- Image preview
- Approve/Reject buttons
- Comment input
- Status badge

### User Role Badge
- Color-coded by role:
  - Admin: red
  - Project Manager: blue
  - Accountant: green
  - Funder: purple
  - Field Agent: gray

### Status Badge
- pending: yellow
- approved: green
- rejected: red
- active: blue
- completed: gray

## Permissions Logic

```typescript
const permissions = {
  admin: ['view_all', 'create_project', 'add_user', 'approve_doc', 'edit_org'],
  project_manager: ['view_all', 'create_project', 'approve_doc'],
  accountant: ['view_all'],
  funder: ['view_all'],
  field_agent: ['view_own']
};

function hasPermission(userRole: string, action: string): boolean {
  return permissions[userRole]?.includes(action) || false;
}
```

## API Integration

Base URL: `http://localhost:3000/api` (or deployed URL)

**Headers for all requests:**
```
x-user-phone: +27821234567
```

**Endpoints:**
- `GET /api/users/me` - Get current user
- `GET /api/projects` - Get all projects
- `GET /api/documents` - Get all documents
- `POST /api/projects` - Create project
- `PATCH /api/documents/:id` - Update document status

## Design Guidelines

- Clean, modern design
- Use shadcn/ui components
- Tailwind CSS for styling
- Responsive (mobile-first)
- Dark mode toggle
- Loading states for all data fetches
- Error handling with toast notifications

## Sample Color Palette

```css
--primary: #2563eb (blue)
--secondary: #8b5cf6 (purple)
--success: #10b981 (green)
--warning: #f59e0b (yellow)
--danger: #ef4444 (red)
--background: #ffffff
--foreground: #0f172a
```

## Supabase Queries

```typescript
// Get projects
const { data: projects } = await supabase
  .from('projects')
  .select('*, users(full_name)')
  .eq('org_id', userOrgId)
  .order('created_at', { ascending: false });

// Get pending documents
const { data: pendingDocs } = await supabase
  .from('documents')
  .select('*, projects(name), users(full_name)')
  .eq('org_id', userOrgId)
  .eq('status', 'pending')
  .order('created_at', { ascending: false });

// Approve document
const { error } = await supabase
  .from('documents')
  .update({ 
    status: 'approved', 
    approved_by: userId,
    approved_at: new Date().toISOString() 
  })
  .eq('id', documentId);
```

## Authentication Flow

1. User enters phone number
2. Backend sends OTP via SMS
3. User enters OTP
4. Backend verifies and returns user data
5. Store user in localStorage
6. Redirect to dashboard

## Charts/Visualizations

### Dashboard Charts
- Monthly expenses line chart (last 6 months)
- Expenses by project (pie chart)
- Document approval rate (progress bar)

Use Recharts library for visualizations.

## Deployment

Deploy to Vercel or Netlify after build.

## Sample Data

Use the demo data already in Supabase:
- Organization: Clean Water Foundation
- Users: Sarah Admin, John PM, Mike Field, etc.
- Projects: Well Drilling, Water Pump Installation
- Documents: Mix of pending/approved/rejected

---

## Build Instructions for Lovable

1. Paste this entire spec into Lovable
2. Ask: "Build this admin dashboard with all pages and components"
3. Verify Supabase connection works
4. Test with demo phone number: +27821234567
5. Deploy to Vercel

**Expected Build Time:** 30-60 minutes in Lovable
