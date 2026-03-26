# Authentication Testing Guide

## Prerequisites
- Ensure your Supabase project has:
  - Auth enabled with email/password provider
  - Email confirmation disabled (for easier testing) OR confirmation emails working
  - Seeded users with matching Auth accounts and user_profile rows

## Test 1: Sign in as ADMIN

### Steps:
1. Start dev server: `cd frontend-app && npm run dev`
2. Visit http://localhost:3000
3. Click "Sign In" in header OR visit http://localhost:3000/sign-in
4. Enter:
   - Email: `admin@gmail.com`
   - Password: [your seeded password]
5. Click "Sign In"

### Expected Results:
- ✅ Redirected to `/dashboard`
- ✅ Header shows display name + "ADMIN" badge (red)
- ✅ Dashboard page shows "Teacher Dashboard" card
- ✅ Can click "Go to Teacher Dashboard" → redirects to `/teacher`
- ✅ Teacher page loads successfully (ADMIN has teacher access)

---

## Test 2: Sign in as TEACHER

### Steps:
1. Click "Sign Out" in header
2. Sign in with:
   - Email: `richard@gmail.com`
   - Password: [your seeded password]

### Expected Results:
- ✅ Redirected to `/dashboard`
- ✅ Header shows display name + "TEACHER" badge (blue)
- ✅ Dashboard shows "Teacher Dashboard" card
- ✅ Can access `/teacher` page

---

## Test 3: Sign in as STUDENT

### Steps:
1. Sign out
2. Sign in with:
   - Email: `aarush@gmail.com`
   - Password: [your seeded password]

### Expected Results:
- ✅ Redirected to `/dashboard`
- ✅ Header shows display name + "STUDENT" badge (green)
- ✅ Dashboard does NOT show "Teacher Dashboard" card
- ✅ Trying to visit `/teacher` manually → redirected to `/dashboard`

---

## Test 4: New Sign-up

### Steps:
1. Sign out
2. Visit http://localhost:3000/sign-up
3. Enter:
   - Display Name: `Test User`
   - Email: `testuser@example.com`
   - Password: `password123`
4. Click "Sign Up"

### Expected Results:
- ✅ Account created successfully
- ✅ Auto signed in
- ✅ Redirected to `/dashboard`
- ✅ Header shows "Test User" + "STUDENT" badge
- ✅ Check Supabase:
  - auth.users has new user
  - user_profile has matching row with role='STUDENT'

---

## Test 5: Route Protection

### Steps:
1. Sign out (or use incognito window)
2. Try visiting:
   - http://localhost:3000/dashboard
   - http://localhost:3000/teacher

### Expected Results:
- ✅ Both URLs redirect to `/sign-in`
- ✅ After signing in, user is redirected to originally requested page

---

## Test 6: Session Persistence

### Steps:
1. Sign in as any user
2. Refresh the page
3. Close browser and reopen
4. Visit http://localhost:3000

### Expected Results:
- ✅ Still signed in (session persisted in cookies)
- ✅ Header still shows user info
- ✅ Can access protected routes

---

## Troubleshooting

### "Invalid login credentials" error
- Check seeded users exist in Supabase Auth > Users
- Verify passwords match
- Confirm email addresses are correct (lowercase)

### "Failed to create user profile" during sign-up
- Check RLS is disabled (as mentioned in requirements)
- Verify user_profile table exists
- Check browser console for detailed error

### Middleware not protecting routes
- Verify middleware.ts exists at `src/middleware.ts`
- Check that @supabase/ssr is installed
- Restart dev server

### Type errors preventing build
- Pre-existing type errors in [loSlug]/page.tsx are unrelated to auth
- Auth functionality works in dev mode despite type errors
- Type issues can be fixed separately

---

## Database Verification

After testing, verify in Supabase dashboard:

### auth.users table
- Should have 4 users: admin, richard, aarush, testuser

### user_profile table
```sql
SELECT user_id, role, display_name FROM user_profile;
```

Expected:
- admin@gmail.com → ADMIN
- richard@gmail.com → TEACHER
- aarush@gmail.com → STUDENT
- testuser@example.com → STUDENT
