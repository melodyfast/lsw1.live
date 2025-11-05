import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload, User, Settings, ShieldAlert, Download, Radio, Trophy, Github, MessageCircle, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import LegoStudIcon from "@/components/icons/LegoStudIcon";
import { useAuth } from "@/components/AuthProvider";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { LoginModal } from "@/components/LoginModal";
import { useToast } from "@/hooks/use-toast";

export function Header() {
  const { currentUser, loading } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Logged Out",
        description: "You have been logged out successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to log out.",
        variant: "destructive",
      });
    }
  };

  const NavLinks = () => (
    <>
      <Link 
        to="/leaderboards" 
        className="text-[#cdd6f4] hover:text-[#cdd6f4] transition-all duration-300 relative group"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <span>Leaderboards</span>
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#cdd6f4] via-[#89b4fa] to-[#cdd6f4] transition-all duration-300 group-hover:w-full"></span>
      </Link>
      <Link 
        to="/points" 
        className="text-[#f9e2af] hover:text-[#f9e2af] flex items-center gap-1 transition-all duration-300 relative group"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Trophy className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
        <span>Points</span>
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#f9e2af] via-[#f5c2e7] to-[#f9e2af] transition-all duration-300 group-hover:w-full"></span>
      </Link>
      <Link 
        to="/submit" 
        className="text-[#f5c2e7] hover:text-[#f5c2e7] flex items-center gap-1 transition-all duration-300 relative group"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Upload className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:translate-y-[-2px]" />
        <span>Submit Run</span>
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#f5c2e7] via-[#cba6f7] to-[#f5c2e7] transition-all duration-300 group-hover:w-full"></span>
      </Link>
      <Link 
        to="/live" 
        className="text-[#89b4fa] hover:text-[#89b4fa] flex items-center gap-1 transition-all duration-300 relative group"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Radio className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
        <span>Live</span>
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#89b4fa] via-[#74c7ec] to-[#89b4fa] transition-all duration-300 group-hover:w-full"></span>
      </Link>
      <Link 
        to="/downloads" 
        className="text-[#a6e3a1] hover:text-[#a6e3a1] flex items-center gap-1 transition-all duration-300 relative group"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Download className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:translate-y-[2px]" />
        <span>Downloads</span>
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#a6e3a1] via-[#89dceb] to-[#a6e3a1] transition-all duration-300 group-hover:w-full"></span>
      </Link>
      {currentUser?.isAdmin && (
        <Link 
          to="/admin" 
          className="text-[#f38ba8] hover:text-[#f38ba8] flex items-center gap-1 transition-all duration-300 relative group"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <ShieldAlert className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
          <span>Admin</span>
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#f38ba8] via-[#f5c2e7] to-[#f38ba8] transition-all duration-300 group-hover:w-full"></span>
        </Link>
      )}
    </>
  );

  return (
    <>
      <header className="bg-gradient-to-r from-[hsl(240,21%,15%)] via-[hsl(240,21%,14%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)] shadow-lg">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-4 md:gap-10">
            <Link to="/" className="flex items-center space-x-2 group transition-transform duration-300 hover:scale-105">
              <div className="transition-transform duration-300 group-hover:rotate-12">
                <LegoStudIcon size={32} color="#60a5fa" />
              </div>
              <span className="text-lg md:text-xl font-bold bg-gradient-to-r from-[#60a5fa] to-[#cba6f7] bg-clip-text text-transparent">lsw1.dev</span>
            </Link>
            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-6">
              <NavLinks />
            </nav>
          </div>
          
          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile Menu Sheet */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-[hsl(220,17%,92%)] hover:bg-[#89b4fa]/20 hover:text-[#89b4fa]"
                >
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(240,21%,14%)] border-[hsl(235,13%,30%)]">
                <div className="flex flex-col gap-6 mt-8">
                  <div className="flex items-center space-x-2 mb-4">
                    <LegoStudIcon size={28} color="#60a5fa" />
                    <span className="text-lg font-bold bg-gradient-to-r from-[#60a5fa] to-[#cba6f7] bg-clip-text text-transparent">lsw1.dev</span>
                  </div>
                  <nav className="flex flex-col gap-4">
                    <NavLinks />
                  </nav>
                  <div className="pt-4 border-t border-[hsl(235,13%,30%)]">
                    {loading ? (
                      <div className="text-sm text-muted-foreground">Loading...</div>
                    ) : currentUser ? (
                      <div className="flex flex-col gap-3">
                        <Link 
                          to={`/player/${currentUser.uid}`}
                          className="text-sm text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)] transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          Hi, {currentUser.displayName || currentUser.email?.split('@')[0]}
                        </Link>
                        <Button 
                          variant="outline" 
                          asChild
                          className="w-full text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa]"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Link to="/settings">
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                          </Link>
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            handleLogout();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa]"
                        >
                          Logout
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsLoginOpen(true);
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa] flex items-center gap-2"
                      >
                        <User className="h-4 w-4" />
                        Sign In
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-4 pt-4 border-t border-[hsl(235,13%,30%)]">
                    <a
                      href="https://discord.gg/6A5MNqaK49"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[hsl(222,15%,60%)] hover:text-[#5865F2] transition-colors"
                      aria-label="Discord Server"
                    >
                      <MessageCircle className="h-5 w-5" />
                    </a>
                    <a
                      href="https://github.com/elle-trees/lsw1.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)] transition-colors"
                      aria-label="GitHub Repository"
                    >
                      <Github className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Desktop Social Links & Auth */}
            <div className="hidden md:flex items-center gap-3">
              <a
                href="https://discord.gg/6A5MNqaK49"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(222,15%,60%)] hover:text-[#5865F2] transition-all duration-300 hover:scale-110"
                aria-label="Discord Server"
              >
                <MessageCircle className="h-5 w-5 transition-transform duration-300 hover:rotate-12" />
              </a>
              <a
                href="https://github.com/elle-trees/lsw1.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)] transition-all duration-300 hover:scale-110"
                aria-label="GitHub Repository"
              >
                <Github className="h-5 w-5 transition-transform duration-300 hover:rotate-12" />
              </a>
            {loading ? (
                <Button variant="outline" className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)]">
                  Loading...
                </Button>
              ) : currentUser ? (
                <div className="flex items-center gap-2">
                  <Link 
                    to={`/player/${currentUser.uid}`}
                    className="text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)] mr-2 transition-all duration-300 hover:scale-105 cursor-pointer font-medium"
                  >
                    Hi, {currentUser.displayName || currentUser.email?.split('@')[0]}
                  </Link>
              <Button 
                variant="outline" 
                asChild
                className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa] transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                <Link to="/settings">
                  <Settings className="h-4 w-4 mr-2 transition-transform duration-300 group-hover:rotate-90" />
                  Settings
                </Link>
              </Button>
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa] transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                Logout
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              onClick={() => setIsLoginOpen(true)}
              className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[#89b4fa] hover:border-[#89b4fa] flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
            >
              <User className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              Sign In
            </Button>
          )}
            </div>
          </div>
        </div>
      </header>
      <LoginModal open={isLoginOpen} onOpenChange={setIsLoginOpen} />
    </>
  );
}