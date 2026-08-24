import { useCallback, useState } from "react";
import Feed from "./components/Feed.jsx";
import NewPost from "./components/NewPost.jsx";
import TabBar from "./components/TabBar.jsx";
import Profile from "./components/Profile.jsx";
import ChatApp from "./ChatApp.jsx";
import { getOrCreatePersistentId } from "./identity.js";
import GoogleLogin from "./components/GoogleLogin.jsx";

// App shell: four tabs. Chat keeps its own fully independent state
// machine (ChatApp.jsx). Feed, NewPost, and Profile are simpler
// components. Viewing someone else's profile (tapping a username in the
// Feed) temporarily overlays the content area regardless of which tab is
// active, with a Back button returning to whatever was showing before.
export default function App() {
  const [activeTab, setActiveTab] = useState("feed");
  const [feedRefreshSignal, setFeedRefreshSignal] = useState(0);
  const [viewingProfileId, setViewingProfileId] = useState(null);

  const myPersistentId = getOrCreatePersistentId();

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

  return (
    <div className="app-shell">
      <GoogleLogin />
      <div className="app-content">
        {viewingProfileId ? (
          <Profile
            persistentId={viewingProfileId}
            onBack={handleBackFromProfile}
            onViewProfile={handleViewProfile}
          />
        ) : (
          <>
            {activeTab === "feed" && <Feed refreshSignal={feedRefreshSignal} onViewProfile={handleViewProfile} />}
            {activeTab === "newpost" && <NewPost onPosted={handlePosted} />}
            {activeTab === "chat" && <ChatApp />}
            {activeTab === "profile" && <Profile persistentId={myPersistentId} onViewProfile={handleViewProfile} />}
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
