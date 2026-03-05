# 🎯 QUICK TEST: Maintenance Logout (3 Minutes)

## 📋 Test Steps

1. **Start server**: `npm run dev`
2. **Login**: localhost:3000 as non-superadmin
3. **Open DevTools**: F12 → Application → Cookies
4. **Remember**: next-auth.session-token cookie
5. **Navigate**: /superadmin/organizations
6. **Schedule**: Maintenance for NOW + 2 MINUTES
7. **Wait**: ~90 seconds
8. **Watch**:
   - Screen fades out
   - URL → /login?maintenance=true
   - Maintenance banner appears
9. **Check DevTools**: next-auth.session-token GONE ✅
10. **Try dashboard**: /dashboard → redirects to /login ✅

## ✅ Success Criteria

- [ ] Screen faded
- [ ] Redirected to /login?maintenance=true  
- [ ] Cookies deleted
- [ ] Dashboard access blocked

## 📊 What Was Fixed

- ✅ Server-side session termination via getServerSession()
- ✅ Direct API calls to /api/auth/logout
- ✅ Three fallback logout mechanisms
- ✅ Hard redirect (window.location.href)
- ✅ Maintenance flag prevents auto-redirect

## 🎯 Result

If all 4 success criteria pass → **LOGOUT WORKS CORRECTLY** ✅

See MAINTENANCE_LOGOUT_TEST_GUIDE.md for detailed guide.
