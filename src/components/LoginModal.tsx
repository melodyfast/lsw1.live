"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { isDisplayNameAvailable } from "@/lib/db";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [srcUsername, setSrcUsername] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate password strength
  const validatePassword = (password: string): { valid: boolean; message?: string } => {
    if (password.length < 8) {
      return { valid: false, message: "Password must be at least 8 characters long." };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: "Password must contain at least one uppercase letter." };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: "Password must contain at least one lowercase letter." };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: "Password must contain at least one number." };
    }
    return { valid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email format
    if (!validateEmail(email.trim())) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate password on signup
    if (!isLogin) {
      // Validate display name
      const trimmedDisplayName = displayName.trim();
      if (!trimmedDisplayName) {
        toast({
          title: "Display Name Required",
          description: "Please enter a display name.",
          variant: "destructive",
        });
        return;
      }

      if (trimmedDisplayName.length < 2) {
        toast({
          title: "Display Name Too Short",
          description: "Display name must be at least 2 characters long.",
          variant: "destructive",
        });
        return;
      }

      if (trimmedDisplayName.length > 50) {
        toast({
          title: "Display Name Too Long",
          description: "Display name must be 50 characters or less.",
          variant: "destructive",
        });
        return;
      }

      // Check if display name is available
      setLoading(true);
      try {
        const isAvailable = await isDisplayNameAvailable(trimmedDisplayName);
        if (!isAvailable) {
          toast({
            title: "Display Name Taken",
            description: "This display name is already taken. Please choose a different one.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to check display name availability. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      setLoading(false);

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        toast({
          title: "Password Requirements Not Met",
          description: passwordValidation.message,
          variant: "destructive",
        });
        return;
      }

      // Check password confirmation on signup
      if (password !== confirmPassword) {
        toast({
          title: "Password Mismatch",
          description: "Password and confirmation password do not match.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Add timeout to prevent hanging
      const authOperation = isLogin 
        ? signInWithEmailAndPassword(auth, email.trim(), password)
        : createUserWithEmailAndPassword(auth, email.trim(), password);
      
      // Race the auth operation against a timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Authentication timeout. Please check your connection."));
        }, 10000);
      });

      const userCredential = await Promise.race([authOperation, timeoutPromise]);
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // If signup, update profile with display name and store SRC username
      if (!isLogin && userCredential && 'user' in userCredential) {
        const user = userCredential.user;
        
        // Update Firebase Auth profile with display name
        if (displayName.trim()) {
          await updateProfile(user, { displayName: displayName.trim() });
        }
        
        // Store display name and SRC username in localStorage temporarily (AuthProvider will read it)
        // This ensures we have the correct values even if Firebase Auth hasn't updated yet
        localStorage.setItem(`displayName_${user.uid}`, displayName.trim());
        if (srcUsername.trim()) {
          localStorage.setItem(`srcUsername_${user.uid}`, srcUsername.trim());
        }
      }
      
      toast({
        title: "Success",
        description: isLogin ? "You have been logged in successfully." : "Your account has been created successfully.",
      });
      // Reset form
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
      setSrcUsername("");
      onOpenChange(false);
    } catch (error: any) {
      // Generic error messages to prevent user enumeration
      let errorMessage = "An error occurred. Please try again.";
      if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled.";
      } else if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        errorMessage = "Invalid email or password.";
      } else if (error.code === "auth/email-already-in-use") {
        errorMessage = "An account with this email already exists.";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please use a stronger password.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!validateEmail(email.trim())) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      // Always show success message to prevent user enumeration
      toast({
        title: "Password Reset Email Sent",
        description: "If an account exists with this email, you will receive password reset instructions.",
      });
    } catch (error: any) {
      // Always show success message to prevent user enumeration
      toast({
        title: "Password Reset Email Sent",
        description: "If an account exists with this email, you will receive password reset instructions.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
        <DialogHeader>
          <DialogTitle className="text-[hsl(220,17%,92%)]">
            {isLogin ? "Login to Your Account" : "Create New Account"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-[hsl(220,17%,92%)]">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-[hsl(220,17%,92%)]"
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-[hsl(220,17%,92%)]">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-[hsl(220,17%,92%)]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold"
            >
              {loading ? "Processing..." : (isLogin ? "Login" : "Sign Up")}
            </Button>
            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="displayName" className="text-[hsl(220,17%,92%)]">
                    Display Name <span className="text-[#fab387]">*</span>
                  </Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    placeholder="Your display name"
                    maxLength={50}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-[hsl(220,17%,92%)]"
                  />
                  <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                    This will be shown on leaderboards and your profile. Must be unique.
                  </p>
                </div>
                <div>
                  <Label htmlFor="srcUsername" className="text-[hsl(220,17%,92%)]">
                    Speedrun.com Username <span className="text-[#fab387] text-xs">(Recommended)</span>
                  </Label>
                  <Input
                    id="srcUsername"
                    type="text"
                    value={srcUsername}
                    onChange={(e) => setSrcUsername(e.target.value)}
                    placeholder="Your SRC username (optional)"
                    maxLength={50}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-[hsl(220,17%,92%)]"
                  />
                  <p className="text-xs text-[#fab387] mt-1 font-medium">
                    💡 We recommend using your Speedrun.com username! This will automatically claim your imported runs.
                  </p>
                  <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                    Enter your exact Speedrun.com username to automatically claim runs imported from Speedrun.com.
                  </p>
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="text-[hsl(220,17%,92%)]">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required={!isLogin}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-[hsl(220,17%,92%)]"
                  />
                  <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                    Password must be at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                </div>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsLogin(!isLogin);
                setPassword("");
                setConfirmPassword("");
                setDisplayName("");
                setSrcUsername("");
              }}
              className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[hsl(234,14%,29%)]"
            >
              {isLogin ? "Need an account? Sign Up" : "Already have an account? Login"}
            </Button>
            {isLogin && (
              <Button
                type="button"
                variant="ghost"
                onClick={handlePasswordReset}
                className="text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)]"
              >
                Forgot Password?
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}