// The signature visual motif of the app: a ring that depletes as time
// runs out. Used for the real chat countdown, and echoed (idle/looping)
// on the landing page and waiting screen so the whole product shares one
// visual language tied to its actual mechanic, not just decoration.
export default function CountdownRing({
  progress, // 0 to 1, 1 = full time remaining, 0 = expired
  size = 120,
  strokeWidth = 6,
  urgent = false,
  children,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <div className="countdown-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgent ? "var(--danger)" : "var(--signal)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s ease" }}
        />
      </svg>
      {children && <div className="countdown-ring-content">{children}</div>}
    </div>
  );
}
