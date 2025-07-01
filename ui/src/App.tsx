import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider } from "@/components/theme-provider";
import { LoginForm } from '@/components/login-form';
import { Navbar } from '@/components/navbar';
import { AppSidebar } from '@/components/appSidebar';
import { Home } from '@/pages/Home';
import { Settings } from '@/pages/Settings';
import { Page1 } from '@/pages/Page1';
import { Page2 } from '@/pages/Page2';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"></div>;
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col w-full min-h-screen bg-background">
        <Navbar />
        {!user ? (
          <main className="flex flex-col items-center justify-center flex-1 p-4">
            <LoginForm />
          </main>
        ) : (
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset className="flex-1">
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/page1" element={<Page1 />} />
                  <Route path="/page2" element={<Page2 />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </SidebarInset>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="system" 
        enableSystem
        disableTransitionOnChange
        storageKey="volo-app-theme"
      >
        <Router>
          <AppContent />
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
