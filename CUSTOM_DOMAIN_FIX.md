# Custom Domain Blank Page Fix

If your app works on `your-project.vercel.app` but shows a blank page on your custom domain, follow these steps:

## The Error You're Seeing

**"Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of 'text/html'"**

This means the server is returning HTML (probably `index.html`) instead of the JavaScript file when the browser requests `/assets/index-xxx.js`.

## Quick Fix (Most Likely Solution)

The issue is that Vercel's rewrite rule is catching asset requests. **The updated `vercel.json` should fix this**, but you need to:

1. **Push the updated `vercel.json`** to your repository
2. **Redeploy on Vercel** (or let it auto-deploy)
3. **Clear your browser cache** completely (or use incognito mode)
4. **Hard refresh** the custom domain (Ctrl+Shift+R or Cmd+Shift+R)

## Step-by-Step Troubleshooting

### Step 1: Verify the Fix is Deployed

1. Check that your latest commit includes the updated `vercel.json`
2. Go to Vercel Dashboard → **Deployments**
3. Verify the latest deployment succeeded
4. Check the deployment logs for any errors

### Step 2: Check Browser Console

1. Open your custom domain in a browser
2. Press `F12` → **Console** tab
3. Look for the exact error message
4. Go to **Network** tab → Reload page
5. Find the request for `/assets/index-xxx.js`
6. Check:
   - **Status**: Should be `200` (not `404` or `200` with HTML)
   - **Content-Type**: Should be `application/javascript` (not `text/html`)
   - **Response**: Should be JavaScript code (not HTML)

### Step 3: Verify File Exists

In the Network tab, check if:
- The JavaScript file request returns `200 OK`
- The response is actual JavaScript (not HTML)
- The `Content-Type` header is `application/javascript`

If it's returning HTML, the rewrite rule is still catching it.

### Step 4: Add Custom Domain to Firebase Auth

Even if this doesn't fix the MIME type issue, you'll need this:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. **Authentication** → **Settings** → **Authorized domains**
3. Click **"Add domain"**
4. Enter your custom domain (e.g., `lsw1.dev`)
5. Click **"Add"**
6. Wait 1-2 minutes

### Step 5: Clear All Caches

1. **Browser cache**: Clear completely or use incognito
2. **CDN cache**: Vercel should auto-clear, but you can:
   - Go to Vercel Dashboard → Your deployment → **..."** → **"Redeploy"**
   - This forces a fresh deployment

### Step 6: Verify Environment Variables

1. Vercel Dashboard → **Settings** → **Environment Variables**
2. Verify all Firebase variables are set for **Production**
3. **Redeploy** after adding/updating variables

## If Still Not Working

### Alternative: Check Vercel Domain Configuration

1. Vercel Dashboard → **Settings** → **Domains**
2. Verify your custom domain shows as **"Valid"** or **"Configured"**
3. Check DNS settings match Vercel's requirements
4. Verify SSL certificate is valid (should be automatic)

### Check for DNS/CDN Issues

1. Try accessing the asset directly: `https://yourdomain.com/assets/index-xxx.js`
2. If it returns HTML, the rewrite is still catching it
3. If it returns 404, the file path might be wrong
4. If it returns JavaScript, the issue is elsewhere

### Verify Build Output

1. Check that `dist/assets/` contains the JavaScript files
2. Verify the file names match what's in `dist/index.html`
3. Ensure the build completed successfully

### Test Direct Asset Access

Try accessing these URLs directly:
- `https://yourdomain.com/assets/index-xxx.js` (should return JavaScript)
- `https://yourdomain.com/assets/index-xxx.css` (should return CSS)
- `https://yourdomain.com/favicon.ico` (should return image)

If any return HTML, the rewrite is catching them.

## Technical Details

### How Vercel Routing Works

1. **First**: Vercel checks if a file exists at the requested path
2. **If file exists**: Serves it with appropriate MIME type
3. **If file doesn't exist**: Applies rewrite rules
4. **Rewrite rule**: Sends all non-file requests to `/index.html`

### Why This Happens

The rewrite rule `"source": "/(.*)"` should only apply when files don't exist. But sometimes:
- Custom domains have different routing behavior
- CDN caching serves old HTML responses
- DNS propagation delays cause routing issues

### The Fix

The updated `vercel.json` includes:
- Explicit `Content-Type` headers for JavaScript files
- Proper caching headers
- Standard SPA rewrite rule (Vercel handles file serving automatically)

## Still Having Issues?

If the problem persists after:
- ✅ Updated `vercel.json` is deployed
- ✅ Browser cache cleared
- ✅ Hard refresh tried
- ✅ Direct asset access tested

Then check:
1. **Vercel Support**: Contact Vercel support with your deployment URL
2. **Browser DevTools**: Share the exact Network tab response for the failing asset
3. **Compare domains**: Test the same asset URL on both `vercel.app` domain and custom domain

---

**Most Common Fix:** After deploying the updated `vercel.json`, clear browser cache and hard refresh. The explicit Content-Type headers should ensure JavaScript files are served correctly.
