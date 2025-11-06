# React Hooks Exhaustive Dependencies Guide

This document explains the 21 React Hooks `exhaustive-deps` warnings and how to address them safely.

## ⚠️ Important Warning

**Do NOT blindly add all missing dependencies!** This can create infinite loops and break your application. Each case needs careful analysis.

## Understanding the Warnings

The `exhaustive-deps` rule warns when a useEffect/useCallback/useMemo hook doesn't include all values it references that could change.

### Safe Fixes vs. Risky Fixes

✅ **Safe to add:**
- Primitive values (strings, numbers, booleans)
- Stable references (from props, useState, useContext)
- Values wrapped in `useCallback` or `useMemo`

❌ **Risky to add directly:**
- Functions defined in the component (creates new reference each render → infinite loop)
- Objects/arrays created in the component (same issue)
- Values that trigger the effect's logic

## Warnings Breakdown

### Admin.tsx (8 warnings)

#### 1. Line 229 - Initial Data Fetch
```typescript
useEffect(() => {
  fetchCategories();
  fetchDownloadCategories();
  fetchLevels();
  fetchPlatforms();
}, []);
```

**Issue:** Missing: `fetchCategories`, `fetchDownloadCategories`, `fetchLevels`, `fetchPlatforms`

**Solution:**
```typescript
// Wrap functions in useCallback
const fetchCategories = useCallback(async () => {
  // ... existing code
}, []);

const fetchDownloadCategories = useCallback(async () => {
  // ... existing code
}, []);

// Then the effect is safe:
useEffect(() => {
  fetchCategories();
  fetchDownloadCategories();
  fetchLevels();
  fetchPlatforms();
}, [fetchCategories, fetchDownloadCategories, fetchLevels, fetchPlatforms]);
```

**Alternative:** Add eslint-disable comment if this should only run once:
```typescript
useEffect(() => {
  fetchCategories();
  // ...
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

#### 2-4. Lines 320, 437, 445 - Category/Platform Dependencies
Similar pattern - wrap functions in `useCallback` or add eslint-disable with comment explaining why.

#### 5-7. Lines 568, 575, 659 - Data Fetching & Navigation
These are complex effects with multiple dependencies. Requires refactoring to extract stable functions.

#### 8. Line 1900 - Players Fetch
Same pattern as #1.

### Leaderboards.tsx (1 warning)

#### Line 78 - Platform Selection
```typescript
useEffect(() => {
  // ... uses selectedPlatform
}, [selectedCategory, selectedRunType]);
```

**Fix:** Add `selectedPlatform` to dependencies:
```typescript
}, [selectedCategory, selectedRunType, selectedPlatform]);
```

### PlayerDetails.tsx (1 warning)

#### Line 85 - Current User
Similar to above - add `currentUser` to dependencies.

### RunDetails.tsx (1 warning)

#### Line 414 - Run Data
Add `run` to dependencies or wrap in useCallback.

### SubmitRun.tsx (1 warning)

#### Line 74 - Form Data
```typescript
useEffect(() => {
  // uses formData.category and formData.level
}, [formData.leaderboardType]);
```

**Fix:**
```typescript
}, [formData.leaderboardType, formData.category, formData.level]);
```

### UserSettings.tsx (1 warning)

#### Line 111 - Fetch Unclaimed Runs
Wrap fetch functions in useCallback.

## Step-by-Step Fixing Process

For each warning:

1. **Identify the hook and what it does**
   - When should it run?
   - What triggers it?

2. **Check if dependencies will cause infinite loops**
   - Does adding the dependency change the dependency itself?
   - Is the value created fresh each render?

3. **Choose the right fix:**

   **Option A: Wrap in useCallback**
   ```typescript
   const fetchData = useCallback(async () => {
     // ... code
   }, []); // Add any dependencies the function needs
   
   useEffect(() => {
     fetchData();
   }, [fetchData]); // Now safe!
   ```

   **Option B: Move function inside useEffect**
   ```typescript
   useEffect(() => {
     const fetchData = async () => {
       // ... code
     };
     fetchData();
   }, []); // Dependencies clear
   ```

   **Option C: Add explicit ignore comment**
   ```typescript
   useEffect(() => {
     // Should only run on mount
     fetchInitialData();
   }, []); // eslint-disable-line react-hooks/exhaustive-deps
   ```

## Priority Order

### High Priority (User-facing impact)
1. ✅ `Leaderboards.tsx` - Line 78 (selectedPlatform)
2. ✅ `SubmitRun.tsx` - Line 74 (formData fields)
3. ✅ `PlayerDetails.tsx` - Line 85 (currentUser)

### Medium Priority (Admin features)
4. `Admin.tsx` - Lines 229, 568, 575 (data fetching)

### Low Priority (Nice to have)
5. Other Admin.tsx warnings
6. `RunDetails.tsx` - Line 414

## Testing After Fixes

After fixing each warning:

1. **Check for infinite loops:**
   ```bash
   # Open browser console
   # Watch for repeated network requests
   # Check React DevTools for re-renders
   ```

2. **Test the functionality:**
   - Does the component still work?
   - Are effects triggered at the right time?
   - Are there any new bugs?

3. **Performance check:**
   - Are there unnecessary re-renders?
   - Are effects running too frequently?

## Quick Wins (Low Risk Fixes)

These can be fixed immediately with minimal risk:

```typescript
// Leaderboards.tsx:78
}, [selectedCategory, selectedRunType, selectedPlatform]);

// SubmitRun.tsx:74
}, [formData.leaderboardType, formData.category, formData.level]);

// PlayerDetails.tsx:85
}, [playerDocId, currentUser]);

// RunDetails.tsx:414
}, [runDocId, run]);
```

## Resources

- [React Hooks FAQ](https://react.dev/reference/react/hooks)
- [useEffect dependencies](https://react.dev/reference/react/useEffect#specifying-reactive-dependencies)
- [useCallback hook](https://react.dev/reference/react/useCallback)

## Current Status

- **Total Warnings:** 21
- **High Priority:** 3
- **Medium Priority:** 3
- **Low Priority:** 15

**Estimated Time to Fix All:** 2-3 hours
**Risk Level:** Medium (requires testing)

