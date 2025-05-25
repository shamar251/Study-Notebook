"use client";
import { useEffect, useState } from "react";

function getTimeSince(timestamp: number, currentTime: number): string {
  const seconds = Math.floor((currentTime - timestamp) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval} year${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval} month${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval} day${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval} hour${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval} minute${interval === 1 ? "" : "s"} ago`;
  return `${Math.floor(seconds)} second${seconds === 1 ? "" : "s"} ago`;
}

export default function TimeSince({ timestamp }: { timestamp: number }) {
  // Use null initially to prevent hydration mismatch
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Set the initial time after component mounts on client
    setNow(Date.now());

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Only render the dynamic content after client-side hydration
  if (now === null) {
    return <span>...</span>; // Placeholder during server rendering
  }

  return <span>{getTimeSince(timestamp, now)}</span>;
}
