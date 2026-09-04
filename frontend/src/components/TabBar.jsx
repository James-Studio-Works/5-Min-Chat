import { HomeIcon, CameraIcon, ChatIcon, UserIcon } from "../icons/Icons.jsx";

const TABS = [
  { id: "feed", label: "Feed", Icon: HomeIcon },
  { id: "newpost", label: "Post", Icon: CameraIcon },
  { id: "chat", label: "Chat", Icon: ChatIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
];

export default function TabBar({ activeTab, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`tab-btn ${activeTab === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          <span className="tab-icon">
            <Icon size={22} strokeWidth={activeTab === id ? 2.3 : 1.8} />
          </span>
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
