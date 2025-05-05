import Providers from "@/context/providers";
import { Routes, Route, Navigate } from "react-router-dom";
import Wrapper from "@/components/Wrapper";
import Sidebar from "@/components/navigation/Sidebar";

import { isDesktop, isMobile } from "react-device-detect";
import Statusbar from "./components/Statusbar";
import Bottombar from "./components/navigation/Bottombar";
import { Suspense, lazy, useEffect, useState } from "react";
import { cn } from "./lib/utils";
import { isPWA } from "./utils/isPWA";
import ActivityIndicator from "./components/indicators/activity-indicator";
import axios from "axios";

const Live = lazy(() => import("@/pages/Live"));
const Events = lazy(() => import("@/pages/Events"));
const Exports = lazy(() => import("@/pages/Exports"));
const SubmitPlus = lazy(() => import("@/pages/SubmitPlus"));
const ConfigEditor = lazy(() => import("@/pages/ConfigEditor"));
const System = lazy(() => import("@/pages/System"));
const Settings = lazy(() => import("@/pages/Settings"));
const UIPlayground = lazy(() => import("@/pages/UIPlayground"));
const Logs = lazy(() => import("@/pages/Logs"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get("/profile");
        if (response.status === 200) {
          setIsAuthenticated(true);
          setIsAdmin(response.data.username === "admin"); // Check if the user is an admin
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <ActivityIndicator />
      </div>
    );
  }

  return (
    <Providers>
      <Wrapper>
        <div className="size-full overflow-hidden">
          {isAuthenticated && isDesktop && <Sidebar />}
          {isAuthenticated && isDesktop && <Statusbar />}
          {isAuthenticated && isMobile && <Bottombar />}
          <div
            id="pageRoot"
            className={cn(
              "overflow-hidden size-full relative pb-8",
              isMobile
                ? `bottom-${isPWA ? 16 : 12} left-0 md:bottom-16 landscape:bottom-14 landscape:md:bottom-16`
                : "pl-[70px]"
            )}
          >
            <Suspense fallback={
              <div className="flex items-center justify-center w-full h-full">
                <ActivityIndicator />
              </div>
            }>
              <Routes>
                {!isAuthenticated ? (
                  <>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  </>
                ) : (
                  <>
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/" element={<Live />} />
                    {isAdmin && (
                      <>
                        <Route path="/review" element={<Events />} />
                        <Route path="/export" element={<Exports />} />
                        <Route path="/plus" element={<SubmitPlus />} />
                        <Route path="/config" element={<ConfigEditor />} />
                        <Route path="/logs" element={<Logs />} />
                        <Route path="/playground" element={<UIPlayground />} />
                      </>
                    )}
                    <Route path="/system" element={<System />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/events" element={<Navigate to="/review" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </>
                )}
              </Routes>
            </Suspense>
          </div>
        </div>
      </Wrapper>
    </Providers>
  );
}

export default App;
