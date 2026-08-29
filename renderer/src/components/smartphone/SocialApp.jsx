import React from "react";
import { Heart, Repeat2, MessageCircle, Verified } from "lucide-react";

export default function SocialApp({ feed = [] }) {
  return (
    <div style={{ height: "100%", background: "#000", color: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 15, borderBottom: "1px solid #333", textAlign: "center", fontWeight: "bold" }}>
        CourtSide
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {feed.length === 0 && (
          <div style={{ padding: 20, color: "#666", textAlign: "center" }}>
            El feed está tranquilo... por ahora.
          </div>
        )}

        {feed.map((tweet) => {
          const stats = tweet.engagement || tweet.stats || {};
          const replies = Number.isFinite(Number(stats.replies)) ? Number(stats.replies) : null;
          const retweets = Number.isFinite(Number(stats.retweets)) ? Number(stats.retweets) : null;
          const likes = Number.isFinite(Number(stats.likes)) ? Number(stats.likes) : null;
          const showStats = replies !== null || retweets !== null || likes !== null;
          return (
            <div key={tweet.id} style={{ padding: 15, borderBottom: "1px solid #333", display: "flex", gap: 12, animation: "fadeIn 0.5s" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#333" }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "bold" }}>
                  {tweet.sender} {tweet.verified ? <Verified size={12} color="#1d9bf0" fill="white" style={{ verticalAlign: "middle" }} /> : null}
                </span>
                <span style={{ color: "#666", fontSize: "0.8rem" }}>{tweet.timestamp}</span>
              </div>
              <div style={{ margin: "5px 0" }}>{tweet.body}</div>
              {showStats ? (
                <div style={{ display: "flex", gap: 20, color: "#666", fontSize: "0.8rem", marginTop: 10 }}>
                  {replies !== null ? <span><MessageCircle size={14} /> {replies}</span> : null}
                  {retweets !== null ? <span><Repeat2 size={14} /> {retweets}</span> : null}
                  {likes !== null ? <span><Heart size={14} /> {likes}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
