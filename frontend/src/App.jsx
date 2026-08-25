import { useCallback, useEffect, useState } from "react";
import Feed from "./components/Feed.jsx";
import NewPost from "./components/NewPost.jsx";
import TabBar from "./components/TabBar.jsx";
import Profile from "./components/Profile.jsx";
import Login from "./components/Login.jsx";
import ChatApp from "./ChatApp.jsx";
import { supabase, isAuthConfigured } from "./supabaseClient.js";

// App shell: four tabs. Chat is fully independent and never requires
// login (ChatApp.jsx, unchanged, anonymous by design). Feed, NewPost, and
// Profile require a real Supabase Auth session - if there isn't one, they
// show the Login screen instead.
export default function App() {
  const [activeTab, setActiveTab] = useState("feed");
  const [feedRefreshSignal, setFeedRefreshSignal] = useState(0);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!isAuthConfigured) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handlePosted = useCallback(() => {
    setFeedRefreshSignal((n) => n + 1);
    setActiveTab("feed");
  }, []);

  const handleViewProfile = useCallback((persistentId) => {
    setViewingProfileId(persistentId);
  }, []);

  const handleBackFromProfile = useCallback(() => {
    setViewingProfileId(null);
  }, []);

  const needsLogin = activeTab !== "chat" && (!isAuthConfigured || (!authLoading && !session));
  const user = session?.user || null;
  const accessToken = session?.access_token || null;

  return (
    <div className="app-shell">
      <div className="app-content">
        {activeTab === "chat" ? (
          <ChatApp />
        ) : authLoading ? (
          <p className="chat-hint" style={{ marginTop: 60 }}>
            Loading…
          </p>
        ) : needsLogin ? (
          <Login />
        ) : viewingProfileId ? (
          <Profile
            persistentId={viewingProfileId}
            currentUser={user}
            accessToken={accessToken}
            onBack={handleBackFromProfile}
            onViewProfile={handleViewProfile}
          />
        ) : (
          <>
            {activeTab === "feed" && (
              <Feed
                refreshSignal={feedRefreshSignal}
                onViewProfile={handleViewProfile}
                currentUser={user}
                accessToken={accessToken}
              />
            )}
            {activeTab === "newpost" && (
              <NewPost onPosted={handlePosted} currentUser={user} accessToken={accessToken} />
            )}
            {activeTab === "profile" && (
              <Profile
                persistentId={user.id}
                currentUser={user}
                accessToken={accessToken}
                onViewProfile={handleViewProfile}
              />
            )}
          </>
        )}
      </div>
      <TabBar
        activeTab={activeTab}
        onChange={(tab) => {
          setViewingProfileId(null);
          setActiveTab(tab);
        }}
      />
    </div>
  );
}
