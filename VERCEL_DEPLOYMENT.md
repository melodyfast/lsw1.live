# Vercel Deployment Guide

This guide will help you deploy your Firebase-powered app to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Git Repository**: Your code should be in a Git repo (GitHub, GitLab, or Bitbucket)
3. **Firebase Project**: Your Firebase project should remain active (we're keeping Firebase Auth + Firestore)

## Step 1: Connect Your Repository to Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your Git repository
4. Vercel will auto-detect your Vite/React project

## Step 2: Configure Build Settings

Vercel should auto-detect these settings, but verify:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Root Directory**: `./` (or leave empty)

## Step 3: Set Environment Variables

In your Vercel project settings, add these environment variables:

### Required Firebase Variables

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### Optional Variables

```
VITE_ADMIN_UID=your-admin-uid (if you have admin functionality)
```

**How to add environment variables in Vercel:**
1. Go to your project → **Settings** → **Environment Variables**
2. Add each variable for **Production**, **Preview**, and **Development** environments
3. Click **Save**

## Step 4: Deploy

1. Click **"Deploy"** in Vercel
2. Vercel will:
   - Install dependencies
   - Run `npm run build`
   - Deploy to a global CDN
3. Your site will be live at `your-project.vercel.app`

## Step 5: Configure Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain (e.g., `lsw1.dev`)
3. Follow Vercel's DNS configuration instructions
4. Update Firebase Auth settings to allow your new domain

### Update Firebase Auth Settings

In Firebase Console → Authentication → Settings → Authorized domains:
- Add your Vercel domain: `your-project.vercel.app`
- Add your custom domain: `lsw1.dev`

## Step 6: Verify Deployment

1. Visit your deployed site
2. Test authentication (login/signup)
3. Test database operations (view leaderboards, submit runs)
4. Check browser console for any errors

## Important Notes

### Firebase Services Still Active
- ✅ **Firebase Auth**: Still works (no changes needed)
- ✅ **Firestore**: Still works (no changes needed)
- ✅ **Firestore Rules**: Still active and enforced
- ✅ **Firestore Indexes**: Still active

### What Changed
- ❌ **Hosting**: Now on Vercel instead of Firebase Hosting
- ✅ **Everything else**: Unchanged

### Build Output
- Vite builds to `dist/` directory
- Vercel automatically serves this directory
- The `vercel.json` handles SPA routing (all routes → `index.html`)

## Troubleshooting

### Issue: Build fails
**Solution**: Check build logs in Vercel dashboard. Common issues:
- Missing environment variables
- Build timeout (increase in Vercel settings)
- Node version mismatch (set in Vercel settings)

### Issue: Routes return 404
**Solution**: Verify `vercel.json` has the rewrite rule for SPA routing

### Issue: Assets not loading
**Solution**: Check that `outputDirectory` in `vercel.json` matches Vite's output (`dist`)

### Issue: Firebase Auth not working
**Solution**: 
1. Verify environment variables are set correctly
2. Check Firebase Auth authorized domains include your Vercel domain
3. Check browser console for CORS/domain errors

### Issue: Environment variables not working
**Solution**: 
- Variables must start with `VITE_` to be exposed to the client
- Redeploy after adding new environment variables
- Check variable names match exactly (case-sensitive)

## Continuous Deployment

Vercel automatically deploys when you:
- Push to your main branch (production)
- Push to other branches (preview deployments)
- Open a Pull Request (preview deployment)

## Performance Optimization

Vercel automatically:
- ✅ Serves static assets from CDN
- ✅ Compresses files
- ✅ Caches assets (configured in `vercel.json`)
- ✅ Provides edge functions if needed

## Monitoring

- Check deployment logs in Vercel dashboard
- View analytics in Vercel dashboard
- Monitor Firebase usage in Firebase Console

## Rollback

If something goes wrong:
1. Go to **Deployments** in Vercel
2. Find the previous working deployment
3. Click **"..."** → **"Promote to Production"**

## Cost Comparison

- **Firebase Hosting**: Free tier available, then pay-as-you-go
- **Vercel**: Free tier available (generous), then pricing based on usage
- **Firebase Auth + Firestore**: Still using Firebase (unchanged costs)

## Next Steps

1. ✅ Deploy to Vercel
2. ✅ Test all functionality
3. ✅ Set up custom domain
4. ✅ Configure Firebase Auth domains
5. ✅ Monitor performance
6. ✅ Set up preview deployments for branches/PRs

---

**Need Help?**
- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord
- Firebase Docs: https://firebase.google.com/docs

